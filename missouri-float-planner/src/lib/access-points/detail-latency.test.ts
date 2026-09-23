import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccessPointDetailResponse } from '@eddy/types';
import { getAccessPointDetail } from './detail';
import { loadAccessDetail } from '../../../../eddy-ios/src/lib/loadAccessDetail';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const tables: string[] = [], rpcs: string[] = [];
  const points = [0, 1].map((i) => ({ id: `point-${i}`, slug: `point-${i}`, name: `Point ${i}`,
    river_id: 'river', approved: true, is_float_endpoint: true, river_mile_downstream: i * 5,
    location_orig: { coordinates: [-91, 37] }, types: ['campground'] }));
  const routeStarted = deferred<void>();
  const routeResponse = deferred<{ data: unknown; error: Error | null }>();
  const client = {
    from(table: string) {
      tables.push(table);
      const rows: Record<string, unknown> = {
        rivers: { id: 'river', slug: 'river', name: 'River', state: 'MO' },
        access_points: points, river_gauges: null, access_point_services: [],
        vessel_types: { slug: 'canoe' }, campsite_availability: [], campsite_facilities: [],
      };
      assert.ok(table in rows, `unexpected table ${table}`);
      const result = () => ({ data: rows[table], error: null });
      const query = {
        select: () => query, eq: () => query, in: () => query, not: () => query, or: () => query,
        lte: () => query, gte: () => query, order: () => query, limit: () => query,
        single: async () => table === 'access_points' ? { data: points[0], error: null } : result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
    rpc(name: string) {
      rpcs.push(name);
      if (name === 'get_river_condition_segment') return Promise.resolve({ data: [{ condition_code: 'dangerous', gauge_height_ft: 3 }] });
      if (name === 'get_segment_float_time') return Promise.resolve({ data: [] });
      routeStarted.resolve(); return routeResponse.promise;
    },
  } as unknown as Parameters<typeof getAccessPointDetail>[0];
  return { client, tables, rpcs, routeStarted, routeResponse };
}
test('core detail retains camping and neighbours without starting route RPCs', async () => {
  const f = fixture(), phases: string[] = [];
  const result = await getAccessPointDetail(f.client, 'river', 'point-0', {
    includeEstimates: false,
    onTiming: (phase, duration) => { phases.push(phase); assert.ok(duration >= 0); },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.nearbyAccessPoints.length, 1);
  assert.equal(result.data.nearbyAccessPoints[0].estimatedFloatTime, null);
  assert.equal(result.data.nearbyAccessPoints[0].distanceMiles, 5);
  assert.ok(f.tables.includes('campsite_availability'));
  assert.ok(f.tables.includes('campsite_facilities'));
  assert.deepEqual(f.rpcs, []);
  assert.deepEqual(phases, ['river', 'access', 'related', 'estimates', 'camping']);
});
test('default detail still waits for route calculations and tolerates unavailable estimates', async () => {
  const f = fixture(); let settled = false;
  const result = getAccessPointDetail(f.client, 'river', 'point-0').then((r) => { settled = true; return r; });
  await f.routeStarted.promise;
  assert.equal(settled, false);
  assert.deepEqual(f.rpcs, ['get_float_segment']);
  f.routeResponse.resolve({ data: null, error: new Error('route unavailable') });
  const response = await result;
  assert.equal(response.ok, true);
  if (response.ok) assert.equal(response.data.nearbyAccessPoints[0].estimatedFloatTime, null);
});
const core = { accessPoint: { id: 'point-0', isFloatEndpoint: true }, gaugeStatus: null,
  nearbyAccessPoints: [{ id: 'point-1', isFloatEndpoint: true, estimatedFloatTime: null }],
} as AccessPointDetailResponse;
const full = { ...core, nearbyAccessPoints: [{ ...core.nearbyAccessPoints[0], estimatedFloatTime: '~2 hours' }] };
function mobileFixture() {
  const base = deferred<AccessPointDetailResponse>(), estimates = deferred<AccessPointDetailResponse>();
  const controller = new AbortController(), published: AccessPointDetailResponse[] = [];
  const requests: boolean[] = [], errors: string[] = [], statuses: string[] = [];
  const done = loadAccessDetail({
    fetchCore: () => { requests.push(false); return base.promise; },
    fetchEstimates: () => { requests.push(true); return estimates.promise; },
    estimateStatus: (status) => statuses.push(status),
    publish: (detail) => published.push(detail), failed: () => errors.push('core'),
    estimatesFailed: () => errors.push('estimates'), signal: controller.signal,
  });
  return { base, estimates, controller, published, requests, errors, statuses, done };
}
test('core facts render while float estimates remain unresolved', async () => {
  const f = mobileFixture(); f.base.resolve(core); await Promise.resolve();
  assert.deepEqual(f.published, [core]); assert.deepEqual(f.requests, [false, true]);
  assert.deepEqual(f.statuses, ['loading']);
  f.estimates.resolve(full); await f.done; assert.deepEqual(f.published, [core, full]); assert.deepEqual(f.statuses, ['loading', 'ready']);
});
test('estimates failure preserves core details; core failure reports unavailable', async () => {
  const f = mobileFixture(); f.base.resolve(core); await Promise.resolve();
  f.estimates.reject(new Error('timeout')); await f.done;
  assert.deepEqual(f.published, [core]); assert.deepEqual(f.errors, ['estimates']); assert.deepEqual(f.statuses, ['loading', 'failed']);
  const failed = mobileFixture(); failed.base.reject(new Error('offline')); await failed.done;
  assert.deepEqual(failed.requests, [false]); assert.deepEqual(failed.errors, ['core']);
});
test('changing pin suppresses late core and estimate responses', async () => {
  for (const stage of ['core', 'estimates']) {
    const f = mobileFixture();
    if (stage === 'estimates') { f.base.resolve(core); await Promise.resolve(); }
    f.controller.abort(); f.base.resolve(core); f.estimates.resolve(full); await f.done;
    assert.deepEqual(f.published, stage === 'core' ? [] : [core]);
    assert.deepEqual(f.requests, stage === 'core' ? [false] : [false, true]);
  }
});
test('non-launch parks and places without launch neighbours skip enrichment', async () => {
  for (const detail of [
    { ...core, accessPoint: { ...core.accessPoint, isFloatEndpoint: false } },
    { ...core, nearbyAccessPoints: [] },
    { ...core, nearbyAccessPoints: [{ ...core.nearbyAccessPoints[0], isFloatEndpoint: false }] },
  ]) {
    const f = mobileFixture(); f.base.resolve(detail); await f.done;
    assert.deepEqual(f.requests, [false]); assert.deepEqual(f.published, [detail]);
  }
});
test('cancellation suppresses failed requests at either loading stage', async () => {
  for (const stage of ['core', 'estimates']) {
    const f = mobileFixture();
    if (stage === 'estimates') { f.base.resolve(core); await Promise.resolve(); }
    f.controller.abort();
    (stage === 'core' ? f.base : f.estimates).reject(new Error('aborted'));
    await f.done;
    assert.deepEqual(f.errors, []);
  }
});

test('estimate enrichment preserves displayed mileage, ordering and neighbour identity', async () => {
  const f = mobileFixture();
  const initial = { ...core, nearbyAccessPoints: [{ ...core.nearbyAccessPoints[0], distanceMiles: 5 }] };
  f.base.resolve(initial); await Promise.resolve();
  f.estimates.resolve({ ...full, nearbyAccessPoints: [
    { ...full.nearbyAccessPoints[0], distanceMiles: 5.4, name: 'Changed name' },
    { ...full.nearbyAccessPoints[0], id: 'unexpected' },
  ] });
  await f.done;
  assert.deepEqual(f.published[1].nearbyAccessPoints, [
    { ...initial.nearbyAccessPoints[0], estimatedFloatTime: '~2 hours' },
  ]);
});

test('estimate representation avoids camping, linked-service and gauge-summary reads', async () => {
  const f = fixture();
  const pending = getAccessPointDetail(f.client, 'river', 'point-0', { estimatesOnly: true });
  await f.routeStarted.promise;
  f.routeResponse.resolve({ data: null, error: new Error('route unavailable') });
  const result = await pending;
  assert.equal(result.ok, true);
  for (const table of ['campsite_availability', 'campsite_facilities', 'access_point_services', 'river_gauges']) {
    assert.ok(!f.tables.includes(table), table);
  }
});

test('full access detail retains route mileage while lightweight detail uses river miles', async () => {
  const f = fixture();
  const core = await getAccessPointDetail(f.client, 'river', 'point-0', { includeEstimates: false });
  assert.ok(core.ok);
  assert.equal(core.data.nearbyAccessPoints[0].distanceMiles, 5);
  const pending = getAccessPointDetail(f.client, 'river', 'point-0');
  await f.routeStarted.promise;
  f.routeResponse.resolve({ data: [{ distance_miles: '5.43', start_river_mile: '0', end_river_mile: '5' }], error: null });
  const full = await pending;
  assert.ok(full.ok);
  assert.equal(full.data.nearbyAccessPoints[0].distanceMiles, 5.4);
  assert.equal(full.data.nearbyAccessPoints[0].estimatedFloatTime, null); // dangerous-water withholding remains intact
});
