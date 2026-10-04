import assert from 'node:assert/strict';
import test from 'node:test';
import type { FloatPlan, RiverAlert, RiverListItem, MapAccessPoint } from '../../../packages/eddy-types';
import { chooseTodayRecommendations } from '../../../eddy-ios/src/lib/todayRecommendation';
import { filterCurrentAlerts } from '../../../eddy-ios/src/lib/todaySafety';
import { agedIndex, envelope } from '../../../eddy-ios/src/lib/offline-cache';
import { createLatestRequest } from '../../../eddy-ios/src/lib/latestRequest';
import { createStorageQueue } from '../../../eddy-ios/src/lib/storageQueue';
import { savedFloatLogistics } from '../../../eddy-ios/src/lib/savedFloatLogistics';
import { pickFirstRunRivers, retainSelectedRivers } from '../../../eddy-ios/src/lib/firstRunRivers';

const river = (id: string): RiverListItem => ({
  id, slug: id, name: id,
  currentCondition: { code: 'good', label: 'Good', thresholdUnit: 'cfs', dischargeCfs: 350,
    gaugeHeightFt: null, readingAgeHours: 0.5, trend: null },
} as RiverListItem);
const notice = (riverSlug: string, severity: RiverAlert['severity'], category = 'Weather'): RiverAlert => ({
  id: `${riverSlug}-${severity}`, source: 'nps', riverSlug, riverName: riverSlug,
  severity, category, title: category, body: '', startsAt: null, endsAt: null, url: null,
});
const inputs = { rivers: [river('current'), river('jacks-fork'), river('meramec')], gauges: [],
  favoriteRiverIds: new Set(['current']), coords: null };

test('agency warnings and local closures remain visible without excluding an entire river', () => {
  const recommendations = chooseTodayRecommendations({ ...inputs,
    notices: [notice('jacks-fork', 'warning'), notice('meramec', 'notice', 'Closure')] });
  assert.deepEqual(recommendations.map((pick) => pick.river.id), ['jacks-fork', 'meramec']);
  assert.equal(recommendations[0].notices[0].severity, 'warning');
  assert.equal(recommendations[1].notices[0].category, 'Closure');
});

test('unavailable agency notices do not suppress gauge-based recommendations', () => {
  assert.deepEqual(
    chooseTodayRecommendations({ ...inputs, notices: null }),
    chooseTodayRecommendations({ ...inputs, notices: [] }),
  );
  assert.equal(chooseTodayRecommendations({ ...inputs, notices: [] }).length, 2);
});

test('suggested-river notices remain on recommendations without leaking into Favorites alerts', () => {
  const watch = notice('jacks-fork', 'watch');
  const picks = chooseTodayRecommendations({ ...inputs, notices: [watch] });
  assert.deepEqual(picks.find((p) => p.river.slug === 'jacks-fork')?.notices, [watch]);
  const favorites = [{ kind: 'river' as const, entityId: 'current', slug: 'current' }];
  assert.deepEqual(filterCurrentAlerts([], [watch], 'favorites', favorites).notices, []);
  assert.deepEqual(filterCurrentAlerts([], [watch], 'all', favorites).notices, [watch]);
});

test('a live snapshot becomes last-known as time passes without a new fetch', () => {
  const fetchedAt = '2026-09-15T08:00:00Z';
  const snapshot = envelope([river('current')], fetchedAt);
  const fresh = agedIndex(snapshot, Date.parse(fetchedAt));
  const later = agedIndex(snapshot, Date.parse(fetchedAt) + 24 * 60 * 60_000);
  assert.equal(fresh[0].currentCondition?.code, 'good');
  assert.equal(later[0].currentCondition?.code, 'unknown');
  assert.equal(later[0].currentCondition?.readingAgeHours, 24.5);
  assert.equal(later[0].currentCondition?.trend, null);
  assert.match(later[0].currentCondition?.label ?? '', /^Last known:/);
  assert.equal(snapshot.payload[0].currentCondition?.code, 'good', 'aging must not mutate its source');
  assert.equal(agedIndex(snapshot, Date.parse(fetchedAt) - 60_000)[0].currentCondition?.readingAgeHours, 0.5);
});

test('changing endpoints invalidates a late response even if the transport ignores cancellation', async () => {
  const requests = createLatestRequest();
  let resolve!: (value: string) => void;
  const response = new Promise<string>((done) => { resolve = done; });
  const previous = requests.start();
  let rendered = 'new selection';
  const work = response.then((plan) => { if (previous.isCurrent()) rendered = plan; });
  requests.invalidate();
  resolve('old plan');
  await work;
  assert.equal(previous.signal.aborted, true);
  assert.equal(rendered, 'new selection');
  const next = requests.start();
  assert.equal(next.isCurrent(), true);
  requests.start();
  assert.equal(next.isCurrent(), false);
});

test('deletion waits for a delayed write and failed writes do not prevent cleanup', async () => {
  const queue = createStorageQueue();
  let value: string | null = null;
  let resolve!: () => void;
  const delay = new Promise<void>((done) => { resolve = done; });
  const save = queue.run(async () => { await delay; value = 'saved trip'; });
  const failed = queue.run(async () => { throw new Error('disk write failed'); });
  const failure = assert.rejects(failed, /disk write failed/);
  const clear = queue.run(async () => { value = null; });
  resolve();
  await Promise.all([save, failure, clear]);
  assert.equal(value, null);
  await queue.run(async () => { value = 'new guest trip'; });
  assert.equal(value, 'new guest trip');
});

test('offline logistics keep access and dated cautions without caching live verdicts or times', () => {
  const point = { id: 'akers', name: 'Akers', riverMile: 16,
    coordinates: { lat: 37.3, lng: -91.5 }, isPublic: false, feeRequired: true,
    description: 'Ask the operator before launching.' } as MapAccessPoint;
  const plan = { putIn: point, takeOut: { ...point, id: 'pulltite' },
    warnings: ['Akers does not have direct road access', 'Water conditions are dangerous - do not float', 'Gauge reading may be inaccurate'], hazards: [],
    condition: { code: 'good' }, floatTime: { minutes: 240 }, driveBack: { minutes: 30 },
  } as unknown as FloatPlan;
  const saved = savedFloatLogistics(plan, '2026-09-15T08:00:00Z');
  assert.equal(saved.putIn.isPublic, false);
  assert.equal(saved.putIn.feeRequired, true);
  assert.deepEqual(saved.putIn.coordinates, point.coordinates);
  assert.deepEqual(saved.warnings, ['Akers does not have direct road access']);
  assert.equal(saved.savedAt, '2026-09-15T08:00:00Z');
  for (const field of ['condition', 'floatTime', 'driveBack']) assert.equal(field in saved, false);
  plan.warnings.push('later');
  assert.equal(saved.warnings.length, 1);
});

test('nearby suggestions retain selected rivers outside the new six without duplicates', () => {
  const catalog = ['current', 'jacks-fork', 'meramec', 'big-piney', 'huzzah', 'eleven-point', 'niangua', 'osage'].map(river);
  const selected = new Set(['current', 'jacks-fork']);
  const nearby = pickFirstRunRivers(catalog, new Map(catalog.map((r, i) => [r.id, 100 - i])));
  assert.equal(nearby.some((r) => r.id === 'current'), false);
  const visible = retainSelectedRivers(nearby, catalog, selected);
  assert.equal(visible.filter((r) => selected.has(r.id)).length, 2);
  assert.equal(new Set(visible.map((r) => r.id)).size, visible.length);
});

function logisticsPlan(): FloatPlan {
  const point = { id: 'akers', name: 'Akers', riverMile: 16,
    coordinates: { lat: 37.3, lng: -91.5 }, isPublic: true, feeRequired: false };
  return { putIn: point, takeOut: { ...point, id: 'pulltite', name: 'Pulltite' },
    warnings: [], hazards: [{ id: 'hazard-1', name: 'Low bridge', riverMile: 18 }],
  } as unknown as FloatPlan;
}

test('failed hazard refreshes preserve saved cautions and their original timestamp', () => {
  const plan = logisticsPlan();
  const saved = savedFloatLogistics(plan, '2026-10-01T08:00:00Z');
  const partial = { ...plan, hazards: [], hazardsUnavailable: true,
    putIn: { ...plan.putIn, description: 'Updated access directions' } };
  const refreshed = savedFloatLogistics(partial, '2026-10-02T08:00:00Z', saved);
  assert.deepEqual(refreshed.hazards, saved.hazards);
  assert.notEqual(refreshed.hazards[0], saved.hazards[0]);
  assert.equal(refreshed.hazardsUnavailable, true);
  assert.equal(refreshed.hazardsSavedAt, saved.savedAt);
  assert.equal(refreshed.putIn.description, 'Updated access directions');
  assert.equal(refreshed.savedAt, '2026-10-02T08:00:00Z');
  const repeated = savedFloatLogistics(partial, '2026-10-03T08:00:00Z', refreshed);
  assert.deepEqual(repeated.hazards, saved.hazards);
  assert.equal(repeated.hazardsSavedAt, saved.savedAt);

  const legacy = { ...saved, hazardsSavedAt: undefined, hazardsUnavailable: undefined };
  assert.equal(savedFloatLogistics(partial, '2026-10-03T08:00:00Z', legacy).hazardsSavedAt, saved.savedAt);
  const recovered = savedFloatLogistics({ ...plan, hazards: [] }, '2026-10-04T08:00:00Z', repeated);
  assert.deepEqual(recovered.hazards, [], 'a successful empty lookup replaces the old inventory');
  assert.equal(recovered.hazardsUnavailable, false);
  assert.equal(recovered.hazardsSavedAt, '2026-10-04T08:00:00Z');
});

test('a first save records unavailable hazards without borrowing cautions from another stretch', () => {
  const plan = logisticsPlan();
  const partial = { ...plan, hazards: [], hazardsUnavailable: true };
  const first = savedFloatLogistics(partial, '2026-10-02T08:00:00Z');
  assert.deepEqual(first.hazards, []);
  assert.equal(first.hazardsUnavailable, true);
  assert.equal(first.hazardsSavedAt, undefined);
  assert.equal(first.putIn.id, plan.putIn.id);
  const otherRoute = savedFloatLogistics({ ...plan, takeOut: { ...plan.takeOut, id: 'round-spring' } });
  assert.deepEqual(savedFloatLogistics(partial, '2026-10-02T08:00:00Z', otherRoute), first);
});
