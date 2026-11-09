import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLakeSection } from './section';
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
  assert.equal(section.poolPosition, 'within_operating_range');
  assert.equal(section.change24hFt, 0.12);
  assert.equal(section.change7dFt, 0.84);
  assert.equal(section.history.length, 6, 'the wire window is seven days back from the serving clock, which the 167–169 h points fall outside');
  assert.equal(section.operatingRange?.conservationFt, 915);
  assert.equal(section.cautionsVerified, false);
  assert.ok(section.sources.includes('Eddy pool record'));
});

test('a lake with no pool reading and no range still has an honest section', () => {
  const lake = { ...LAKES.truman, operatingRange: undefined };
  const section = buildLakeSection({ lake, pool: undefined, history: [], launches: [], now: NOW });
  assert.equal(section.pool, undefined);
  assert.equal(section.operatingRange, undefined);
  assert.equal(section.poolPosition, undefined);
  assert.equal(section.change24hFt, undefined);
  assert.deepEqual(section.history, []);
});

test('launches carry methods, amenities and thresholds, and a caution appears only behind the verified gate in one datum', () => {
  const truman = LAKES.truman;
  const pool = { value: 703.5, unit: 'ft', at: new Date(h(20)).toISOString(), staleness: 'stale' as const, dailyMean: true };
  const unverified = buildLakeSection({ lake: truman, pool, history: [], launches: [row()], now: NOW });
  const launch = unverified.launches[0];
  assert.deepEqual(launch.launchMethods, ['trailer']);
  assert.deepEqual(launch.amenities, ['courtesy_dock', 'parking']);
  assert.equal(launch.thresholds?.bottomFt, 704);
  assert.equal(launch.thresholds?.closureFt, 724);
  assert.equal(launch.caution, undefined, 'unverified lakes draw no caution even when the arithmetic would');
  assert.equal(unverified.pool?.daily, true);

  const verified = buildLakeSection({ lake: { ...truman, rampCautionsVerified: true }, pool, history: [], launches: [row(), row({ id: '2', slug: 'avery', name: 'Avery', ramp_bottom_elev_ft: null, ramp_closure_elev_ft: null, elev_datum: null }), row({ id: '3', slug: 'other-datum', name: 'Other', elev_datum: 'NAVD88' })], now: NOW });
  assert.equal(verified.launches[0].caution, 'low_water');
  assert.equal(verified.launches[1].thresholds, undefined, 'no thresholds published means no thresholds, not fine');
  assert.equal(verified.launches[1].caution, undefined);
  assert.equal(verified.launches[2].caution, undefined, 'a threshold in another datum is never compared with the pool');

  const linked = buildLakeSection({ lake: truman, pool, history: [], launches: [row({ access_point_id: 'ap-1', access_point: { slug: 'romp-hole-access', river_slug: 'kings-river' } })], now: NOW });
  assert.deepEqual(linked.launches[0].accessPoint, { slug: 'romp-hole-access', riverSlug: 'kings-river' });
});
