import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLaunchQueue, distanceToPolygonsMeters, metersBetween, pointInRing, type LaunchCandidate, type PolygonRings } from './launch-queue';

/** A 0.02° square with a 0.004° hole in the middle, near Table Rock. */
const SQUARE: PolygonRings = [
  [[-93.30, 36.50], [-93.28, 36.50], [-93.28, 36.52], [-93.30, 36.52], [-93.30, 36.50]],
  [[-93.292, 36.508], [-93.288, 36.508], [-93.288, 36.512], [-93.292, 36.512], [-93.292, 36.508]],
];

function candidate(overrides: Partial<LaunchCandidate>): LaunchCandidate {
  return { source: 'agfc', source_id: 'a1', name: 'Cricket Creek Boat Ramp', source_type: 'Boating Access', source_waterbody: 'Table Rock Lake', agency: 'AGFC', lon: -93.295, lat: 36.505, source_updated_at: null, ...overrides };
}

test('geometry: inside, in a hole, and metres to the nearest edge', () => {
  assert.equal(pointInRing([-93.295, 36.505], SQUARE[0]), true);
  assert.equal(distanceToPolygonsMeters([-93.295, 36.505], [SQUARE]), 0);
  assert.ok(distanceToPolygonsMeters([-93.29, 36.51], [SQUARE]) > 100, 'a point in the hole is not on the lake');
  const d = distanceToPolygonsMeters([-93.30, 36.53], [SQUARE]);
  assert.ok(d > 1_050 && d < 1_200, `0.01° north of the edge is about 1.1 km, got ${d}`);
  assert.ok(Math.abs(metersBetween([-93.3, 36.5], [-93.3, 36.51]) - 1_112) < 5);
});

test('the queue clusters places, links to existing access points, attaches areas as context, and reports what is off the lake', () => {
  const queue = buildLaunchQueue({
    lake_slug: 'table-rock',
    polygons: [SQUARE],
    candidates: [
      candidate({}),
      candidate({ source: 'mdc', source_id: 'm1', name: 'Cricket Creek', source_type: 'Boat Ramp', source_waterbody: null, lon: -93.2952, lat: 36.5052 }),
      candidate({ source_id: 'a2', name: 'Romp Hole Boat Ramp', source_waterbody: 'Kings River', lon: -93.285, lat: 36.515 }),
      candidate({ source_id: 'a3', name: 'Misfiled Ramp', source_waterbody: 'Table Rock Lake', lon: -93.20, lat: 36.60 }),
      candidate({ source_id: 'a4', name: 'Baxter Boat Ramp', lon: -93.299, lat: 36.501 }),
      candidate({ source: 'mdc', source_id: 'm9', name: 'Some Other River Access', source_type: 'Boat Ramp', source_waterbody: null, lon: -91.0, lat: 37.5 }),
    ],
    areas: [
      { area_id: '100', name: 'CRICKET CREEK', subtype: 'multipurposeArea', lon: -93.2965, lat: 36.5065, boat_status: 'open', boat_ramps: 1, source_updated_at: '2026-04-28T00:00:00.000Z' },
      { area_id: '101', name: 'BAXTER', subtype: 'multipurposeArea', lon: -93.2805, lat: 36.519, boat_status: 'open', boat_ramps: 1, source_updated_at: '2026-04-28T00:00:00.000Z' },
      { area_id: '102', name: 'VIOLA', subtype: 'multipurposeArea', lon: -93.25, lat: 36.45, boat_status: 'open', boat_ramps: 1, source_updated_at: '2026-04-28T00:00:00.000Z' },
    ],
    existing: [{ slug: 'romp-hole-access', name: 'Romp Hole Access', river_slug: 'kings-river', lon: -93.28501, lat: 36.51501 }],
  });
  assert.equal(queue.places.length, 3, 'two sources at one ramp are one place');
  const cricket = queue.places.find((p) => p.name === 'Cricket Creek Boat Ramp')!;
  assert.deepEqual(cricket.sources.map((s) => s.source), ['agfc', 'mdc']);
  assert.equal(cricket.nearest_area?.name, 'CRICKET CREEK');
  assert.equal(cricket.nearest_area?.matched_by, 'distance');
  const baxter = queue.places.find((p) => p.name === 'Baxter Boat Ramp')!;
  assert.equal(baxter.nearest_area?.name, 'BAXTER', 'an entrance 2 km from its ramp is matched by name');
  assert.equal(baxter.nearest_area?.matched_by, 'name');
  assert.ok(baxter.nearest_area!.distance_m > 1_500);
  assert.equal(cricket.existing_access_point, null);
  assert.deepEqual(cricket.launch_methods, []);
  assert.ok(cricket.review.some((r) => r.includes('more than one source')));
  const romp = queue.places.find((p) => p.name === 'Romp Hole Boat Ramp')!;
  assert.equal(romp.existing_access_point?.slug, 'romp-hole-access');
  assert.ok(romp.review.some((r) => r.startsWith('Link to existing access point romp-hole-access')));
  assert.ok(romp.review.some((r) => r.includes('"Kings River"')), 'a different source waterbody is a question');
  assert.equal(queue.off_lake.length, 1, 'a far ramp filed under this lake is reported; a far ramp with no claim on it is simply elsewhere');
  assert.equal(queue.off_lake[0].name, 'Misfiled Ramp');
  assert.deepEqual(queue.areas_without_candidate.map((a) => a.name), ['VIOLA'], 'a Corps ramp area with no pin is listed, not invented');
});
