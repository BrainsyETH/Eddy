import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { estimateRoute, RouteEstimateError } from './route-estimate';
import { routeFixture } from './route-estimate-fixture';
import { savedTimeRangeLabel, validTimeRange } from './saved-time-range';

test('published route range takes priority and scales for low water', async () => {
  const result = await routeFixture({ published: { min: 180, max: 300 }, condition: 'low' }).estimate();
  assert.deepEqual(result.floatTime?.timeRange, { min: 239, max: 399 });
  assert.equal(result.floatTime?.isEstimate, false);
});

test('route service resolves flow and river curve, rather than using a social band shortcut', async () => {
  const flow = await routeFixture({ miles: 7.2, condition: 'good', discharge: 400, reference: 180 }).estimate();
  const band = await routeFixture({ miles: 7.2, condition: 'good' }).estimate();
  assert.notEqual(flow.floatTime?.formatted, band.floatTime?.formatted);
  assert.deepEqual(flow.floatTime?.timeRange, { min: 136, max: 218 });
  const slow = await routeFixture({ condition: 'low', speedCurve: { low: 0.5, too_low: 0.25 } }).estimate();
  assert.equal(slow.floatTime?.timeRange?.min, 480);
});

test('typical route keeps endpoint/published lookup but does not read live water', async () => {
  const fixture = routeFixture({ condition: 'dangerous', published: { min: 180, max: 300 } });
  const result = await fixture.estimate('typical');
  assert.deepEqual(result.floatTime?.timeRange, { min: 180, max: 300 });
  assert.equal(result.estimateBasis, 'typical');
  assert.ok(!fixture.calls.includes('get_river_condition_segment'));
  assert.ok(!fixture.calls.includes('statistics'));
});

test('published times cannot bypass dangerous or regulated withholding', async () => {
  for (const options of [{ condition: 'dangerous' as const }, { riverType: 'dam_tailwater' }]) {
    const result = await routeFixture({ ...options, published: { min: 180, max: 300 } }).estimate();
    assert.equal(result.floatTime, null);
    assert.ok(result.withholdReason);
  }
  assert.equal((await routeFixture({ riverType: 'dam_tailwater' }).estimate('typical')).floatTime, null);
});

test('cross-river endpoints fail before distance or time lookup', async () => {
  const fixture = routeFixture({ wrongRiver: true });
  await assert.rejects(fixture.estimate(), /not on this river/);
  assert.ok(!fixture.calls.includes('get_float_segment'));
});

test('saved previews never manufacture a range from an old average', () => {
  assert.equal(savedTimeRangeLabel({}), null);
  assert.equal(validTimeRange({ min: NaN, max: 200 }), null);
  assert.equal(validTimeRange({ min: 300, max: 200 }), null);
  assert.equal(savedTimeRangeLabel({ estimated_float_min_minutes: 180, estimated_float_max_minutes: 300 }), '~3 hours – ~5 hours');
});

test('all route entry points delegate to the shared service', () => {
  for (const path of ['src/app/api/plan/route.ts', 'src/app/api/route-estimate/route.ts', 'src/lib/agent-tools/planning.ts', 'src/lib/social/post-context.ts', 'src/app/api/favorite-floats/route.ts', 'src/lib/access-points/detail.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /await estimateRoute\(|=>\s*estimateRoute\(/, path);
  }
});


test('real PostgREST client distinguishes missing rivers/vessels from database failures', async () => {
  for (const target of ['rivers', 'vessel_types']) {
    for (const failure of [false, true]) {
      const client = createClient<Database>('https://fixture.supabase.co', 'offline-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async (input, init) => {
          const table = new URL(String(input)).pathname.split('/').at(-1);
          if (table === target && failure) return Response.json({ code: '08006', message: 'Database unavailable' }, { status: 503 });
          const rows = table === target ? [] : table === 'rivers' ? [{ id: 'river', name: 'Fixture river', slug: 'fixture', river_type: 'spring_fed_float' }] : table === 'access_points' ? [
            { id: 'put-in', river_id: 'river', approved: true, is_float_endpoint: true },
            { id: 'take-out', river_id: 'river', approved: true, is_float_endpoint: true },
          ] : [];
          // Model the wire protocol, rather than making .single() return an
          // impossible null/no-error result for an empty table.
          if (new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object+json')) {
            return rows.length === 1 ? Response.json(rows[0]) : Response.json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object' }, { status: 406 });
          }
          return Response.json(rows);
        } },
      });
      await assert.rejects(
        estimateRoute(client, { riverId: 'river', startId: 'put-in', endId: 'take-out', vesselTypeId: 'missing-vessel' }),
        error => error instanceof RouteEstimateError && error.status === (failure ? 500 : 404),
        `${target}: failure=${failure}`,
      );
    }
  }
});


test('shared web estimator escalates fresh in-span flood readings and preserves the anchor', async () => {
  const result = await routeFixture({ condition: 'good', spanReading: { height: 6 } }).estimate();
  assert.equal(result.conditionCode, 'dangerous');
  assert.equal(result.anchorCondition?.condition_code, 'good');
  assert.equal(result.floatTime, null);
  assert.equal(result.spanCheckComplete, true);
  assert.equal(result.contributingGauges[0].usgsSiteId, 'span-gauge');
});

test('suspect or undated span readings cannot escalate a web plan and mark coverage incomplete', async () => {
  for (const spanReading of [{ height: 6, qualifiers: ['Ice'] }, { height: 6, timestamp: 'invalid' }]) {
    const result = await routeFixture({ condition: 'good', spanReading }).estimate();
    assert.equal(result.conditionCode, 'good');
    assert.equal(result.spanCheckComplete, false);
    assert.equal(result.contributingGauges.length, 0);
  }
});


test('nearby calculations share metadata but independently verify live water and endpoints', async () => {
  const fixture = routeFixture();
  await Promise.all([fixture.estimate(), fixture.estimate()]);
  assert.equal(fixture.calls.filter((call) => call === 'rivers').length, 1);
  assert.equal(fixture.calls.filter((call) => call === 'vessel_types').length, 1);
  assert.equal(fixture.calls.filter((call) => call === 'access_points').length, 2);
  assert.equal(fixture.calls.filter((call) => call === 'get_river_condition_segment').length, 2);
});


test('cached geometry cannot bypass endpoint verification or live danger withholding', async () => {
  let geometryReads = 0;
  const segmentReader = async () => {
    geometryReads++;
    return { distance_miles: 8, start_river_mile: 0, end_river_mile: 8,
      start_name: 'Put in', end_name: 'Take out', segment_geom: null };
  };
  const dangerous = routeFixture({ condition: 'dangerous', segmentReader });
  assert.equal((await dangerous.estimate()).floatTime, null);
  assert.ok(dangerous.calls.includes('get_river_condition_segment'));
  assert.ok(dangerous.calls.includes('access_points'));
  assert.ok(!dangerous.calls.includes('get_float_segment'));
  assert.equal(geometryReads, 1);
  const wrongRiver = routeFixture({ wrongRiver: true, segmentReader });
  await assert.rejects(wrongRiver.estimate(), /not on this river/);
  assert.equal(geometryReads, 1);
});


test('unrated live fallback retains readings and quotes only typical times', async () => {
  for (const published of [undefined, { min: 180, max: 300 }]) {
    const result = await routeFixture({ condition: 'unknown', unratedFallback: true,
      published, discharge: 4000, reference: 100 }).estimate();
    const typical = await routeFixture({ published }).estimate('typical');
    assert.equal(result.conditionCode, 'unknown');
    assert.equal(result.condition.gauge_height_ft, 5.8);
    assert.equal(result.estimateBasis, 'typical');
    assert.deepEqual(result.floatTime?.timeRange, typical.floatTime?.timeRange);
    assert.equal(result.withholdReason, null);
  }
});


test('route status distinguishes missing observations on rated and unrated gauges', async () => {
  for (const rated of [false, true]) {
    const result = await routeFixture({ condition: 'unknown', missingReading: true,
      unratedFallback: !rated, ratedFallback: rated }).estimate();
    assert.deepEqual(result.availability, { ratingStatus: rated ? 'rated' : 'unrated', readingStatus: 'unavailable' });
    assert.equal(result.conditionStatusLabel, rated ? 'Gauge data unavailable' : 'Not rated · Gauge data unavailable');
    assert.equal(result.estimateBasis, 'typical');
  }
});
