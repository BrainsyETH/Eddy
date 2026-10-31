import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRouteIndex, lineMetersAtMile, pointAt } from '@eddy/geo';
import type { CompletedFloat } from '@shared/float-archive';
import { spanCalibration } from '@shared/float-recap';
import { recapRouteDrawing, recapRouteGeometry, recapRouteModel } from '../../../eddy-ios/src/lib/floatRecapRoute';
import type { FloatRoute } from '../../../eddy-ios/src/lib/floatSession';

const river: FloatRoute = {
  riverSlug: 'current', riverName: 'Current River', fetchedAt: null,
  line: [[-91, 37], [-90.99, 37.002], [-90.98, 37]],
  anchors: [
    { id: 'a', name: 'Akers', lngLat: [-91, 37], riverMile: 0, endpoint: true },
    { id: 'b', name: 'Pulltite', lngLat: [-90.98, 37], riverMile: 1, endpoint: true },
  ],
};
const built = buildRouteIndex(river.line, river.anchors);
assert.ok(built.ok);
const index = built.index;
const calibration = spanCalibration(river.anchors);
const snapshot = { startMile: 0, takeOutMile: 1, startName: 'Akers', calibration };
function trip(overrides: Partial<CompletedFloat> = {}): CompletedFloat {
  return {
    version: 1, measurementVersion: 1, id: 'recap', riverSlug: 'current', riverName: 'Current River',
    putInId: 'a', putInName: 'Akers', takeOutId: 'b', takeOutName: 'Pulltite', boatType: 'kayak',
    startedAt: 0, endedAt: 3_600_000, elapsedMs: 3_600_000, movingMs: 3_000_000, stoppedMs: 600_000, unknownMs: 0,
    firstMile: 0, lastMile: 0.75, distanceMiles: 0.55, movingMph: 1, plannerMph: 1, reachedTakeOut: false,
    routeSnapshot: snapshot,
    riverSpan: { firstMile: 0, lastMile: 1, firstName: 'Akers', lastName: 'Pulltite', calibration },
    coveredMiles: [[0, 0.4], [0.6, 0.75]],
    ...overrides,
  };
}

test('recap progress is along its saved stretch; only confirmed arrival earns 100%', () => {
  assert.equal(recapRouteModel(trip())?.percent, 75);
  assert.equal(recapRouteModel(trip({ lastMile: 0.9999 }))?.percent, 99);
  assert.equal(recapRouteModel(trip({ lastMile: 1.1 }))?.percent, 99);
  assert.equal(recapRouteModel(trip({ lastMile: -1 }))?.percent, 0);
  assert.equal(recapRouteModel(trip({ reachedTakeOut: true, lastMile: 0.99 }))?.percent, 100);
  assert.equal(recapRouteModel(trip({ firstMile: null, lastMile: null }))?.percent, null);
  assert.equal(recapRouteModel(trip({ lastMile: NaN }))?.percent, null);
});

test('limited tracking does not imply an early finish or undo a confirmed arrival', () => {
  const partial = trip({ unknownMs: 2_000_000 });
  assert.equal(recapRouteModel(partial)?.percent, null);
  assert.equal(recapRouteModel({ ...partial, reachedTakeOut: true })?.percent, 100);
});

test('older and malformed snapshots have no guessed route or denominator', () => {
  for (const value of [undefined, null, [], {}, { ...snapshot, takeOutMile: 0 }, { ...snapshot, startMile: NaN },
    { ...snapshot, calibration: 'unknown' }, { ...snapshot, startName: '' }]) {
    assert.equal(recapRouteModel(trip({ routeSnapshot: value as CompletedFloat['routeSnapshot'] })), null);
  }
});

test('recap map frames the entire float and leaves gaps in recorded coverage', () => {
  const geometry = recapRouteGeometry(trip(), river, index);
  assert.ok(geometry);
  assert.deepEqual(geometry.start, pointAt(index, lineMetersAtMile(index, 0)));
  assert.deepEqual(geometry.takeOut, pointAt(index, lineMetersAtMile(index, 1)));
  assert.equal(geometry.covered.length, 2);
  assert.deepEqual(geometry.covered[0].at(-1), pointAt(index, lineMetersAtMile(index, 0.4)));
  assert.deepEqual(geometry.covered[1][0], pointAt(index, lineMetersAtMile(index, 0.6)));
  assert.deepEqual(geometry.last, pointAt(index, lineMetersAtMile(index, 0.75)));
  const completed = recapRouteGeometry(trip({ reachedTakeOut: true }), river, index);
  assert.equal(completed?.last, null);
  assert.equal(completed?.covered.length, 2, 'confirmed arrival does not paint missing GPS coverage');
});

test('updated river miles cannot reinterpret a historical map', () => {
  const changed = { ...river, anchors: river.anchors.map(a => ({ ...a, riverMile: a.riverMile + 1 })) };
  assert.equal(recapRouteGeometry(trip(), changed, index), null);
  assert.equal(recapRouteGeometry(trip(), { ...river, riverSlug: 'meramec' }, index), null);
  assert.equal(recapRouteModel(trip())?.percent, 75, 'saved progress remains independent of today’s map');
  assert.equal(recapRouteGeometry(trip({ coveredMiles: undefined }), river, index)?.covered.length, 0);
});

test('put-in and take-out remain correct when the river geometry runs upstream', () => {
  const reversed = { ...river, line: [...river.line].reverse() };
  const reversedIndex = buildRouteIndex(reversed.line, reversed.anchors);
  assert.ok(reversedIndex.ok);
  const geometry = recapRouteGeometry(trip(), reversed, reversedIndex.index);
  assert.ok(geometry);
  for (const axis of [0, 1]) {
    assert.ok(Math.abs(geometry.start[axis] - river.anchors[0].lngLat[axis]) < 1e-8);
    assert.ok(Math.abs(geometry.takeOut[axis] - river.anchors[1].lngLat[axis]) < 1e-8);
  }
  assert.equal(geometry.covered.length, 2);
});

test('river-only fallback fits both endpoints at narrow and wide sizes', () => {
  const geometry = recapRouteGeometry(trip(), river, index)!;
  for (const width of [280, 430, 800]) {
    const drawing = recapRouteDrawing(geometry, width, 180);
    for (const point of geometry.section) {
      const p = drawing.point(point);
      assert.ok(p.cx >= 23.99 && p.cx <= width - 23.99);
      assert.ok(p.cy >= 23.99 && p.cy <= 156.01);
    }
    assert.ok(drawing.path(geometry.section).startsWith('M'));
  }
});
