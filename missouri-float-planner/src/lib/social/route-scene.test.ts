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

function resultQuery(data: unknown[]) {
  const query = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    lt: () => query,
    order: () => query,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  return query;
}

test('route scene carries exact geometry and orders mapped intermediate points', async () => {
  const supabase = {
    rpc: async () => ({
      data: [{ segment_geom: { type: 'LineString', coordinates: [[-91.5, 37], [-91.45, 36.95], [-91.4, 36.9]] } }],
      error: null,
    }),
    from: (table: string) => {
      if (table === 'access_points') {
        return resultQuery([{
          id: 'camp',
          name: 'Round Spring',
          river_mile_downstream: 25,
          type: 'campground',
          types: ['access', 'campground'],
          location_snap: { coordinates: [-91.45, 36.95] },
        }]);
      }
      return resultQuery([]);
    },
  };

  const scene = await buildSocialRouteScene(supabase, section);
  assert.ok(scene);
  assert.equal(scene.routeCoordinates.length, 3);
  assert.deepEqual(scene.routePoints.map((point) => point.kind), ['put_in', 'campground', 'take_out']);
  assert.ok(scene.routePoints[1].progress > 0.45 && scene.routePoints[1].progress < 0.55);
});

test('route scene returns null when PostGIS has no drawable geometry', async () => {
  const supabase = {
    rpc: async () => ({ data: [{ segment_geom: null }], error: null }),
  };
  assert.equal(await buildSocialRouteScene(supabase, section), null);
});

test('guidebook mile-only springs are not placed on the line', async () => {
  const supabase = {
    rpc: async () => ({
      data: [{ segment_geom: { type: 'LineString', coordinates: [[-91.5, 37], [-91.45, 36.95], [-91.4, 36.9]] } }],
      error: null,
    }),
    from: () => resultQuery([]),
  };
  const withSprings: Section = {
    ...section,
    springs: [{ name: 'Welch Spring', mile: 23.2, side: 'left' }],
  };
  const scene = await buildSocialRouteScene(supabase, withSprings);
  assert.ok(scene);
  // The guidebook mile scale disagrees with the DB's; a mile-interpolated
  // marker would land in the wrong bend, so only endpoints remain.
  assert.deepEqual(scene.routePoints.map((point) => point.kind), ['put_in', 'take_out']);
});

