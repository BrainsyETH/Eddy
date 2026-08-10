// src/lib/load-plan-support.test.ts
// What the plan-support strip still shows when a request does not come back.
//
// Covers eddy-ios/src/lib/loadPlanSupport.ts. This exists as a separate module
// from planSupport.ts precisely so these assertions can be written: "one of
// three requests failed" is orchestration, not a pure rule, and the web suite
// has no renderer to test it through a component. The fetchers are injected, so
// this drives the real coordinator with stubs.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccessPointDetailResponse, FloatPlan, RiverService } from '@eddy/types';
import { loadPlanSupport, type PlanSupportDeps } from '../../../eddy-ios/src/lib/loadPlanSupport';

const flatDistance = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 69;

function plan(over: { putInSlug?: string; takeOutSlug?: string; riverSlug?: string } = {}) {
  return {
    river: { slug: over.riverSlug ?? 'current-river', name: 'Current River' },
    putIn: {
      id: 'p1',
      slug: over.putInSlug,
      name: 'Akers Ferry',
      coordinates: { lat: 37.3767, lng: -91.5561 },
    },
    takeOut: { id: 'p2', slug: over.takeOutSlug, name: 'Pulltite', coordinates: { lat: 37.3, lng: -91.5 } },
  } as unknown as FloatPlan;
}

function detailFor(name: string): AccessPointDetailResponse {
  return {
    accessPoint: { nearbyServices: [{ name, type: 'outfitter' }] },
  } as unknown as AccessPointDetailResponse;
}

function shuttle(over: Partial<RiverService> = {}): RiverService {
  return {
    id: 'svc-1',
    name: 'Jadwin Canoe Rental',
    type: 'outfitter',
    phone: '573-555-0199',
    website: null,
    latitude: 37.38,
    longitude: -91.55,
    servicesOffered: ['shuttle'],
    ...over,
  } as RiverService;
}

function deps(over: Partial<PlanSupportDeps> = {}): PlanSupportDeps {
  return {
    fetchDetail: async (_river, accessSlug) => detailFor(`Outfitter at ${accessSlug}`),
    fetchServices: async () => [shuttle()],
    distance: flatDistance,
    ...over,
  };
}

test('all three lanes populate the strip', () => {
  return loadPlanSupport(plan({ putInSlug: 'akers', takeOutSlug: 'pulltite' }), deps()).then(
    (data) => {
      assert.deepEqual(data.groups.putIn.rentals.map((s) => s.name), ['Outfitter at akers']);
      assert.deepEqual(data.groups.takeOut.rentals.map((s) => s.name), ['Outfitter at pulltite']);
      assert.deepEqual(data.nearest.map((r) => r.service.name), ['Jadwin Canoe Rental']);
    },
  );
});

test('one endpoint request failing leaves the other group and the ranking intact', async () => {
  // The assertion this module exists for. Promise.all would have discarded two
  // good results because a third rejected; every lane here is independently
  // worth drawing.
  const data = await loadPlanSupport(
    plan({ putInSlug: 'akers', takeOutSlug: 'pulltite' }),
    deps({
      fetchDetail: async (_river, accessSlug) => {
        if (accessSlug === 'akers') throw new Error('500');
        return detailFor('Outfitter at pulltite');
      },
    }),
  );

  assert.deepEqual(data.groups.putIn.rentals, [], 'the failed end is empty, not fabricated');
  assert.deepEqual(data.groups.takeOut.rentals.map((s) => s.name), ['Outfitter at pulltite']);
  assert.equal(data.nearest.length, 1, 'the ranking is unaffected by an endpoint failure');
});

test('the services request failing leaves both endpoint groups intact', async () => {
  const data = await loadPlanSupport(
    plan({ putInSlug: 'akers', takeOutSlug: 'pulltite' }),
    deps({ fetchServices: async () => { throw new Error('offline'); } }),
  );
  assert.equal(data.groups.putIn.rentals.length, 1);
  assert.equal(data.groups.takeOut.rentals.length, 1);
  assert.deepEqual(data.nearest, []);
});

test('every request failing is silence, not a rejection', async () => {
  // A plan with no outfitter list is still a plan. The caller renders nothing
  // rather than an error, which is what the strip this replaced already did.
  const data = await loadPlanSupport(
    plan({ putInSlug: 'akers', takeOutSlug: 'pulltite' }),
    deps({
      fetchDetail: async () => { throw new Error('500'); },
      fetchServices: async () => { throw new Error('offline'); },
    }),
  );
  assert.deepEqual(data.nearest, []);
  assert.deepEqual(data.groups.putIn.rentals, []);
  assert.deepEqual(data.groups.takeOut.rentals, []);
});

test('an endpoint with no slug is skipped rather than requested', async () => {
  // MapAccessPoint.slug is optional and a shared float arrives from the API
  // without one. That is a normal state, so it must not fire a request that
  // cannot be built — and must not be reported as a failure either.
  const asked: string[] = [];
  const data = await loadPlanSupport(
    plan({ putInSlug: 'akers' }),
    deps({
      fetchDetail: async (_river, accessSlug) => {
        asked.push(accessSlug);
        return detailFor(`Outfitter at ${accessSlug}`);
      },
    }),
  );
  assert.deepEqual(asked, ['akers'], 'only the end that had a slug was requested');
  assert.equal(data.groups.takeOut.rentals.length, 0);
});

test('a plan with no river slug asks for nothing at all', async () => {
  let called = false;
  const data = await loadPlanSupport(
    { ...plan(), river: undefined } as unknown as FloatPlan,
    deps({
      fetchServices: async () => {
        called = true;
        return [];
      },
    }),
  );
  assert.equal(called, false);
  assert.deepEqual(data.nearest, []);
});

test('a provider named at either END is excluded from the ranking below', async () => {
  // Excluding only the put-in's associations would be the easy mistake, since
  // that is where the distance is measured from — and it would list a take-out
  // outfitter twice, once as an association and once with a mileage.
  const data = await loadPlanSupport(
    plan({ takeOutSlug: 'pulltite' }),
    deps({
      fetchDetail: async () => detailFor('Jadwin Canoe Rental'),
      fetchServices: async () => [shuttle({ name: 'Jadwin Canoe Rental, LLC', phone: null, website: 'jadwin.com' })],
    }),
  );
  assert.deepEqual(data.groups.takeOut.rentals.map((s) => s.name), ['Jadwin Canoe Rental']);
  assert.deepEqual(data.nearest, [], 'the take-out association suppressed the ranked duplicate');
});
