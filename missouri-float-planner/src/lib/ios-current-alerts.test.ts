import assert from 'node:assert/strict';
import test from 'node:test';
import type { HighWaterEntry, RiverAlert } from '../../../packages/eddy-types';
import {
  currentAlertsSummary, decodeCurrentAlertsFilter, defaultCurrentAlertsFilter,
  filterCurrentAlerts, type AlertFavorite,
} from '../../../eddy-ios/src/lib/todaySafety';

const high = (riverSlug: string | null, conditionCode: 'high' | 'dangerous' = 'high'): HighWaterEntry => ({
  id: `river:${riverSlug}`, kind: 'river', name: riverSlug ?? 'Unlinked gauge', subtitle: null,
  conditionCode, conditionLabel: conditionCode, readingValue: 12, readingUnit: 'ft', readingAgeHours: 0.5,
  riverSlug, siteId: null, damId: null,
});
const notice = (riverSlug: string, severity: RiverAlert['severity'] = 'watch'): RiverAlert => ({
  id: `notice:${riverSlug}`, source: 'nps', riverSlug, riverName: riverSlug, severity,
  category: 'Closure', title: 'Access closed', body: '', startsAt: null, endsAt: null, url: null,
});
const highWater = [high('current'), high('jacks-fork'), high('meramec', 'dangerous'), high(null, 'dangerous')];
const notices = [notice('current'), notice('jacks-fork'), notice('meramec', 'warning')];
const favorites: AlertFavorite[] = [{ kind: 'river', entityId: 'current', slug: 'current' }];
const fresh = { high: false, notices: false };

for (const saved of [favorites, []]) {
  test(`Today and the destination match with ${saved.length} favorites`, () => {
    const filter = defaultCurrentAlertsFilter(saved);
    assert.equal(filter, saved.length ? 'favorites' : 'all');
    const fromToday = currentAlertsSummary(highWater, notices, filter, saved, fresh);
    const destination = currentAlertsSummary(highWater, notices, decodeCurrentAlertsFilter(filter), saved, fresh);
    assert.deepEqual(destination, fromToday);
    assert.equal(destination.count, saved.length ? 2 : 7);
  });
}

test('Favorites excludes unrelated nearby and suggested rivers; All Alerts includes every severity', () => {
  const filtered = filterCurrentAlerts(highWater, notices, 'favorites', favorites);
  assert.deepEqual(filtered.high.map((entry) => entry.riverSlug), ['current']);
  assert.deepEqual(filtered.notices.map((entry) => entry.riverSlug), ['current']);
  assert.deepEqual(filterCurrentAlerts(highWater, notices, 'all', favorites), { high: highWater, notices });
  // Switching back does not broaden or mutate the saved selection.
  assert.deepEqual(filterCurrentAlerts(highWater, notices, 'favorites', favorites), filtered);
});

test('saved rivers include their gauges, while saved gauges and dams match their own identity', () => {
  const gauge: HighWaterEntry = { ...high('current'), kind: 'gauge', id: 'gauge:station-id', siteId: '07067000' };
  const otherGauge: HighWaterEntry = { ...gauge, id: 'gauge:other', siteId: '07068000' };
  const dam: HighWaterEntry = { ...high('osage'), kind: 'dam', id: 'dam:bagnell', damId: 'bagnell' };
  const unlinked: HighWaterEntry = { ...gauge, id: 'gauge:unlinked', riverSlug: null, siteId: 'unlinked' };
  const entries = [...highWater, gauge, otherGauge, dam, unlinked];
  assert.deepEqual(filterCurrentAlerts(entries, notices, 'favorites', favorites).high, [highWater[0], gauge, otherGauge]);
  const saved: AlertFavorite[] = [
    { kind: 'gauge', entityId: 'station-id', slug: 'current', usgsSiteId: '07067000' },
    { kind: 'dam', entityId: 'bagnell', slug: 'osage' },
    { kind: 'gauge', entityId: 'unlinked', slug: '' },
  ];
  const result = filterCurrentAlerts(entries, [...notices, notice('osage')], 'favorites', saved);
  assert.deepEqual(result.high, [gauge, dam, unlinked]);
  assert.deepEqual(result.notices.map((entry) => entry.riverSlug), ['current', 'osage']);
  assert.equal(defaultCurrentAlertsFilter(saved), 'favorites');
  assert.deepEqual(filterCurrentAlerts([gauge], [], 'favorites', [
    { kind: 'gauge', entityId: 'legacy-id', slug: '', usgsSiteId: '07067000' },
  ]).high, [gauge]);
});

test('Favorites stays empty after the last favorite is removed instead of expanding to All Alerts', () => {
  assert.deepEqual(filterCurrentAlerts(highWater, notices, 'favorites', []), { high: [], notices: [] });
});

test('missing, invalid and old scope links safely open All Alerts', () => {
  for (const value of [undefined, [], ['favorites'], '', 'nearby', 'statewide', '{',
    JSON.stringify({ version: 1, kind: 'favorites', slugs: ['current'], displayed: [] })]) {
    assert.equal(decodeCurrentAlertsFilter(value), 'all');
  }
});

test('zero, loading, partial failure and cached failed refresh remain distinct', () => {
  const summary = (high: HighWaterEntry[] | null, notices: RiverAlert[] | null, failed = fresh) =>
    currentAlertsSummary(high, notices, 'all', [], failed);
  assert.equal(summary([], []).label, 'No alerts');
  assert.equal(summary(null, []).label, 'Checking…');
  assert.equal(summary(null, [], { high: true, notices: false }).label, 'Unable to refresh');
  const partial = summary([high('current', 'dangerous')], null, { high: false, notices: true });
  assert.equal(partial.label, '1+ alerts');
  assert.ok(partial.detail);
  assert.match(summary([high('current', 'dangerous')], null).detail!, /Checking/);
  const cached = summary([high('current', 'dangerous')], [], { high: true, notices: false });
  assert.equal(cached.count, 1);
  assert.match(cached.detail!, /outdated/);
  assert.equal(summary([], [], { high: true, notices: true }).label, 'Unable to refresh');
});
