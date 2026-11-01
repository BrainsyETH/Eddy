import assert from 'node:assert/strict';
import test from 'node:test';
import { line } from './access-enrichment-2026-11';
import { alongRiverKm, dedupeAlongRiver, gapAround, routeEnds, vehicleClass } from './public-land-access-2026-11';

test('vehicleClass reports the most capable vehicle an MVUM route is open to', () => {
  assert.equal(vehicleClass({ passengervehicle: 'open', atv: 'open' }), 'passenger');
  assert.equal(vehicleClass({ passengervehicle: null, highclearancevehicle: 'open' }), 'high_clearance');
  assert.equal(vehicleClass({ atv: 'open' }), 'atv');
  assert.equal(vehicleClass({ motorcycle: 'open' }), 'motorcycle');
  assert.equal(vehicleClass({ passengervehicle: 'closed' }), 'none');
});

test('routeEnds returns both ends of every path and skips degenerate ones', () => {
  assert.deepEqual(routeEnds([[[0, 0], [1, 1], [2, 2]], [[5, 5]], [[3, 3], [4, 4]]]), [[0, 0], [2, 2], [3, 3], [4, 4]]);
});

test('alongRiverKm measures along the line, across MultiLineString parts, without double counting', () => {
  // ~1.11 km per 0.01° of latitude.
  const straight = line([[-91, 37], [-91, 37.02]]);
  const mid = alongRiverKm(straight, [-91.0005, 37.01]);
  assert.ok(Math.abs(mid.km - 1.11) < 0.02, `km ${mid.km}`);
  assert.ok(Math.abs(mid.offsetM - 44) < 3, `offset ${mid.offsetM}`);
  const multi = { type: 'MultiLineString' as const, coordinates: [[[-91, 37], [-91, 37.01]], [[-91, 37.01], [-91, 37.02]]] };
  assert.ok(Math.abs(alongRiverKm(multi, [-91, 37.015]).km - 1.67) < 0.02);
});

test('gapAround finds the accesses either side and the gap between them', () => {
  assert.deepEqual(gapAround(12, [2, 10, 25], 40), { upKm: 10, downKm: 25, nearestKm: 2, gapKm: 15 });
  assert.equal(gapAround(30, [2, 10, 25], 40).gapKm, 15, 'below the last access the gap runs to the river end');
  assert.equal(gapAround(1, [2, 10], 40).gapKm, 2, 'above the first access the gap runs from the river start');
});

test('dedupeAlongRiver keeps one candidate per stretch, preferring the most capable route', () => {
  const kept = dedupeAlongRiver([
    { km: 5.0, vehicle: 'atv', offsetM: 10 },
    { km: 5.1, vehicle: 'passenger', offsetM: 120 },
    { km: 9.0, vehicle: 'high_clearance', offsetM: 50 },
  ]);
  assert.deepEqual(kept.map((k) => [k.km, k.vehicle]), [[5.1, 'passenger'], [9.0, 'high_clearance']]);
});
