import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLakeSection, lakeSectionHasContent } from './section';
import { LAKES } from './registry';
import type { LaunchRow } from './store';

const NOW = Date.parse('2026-11-09T19:00:00Z');
const h = (n: number) => NOW - n * 3_600_000;

function row(overrides: Partial<LaunchRow> = {}): LaunchRow {
  return {
    id: '00000000-0000-4000-8000-000000000001', lake_slug: 'truman', slug: 'long-shoal', name: 'Long Shoal', longitude: -93.4737, latitude: 38.2668,
    launch_methods: ['trailer'], amenities: ['courtesy_dock', 'parking'], managing_agency: 'COE', fee_required: false,
    ramp_bottom_elev_ft: 704, ramp_closure_elev_ft: 724, elev_datum: 'NGVD29', elev_source: 'USACE Kansas City District boat ramp layer', elev_source_updated_at: '2024-12-09T00:00:00.000Z',
    access_point_id: null, ...overrides,
  };
}

test('the section carries the pool with a live staleness band, its position, the signed changes and the history', () => {
  const lake = LAKES['table-rock'];
  const history = [0, 1, 2, 23, 24, 25, 167, 168, 169].map((n) => ({ at: h(n), elevationFt: 916.4 - n * 0.005 }));
  const section = buildLakeSection({
    lake,
    pool: { value: 916.4, unit: 'ft', at: new Date(h(0)).toISOString(), staleness: 'fresh' },
    history,
    launches: [],
    now: NOW + 7 * 3_600_000,
  });
  assert.equal(section.pool?.valueFt, 916.4);
  assert.equal(section.pool?.staleness, 'stale', 're-banded on the serving clock, not the frozen wire band');
  assert.equal(section.pool?.daily, undefined, 'an hourly lake does not say daily');
  assert.equal(section.poolPosition, 'within_operating_range');
  assert.equal(section.change24hFt, 0.12);
  assert.equal(section.change7dFt, 0.84);
  assert.equal(section.history.length, 6, 'the wire window is seven days back from the serving clock, which the 167–169 h points fall outside');
  assert.equal(section.operatingRange?.conservationFt, 915);
  assert.equal(section.cautionsVerified, false);
  assert.ok(section.sources.includes('Eddy pool record'));
  assert.equal(lakeSectionHasContent(section), true);
});

test('Truman is daily by the registry, not by anything the dam snapshot says: label and tolerance both follow', () => {
  const truman = LAKES.truman;
  // Ameren's Truman metric carries no dailyMean. The readings are stamped at
  // Central midnight, so the previous one sits 24 h back, and the one before 48 h.
  const pool = { value: 706.3, unit: 'ft', at: new Date(h(19)).toISOString(), staleness: 'stale' as const };
  const history = [19, 43, 67, 187].map((n) => ({ at: h(n), elevationFt: 706.3 - (n - 19) * 0.01, daily: true }));
  const section = buildLakeSection({ lake: truman, pool, history, launches: [], now: NOW });
  assert.equal(section.pool?.daily, true, 'the label comes from the registry cadence');
  assert.equal(section.change24hFt, 0.24);
  assert.equal(section.change7dFt, 1.68, 'a 7-day change over daily readings uses the daily tolerance');
  // A 39-hour gap between the newest two readings puts the earlier one 15 h from the 24 h target, outside the daily tolerance of 14 h.
  const gappy = [19, 58, 82].map((n) => ({ at: h(n), elevationFt: 706 + n * 0.01, daily: true }));
  assert.equal(buildLakeSection({ lake: truman, pool, history: gappy, launches: [], now: NOW }).change24hFt, undefined);
});

test('a lake with no pool reading and no launches has an honest, empty section that the page does not draw', () => {
  const lake = { ...LAKES.truman, operatingRange: undefined };
  const section = buildLakeSection({ lake, pool: undefined, history: [], launches: [], now: NOW });
  assert.equal(section.pool, undefined);
  assert.equal(section.operatingRange, undefined);
  assert.equal(section.poolPosition, undefined);
  assert.equal(section.change24hFt, undefined);
  assert.deepEqual(section.history, []);
  assert.equal(lakeSectionHasContent(section), false);
  assert.equal(lakeSectionHasContent(null), false);
});

test('movement ends at the displayed observation even when the history collector lags or runs ahead', () => {
  const lake = LAKES['table-rock'];
  const pool = { value: 915.6, unit: 'ft', at: new Date(h(1)).toISOString(), staleness: 'fresh' as const };
  const history = [{ at: h(0), elevationFt: 999 }, { at: h(25), elevationFt: 915.4 }];
  assert.equal(buildLakeSection({ lake, pool, history, launches: [], now: NOW }).change24hFt, .2);
  const oldHistory = [{ at: h(50), elevationFt: 915 }, { at: h(74), elevationFt: 914 }];
  assert.equal(buildLakeSection({ lake, pool, history: oldHistory, launches: [], now: NOW }).change24hFt, undefined, 'a previous pair of daily readings cannot supply today’s change');
  assert.equal(buildLakeSection({ lake, history, launches: [], now: NOW }).change24hFt, undefined, 'no displayed observation means no current change');
});

test('unreviewed thresholds never leave the server; reviewed cautions also require a current pool and matching datum', () => {
  const truman = LAKES.truman;
  const dayOld = { value: 703.5, unit: 'ft', at: new Date(h(20)).toISOString(), staleness: 'stale' as const };
  const unverified = buildLakeSection({ lake: truman, pool: dayOld, history: [], launches: [row()], now: NOW });
  const launch = unverified.launches[0];
  assert.deepEqual(launch.launchMethods, ['trailer']);
  assert.deepEqual(launch.amenities, ['courtesy_dock', 'parking']);
  assert.equal(launch.thresholds, undefined, 'the threshold numbers are withheld along with the caution');
  assert.equal(launch.caution, undefined, 'unverified lakes draw no caution even when the arithmetic would');

  const verifiedTruman = { ...truman, rampCautionsVerified: true };
  const verified = buildLakeSection({ lake: verifiedTruman, pool: dayOld, history: [], launches: [row(), row({ id: '2', slug: 'avery', name: 'Avery', ramp_bottom_elev_ft: null, ramp_closure_elev_ft: null, elev_datum: null }), row({ id: '3', slug: 'other-datum', name: 'Other', elev_datum: 'NAVD88' })], now: NOW });
  assert.equal(verified.launches[0].thresholds?.bottomFt, 704);
  assert.equal(verified.launches[0].thresholds?.closureFt, 724);
  assert.equal(verified.launches[0].caution, 'low_water', 'a 20-hour-old daily pool is inside the daily age limit');
  assert.equal(verified.launches[1].thresholds, undefined, 'no thresholds published means no thresholds, not fine');
  assert.equal(verified.launches[1].caution, undefined);
  assert.equal(verified.launches[2].caution, undefined, 'a threshold in another datum is never compared with the pool');

  const twoDaysOld = { ...dayOld, at: new Date(h(40)).toISOString() };
  assert.equal(buildLakeSection({ lake: verifiedTruman, pool: twoDaysOld, history: [], launches: [row()], now: NOW }).launches[0].caution, undefined, 'past the daily age limit the launch shows thresholds and no caution');
  for (const at of ['invalid', new Date(h(-2)).toISOString()]) {
    assert.equal(buildLakeSection({ lake: verifiedTruman, pool: { ...dayOld, at }, history: [], launches: [row()], now: NOW }).launches[0].caution, undefined, 'malformed and future observations cannot produce cautions');
  }
  const hourlyLake = { ...LAKES['table-rock'], rampCautionsVerified: true };
  const sevenHoursOld = { value: 913.0, unit: 'ft', at: new Date(h(7)).toISOString(), staleness: 'stale' as const };
  assert.equal(buildLakeSection({ lake: hourlyLake, pool: sevenHoursOld, history: [], launches: [row({ lake_slug: 'table-rock', ramp_bottom_elev_ft: 914, ramp_closure_elev_ft: 930 })], now: NOW }).launches[0].caution, undefined, 'an hourly source older than six hours is too old for a caution');

  const linked = buildLakeSection({ lake: truman, pool: dayOld, history: [], launches: [row({ access_point_id: 'ap-1', access_point: { slug: 'romp-hole-access', river_slug: 'kings-river', state: 'AR' } })], now: NOW });
  assert.deepEqual(linked.launches[0].accessPoint, { slug: 'romp-hole-access', riverSlug: 'kings-river', state: 'AR' });
});
