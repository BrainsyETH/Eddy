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
import { planAccessDestination, planCampingDestination } from '../../../eddy-ios/src/lib/planDestinations';
import { createPlanDetailNavigation } from '../../../eddy-ios/src/lib/planDetailNavigation';
import { accessAvailability } from '../../../eddy-ios/src/components/map-sheet/availabilitySource';

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

test('camping and services share two endpoint reads, preserving the correct facility at each end', async () => {
  const calls: string[] = [];
  const data = await loadPlanSupport(plan({ putInSlug: 'cedargrove', takeOutSlug: 'akers' }), deps({
    fetchDetail: async (_river, slug) => {
      calls.push(slug);
      const availability = { facilityId: `camp-${slug}` };
      return { accessPoint: slug === 'cedargrove'
        ? { availability, nearbyServices: [] }
        : { npsCampground: { availability }, nearbyServices: [] },
      } as unknown as AccessPointDetailResponse;
    },
  }));
  assert.deepEqual(calls, ['cedargrove', 'akers']);
  assert.equal(accessAvailability(data.endpoints.putIn)?.facilityId, 'camp-cedargrove');
  assert.equal(accessAvailability(data.endpoints.takeOut)?.facilityId, 'camp-akers');
});

test('a failed endpoint never borrows the other campground availability', async () => {
  const data = await loadPlanSupport(plan({ putInSlug: 'cedargrove', takeOutSlug: 'akers' }), deps({
    fetchDetail: async (_river, slug) => {
      if (slug === 'cedargrove') throw new Error('offline');
      return { accessPoint: { availability: { facilityId: 'akers-camp' } } } as unknown as AccessPointDetailResponse;
    },
  }));
  assert.equal(data.endpoints.putIn, null);
  assert.equal(accessAvailability(data.endpoints.takeOut)?.facilityId, 'akers-camp');
});

test('camping links carry the exact facility and displayed night; older payloads use the place page', () => {
  const point = { slug: 'cedargrove' };
  const availability = { facilityId: 'cedar-facility' } as NonNullable<ReturnType<typeof accessAvailability>>;
  assert.deepEqual(planCampingDestination('current', point, availability, '2026-10-03', true), {
    pathname: '/camping', params: { river: 'current', facility: 'cedar-facility', night: '2026-10-03' },
  });
  const place = planAccessDestination('current', point);
  assert.deepEqual(planCampingDestination('current', point, null, '2026-10-03', true), place);
  assert.deepEqual(planCampingDestination('current', point, availability, '2026-10-03', false), place);
  assert.equal(planAccessDestination('current', {}), null);
  assert.equal(planAccessDestination('', point), null);
});

test('camping links follow the panel when tonight is unmeasured or only a weekend summary exists', () => {
  const summary = {
    facilityId: 'cedar-facility', window: { startDate: '2026-10-09' },
    nights: [{ date: '2026-10-04', status: 'full', sitesOpen: 0, sitesReservable: 6 }],
  } as NonNullable<ReturnType<typeof accessAvailability>>;
  const next = planCampingDestination('current', { slug: 'cedargrove' }, summary, '2026-10-03', true)!;
  assert.equal(next.pathname, '/camping');
  if (next.pathname === '/camping') assert.equal(next.params.night, '2026-10-04');
  const weekend = planCampingDestination('current', { slug: 'cedargrove' }, { ...summary, nights: [] }, '2026-10-03', true)!;
  if (weekend.pathname === '/camping') assert.equal(weekend.params.night, '2026-10-09');
});

test('planner details push once after dismissal and reopen only after leaving and returning', () => {
  const nav = createPlanDetailNavigation();
  const cedar = planAccessDestination('current', { slug: 'cedargrove' })!;
  const akers = planAccessDestination('current', { slug: 'akers' })!;
  nav.open(cedar);
  nav.open(akers); // Rapid second tap cannot replace the pending destination.
  assert.equal(nav.getSnapshot(), true);
  nav.focus(true);
  assert.equal(nav.getSnapshot(), true, 'the original focused screen must not reopen early');
  assert.deepEqual(nav.dismissed(), cedar);
  assert.equal(nav.dismissed(), null, 'a repeated native callback cannot push twice');
  nav.focus(true);
  assert.equal(nav.getSnapshot(), true, 'push has not blurred the map yet');
  nav.focus(false);
  assert.equal(nav.getSnapshot(), true, 'keep the sheet hidden while browsing details');
  nav.focus(true);
  assert.equal(nav.getSnapshot(), false, 'Back reopens the planner');
  nav.open(akers);
  assert.deepEqual(nav.dismissed(), akers, 'the other endpoint works on the next visit');
});

test('closing or changing the plan cancels queued detail navigation', () => {
  const nav = createPlanDetailNavigation();
  nav.open(planAccessDestination('current', { slug: 'cedargrove' })!);
  nav.reset();
  assert.equal(nav.dismissed(), null);
  nav.focus(false);
  nav.focus(true);
  assert.equal(nav.getSnapshot(), false);
});
