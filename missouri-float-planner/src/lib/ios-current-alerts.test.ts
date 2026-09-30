import assert from 'node:assert/strict';
import test from 'node:test';
import type { HighWaterEntry, MapGauge, RiverAlert, RiverListItem } from '../../../packages/eddy-types';
import {
  chooseTodaySafetyScope, currentAlertsScopeLabel, currentAlertsSummary,
  decodeCurrentAlertsScope, encodeCurrentAlertsScope,
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
const rivers = ['current', 'jacks-fork', 'meramec'].map((slug) => ({ id: slug, slug } as RiverListItem));
const highWater = [high('current'), high('jacks-fork'), high('meramec', 'dangerous'), high(null, 'dangerous')];
const notices = [notice('current'), notice('jacks-fork'), notice('meramec', 'warning')];
const fresh = { high: false, notices: false };

for (const kind of ['favorites', 'nearby', 'statewide'] as const) {
  test(`${kind} summary and decoded destination have identical categories and counts`, () => {
    const scope = kind === 'statewide'
      ? { kind, key: 'statewide' as const, slugs: null }
      : { kind, key: `${kind}:current`, slugs: new Set(['current']) };
    const displayedRiverSlugs = new Set(['jacks-fork']);
    const fromToday = currentAlertsSummary(highWater, notices, { scope, displayedRiverSlugs }, fresh);
    const route = decodeCurrentAlertsScope(encodeCurrentAlertsScope(scope, displayedRiverSlugs));
    assert.equal(route.fallback, false);
    assert.deepEqual(currentAlertsSummary(highWater, notices, route, fresh), fromToday);
    assert.equal(fromToday.count, kind === 'statewide' ? 5 : 4);
    assert.ok(fromToday.high.some((entry) => entry.riverSlug === 'jacks-fork'));
    assert.ok(fromToday.notices.some((entry) => entry.riverSlug === 'jacks-fork'));
    assert.equal(fromToday.high.some((entry) => entry.riverSlug === null), kind === 'statewide');
  });
}

test('favorites win over location; nearby resolves gauge-associated rivers before the route is encoded', () => {
  const gauges = [
    { coordinates: { lat: 37, lng: -91 }, thresholds: [{ riverId: 'current', isPrimary: true }] },
    { coordinates: { lat: 42, lng: -91 }, thresholds: [{ riverId: 'meramec', isPrimary: true }] },
  ] as MapGauge[];
  const inputs = { rivers, gauges, coords: { lat: 37, lng: -91 } };
  assert.equal(chooseTodaySafetyScope({ ...inputs, favoriteRiverSlugs: new Set(['meramec']) }).kind, 'favorites');
  const nearby = chooseTodaySafetyScope({ ...inputs, favoriteRiverSlugs: new Set() });
  assert.deepEqual([...nearby.slugs!], ['current']);
  assert.deepEqual([...decodeCurrentAlertsScope(encodeCurrentAlertsScope(nearby, new Set())).scope.slugs!], ['current']);
  assert.equal(chooseTodaySafetyScope({ ...inputs, favoriteRiverSlugs: new Set(), coords: null }).kind, 'statewide');
});

test('invalid and absent deep-link scopes fall back to labeled statewide warnings', () => {
  const valid = { version: 1, kind: 'favorites', slugs: ['current'], displayed: [] };
  for (const value of [undefined, [], ['one', 'two'], '', 'null', '{', JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, slugs: ['../current'] }), JSON.stringify({ ...valid, displayed: 'current' }),
    JSON.stringify({ ...valid, kind: 'unknown' }), JSON.stringify({ ...valid, slugs: [] }),
    JSON.stringify({ ...valid, slugs: Array(251).fill('current') })]) {
    const selection = decodeCurrentAlertsScope(value);
    assert.equal(selection.fallback, true);
    assert.equal(currentAlertsScopeLabel(selection), 'Statewide warnings');
    const summary = currentAlertsSummary(highWater, notices, selection, fresh);
    assert.deepEqual(summary.high.map((entry) => entry.riverSlug), ['meramec', null]);
    assert.deepEqual(summary.notices.map((entry) => entry.riverSlug), ['meramec']);
  }
});

test('an empty nearby scope remains empty instead of silently expanding statewide', () => {
  const selection = decodeCurrentAlertsScope(encodeCurrentAlertsScope({ kind: 'nearby', key: 'nearby:', slugs: new Set() }, new Set()));
  assert.equal(selection.fallback, false);
  assert.equal(currentAlertsSummary(highWater, notices, selection, fresh).count, 0);
  assert.equal(currentAlertsScopeLabel(selection), 'Near you');
});

test('scope captions disclose extra suggestions without claiming a new geographic scope', () => {
  const scope = { kind: 'nearby' as const, key: 'nearby:current', slugs: new Set(['current']) };
  assert.equal(currentAlertsScopeLabel({ scope, displayedRiverSlugs: new Set(['current']) }), 'Near you');
  assert.equal(currentAlertsScopeLabel({ scope, displayedRiverSlugs: new Set(['jacks-fork']) }), 'Nearby and suggested rivers');
});

test('zero, loading, partial failure and cached failed refresh remain distinct', () => {
  const selection = decodeCurrentAlertsScope(undefined);
  assert.equal(currentAlertsSummary([], [], selection, fresh).label, 'No alerts');
  assert.equal(currentAlertsSummary(null, [], selection, fresh).label, 'Checking…');
  assert.equal(currentAlertsSummary(null, [], selection, { high: true, notices: false }).label, 'Unable to refresh');
  const partial = currentAlertsSummary([high('current', 'dangerous')], null, selection, { high: false, notices: true });
  assert.equal(partial.label, '1+ alerts');
  assert.ok(partial.detail);
  const loading = currentAlertsSummary([high('current', 'dangerous')], null, selection, fresh);
  assert.match(loading.detail!, /Checking/);
  const cached = currentAlertsSummary([high('current', 'dangerous')], [], selection, { high: true, notices: false });
  assert.equal(cached.count, 1);
  assert.match(cached.detail!, /outdated/);
  assert.equal(currentAlertsSummary([], [], selection, { high: true, notices: true }).label, 'Unable to refresh');
});
