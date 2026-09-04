import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSocialRouteScene } from './route-scene';
import type { Section } from './section-picker';

const section: Section = {
  riverId: 'river-1',
  riverSlug: 'current',
  riverName: 'Current River',
  putInId: 'put-in',
  putInName: 'Akers',
  putInMile: 20,
  takeOutId: 'take-out',
  takeOutName: 'Pulltite',
  takeOutMile: 30,
  distanceMi: 10,
  hoursCanoe: 5,
  putInDescription: '',
  takeOutDescription: '',
  putInCamping: false,
  takeOutCamping: false,
  springs: [],
};

function resultQuery(data: unknown[], error: { message: string } | null = null) {
  const query = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    lt: () => query,
    order: () => query,
    then: (resolve: (value: { data: unknown[]; error: { message: string } | null }) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  return query;
}

const LINE = { type: 'LineString', coordinates: [[-91.5, 37], [-91.45, 36.95], [-91.4, 36.9]] };

const roundSpring = {
  id: 'camp',
  name: 'Round Spring',
  river_mile_downstream: 25,
  type: 'campground',
  types: ['access', 'campground'],
  location_snap: { coordinates: [-91.45, 36.95] },
};

const hazard = {
  id: 'strainer',
  name: 'Root wad below the bluff',
  type: 'strainer',
  severity: 'danger',
  river_mile_downstream: 27.5,
  location: null,
  portage_required: false,
};

test('route scene carries exact geometry and orders mapped intermediate points', async () => {
  const supabase = {
    rpc: async () => ({ data: [{ segment_geom: LINE }], error: null }),
    from: (table: string) => (table === 'access_points' ? resultQuery([roundSpring]) : resultQuery([])),
  };

  const scene = await buildSocialRouteScene(supabase, section);
  assert.ok(scene);
  assert.equal(scene.routeCoordinates?.length, 3);
  assert.deepEqual(scene.routePoints.map((point) => point.kind), ['put_in', 'campground', 'take_out']);
  assert.ok(scene.routePoints[1].progress > 0.45 && scene.routePoints[1].progress < 0.55);
});

test('missing geometry still assembles the stops, ordered by mile, with no line', async () => {
  // No drawable LineString — the reel must render its itinerary from the same
  // stops (and hazards) it would have pinned to the channel, never a fallback
  // card that forgets what the float passes.
  const supabase = {
    rpc: async () => ({ data: [{ segment_geom: null }], error: null }),
    from: (table: string) =>
      table === 'access_points'
        ? resultQuery([roundSpring])
        : table === 'river_hazards'
          ? resultQuery([hazard])
          : resultQuery([]),
  };
  const scene = await buildSocialRouteScene(supabase, section);
  assert.ok(scene);
  assert.equal(scene.routeCoordinates, undefined);
  assert.deepEqual(
    scene.routePoints.map((point) => [point.kind, point.progress]),
    [['put_in', 0], ['campground', 0.5], ['hazard', 0.75], ['take_out', 1]],
  );
  assert.equal(scene.routePoints[2].detail, 'Strainer');
  assert.equal(scene.routePoints[2].severity, 'danger');
});

test('a failed route-point query returns null even when the geometry exists', async () => {
  // A line without its hazards would be a route that silently lost a data
  // source; the caller renders the two-stop card and the warning is logged.
  const supabase = {
    rpc: async () => ({ data: [{ segment_geom: LINE }], error: null }),
    from: (table: string) =>
      table === 'river_hazards' ? resultQuery([], { message: 'timeout' }) : resultQuery([roundSpring]),
  };
  assert.equal(await buildSocialRouteScene(supabase, section), null);
});

test('guidebook mile-only springs are named but never placed on the line', async () => {
  const supabase = {
    rpc: async () => ({ data: [{ segment_geom: LINE }], error: null }),
    from: (table: string) =>
      table === 'points_of_interest'
        ? resultQuery([{
            id: 'poi-cave',
            name: 'Cave Spring',
            type: 'spring',
            river_mile: 26.1,
            latitude: 36.95,
            longitude: -91.45,
          }])
        : resultQuery([]),
  };
  const withSprings: Section = {
    ...section,
    springs: [
      { name: 'Welch Spring', mile: 23.2, side: 'left' },
      // Also in the POI table with coordinates — mapped there, so not repeated.
      { name: 'Cave Spring', mile: 26.0, side: 'right' },
    ],
  };
  const scene = await buildSocialRouteScene(supabase, withSprings);
  assert.ok(scene);
  // The guidebook mile scale disagrees with the DB's; a mile-interpolated
  // marker would land in the wrong bend, so only coordinate-backed points pin.
  assert.deepEqual(scene.routePoints.map((point) => point.name), ['Akers', 'Cave Spring', 'Pulltite']);
  assert.deepEqual(scene.unanchoredPoints, [
    { id: 'spring-current-23.2', name: 'Welch Spring', kind: 'spring', riverMile: 23.2, detail: 'Spring · river left' },
  ]);
});
