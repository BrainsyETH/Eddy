import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildRouteIndex, lineMetersAtMile, pointAt } from '@eddy/geo';
import type { CompletedFloat } from '@shared/float-archive';
import { spanCalibration } from '@shared/float-recap';
import { recapMapAnchors, recapMapDescription, recapRouteDrawing, recapRouteGeometry, recapRouteMap, recapRouteModel } from '../../../eddy-ios/src/lib/floatRecapRoute';
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

const longRiver: FloatRoute = {
  ...river,
  line: Array.from({ length: 7 }, (_, i) => [-91.01 + i * 0.01, 37]),
  anchors: Array.from({ length: 7 }, (_, i) => ({
    id: 'point-' + i, name: 'Point ' + i, riverMile: (i - 1) * 0.5,
    lngLat: [-91.01 + i * 0.01, 37], endpoint: true,
  })),
};
const longBuilt = buildRouteIndex(longRiver.line, longRiver.anchors);
assert.ok(longBuilt.ok);
const originalIndex = longBuilt.index;
const originalCalibration = spanCalibration(longRiver.anchors);
const saved = trip({ routeSnapshot: {
  ...snapshot, calibration: originalCalibration,
  mapAnchors: recapMapAnchors(longRiver, originalIndex, 0, 1),
}, riverSpan: { firstMile: -0.5, lastMile: 2.5, firstName: 'Upper', lastName: 'Lower', calibration: originalCalibration } });

test('snapshot keeps accepted interior anchors and the neighbors needed by an on-water start', () => {
  assert.deepEqual(saved.routeSnapshot?.mapAnchors, [
    { id: 'point-1', riverMile: 0 }, { id: 'point-2', riverMile: 0.5 }, { id: 'point-3', riverMile: 1 },
  ]);
  assert.deepEqual(recapMapAnchors(longRiver, originalIndex, 0.25, 0.8), saved.routeSnapshot?.mapAnchors);
  const reversed = { ...longRiver, line: [...longRiver.line].reverse() };
  const built = buildRouteIndex(reversed.line, reversed.anchors);
  assert.ok(built.ok);
  assert.deepEqual(recapMapAnchors(reversed, built.index, 0, 1), saved.routeSnapshot?.mapAnchors);
});

test('unrelated additions, removals and mile edits leave historical maps available', () => {
  const expected = recapRouteGeometry(saved, longRiver, originalIndex);
  assert.ok(expected);
  const variants = [
    [...longRiver.anchors, { id: 'new-access', name: 'New access', endpoint: true, riverMile: 1.7, lngLat: [-90.966, 37] as [number, number] }],
    longRiver.anchors.filter(a => a.id !== 'point-5'),
    longRiver.anchors.map(a => a.id === 'point-5' ? { ...a, riverMile: 2.1 } : a),
  ];
  for (const anchors of variants) {
    const current = { ...longRiver, anchors };
    const built = buildRouteIndex(current.line, current.anchors);
    assert.ok(built.ok);
    assert.notEqual(spanCalibration(anchors), originalCalibration);
    assert.deepEqual(recapRouteGeometry(saved, current, built.index), expected);
  }
});

test('changed intermediate miles use the original calibration, not just unchanged endpoints', () => {
  const current = { ...longRiver, anchors: longRiver.anchors.map(a => a.id === 'point-2' ? { ...a, riverMile: 0.7 } : a) };
  const built = buildRouteIndex(current.line, current.anchors);
  assert.ok(built.ok);
  const historical = recapRouteGeometry(saved, current, built.index);
  assert.deepEqual(historical, recapRouteGeometry(saved, longRiver, originalIndex));
  assert.notDeepEqual(pointAt(built.index, lineMetersAtMile(built.index, 0.75)), historical?.last,
    'using current miles would put the last recorded marker in a different place');
});

test('new access points within the stretch do not change historical coverage', () => {
  const current = { ...longRiver, anchors: [...longRiver.anchors,
    { id: 'interior-new', name: 'New', endpoint: true, riverMile: 0.4, lngLat: [-90.995, 37] as [number, number] }] };
  const built = buildRouteIndex(current.line, current.anchors);
  assert.ok(built.ok);
  assert.deepEqual(recapRouteGeometry(saved, current, built.index), recapRouteGeometry(saved, longRiver, originalIndex));
});

test('missing necessary anchors use the original package or explain the map update', () => {
  const current = { ...longRiver, anchors: longRiver.anchors.filter(a => a.id !== 'point-2') };
  const built = buildRouteIndex(current.line, current.anchors);
  assert.ok(built.ok);
  const currentSource = { route: current, index: built.index };
  const packageSource = { route: longRiver, index: originalIndex };
  assert.equal(recapRouteMap(saved, [currentSource]).message, 'The river’s map has been updated since this float.');
  assert.equal(recapRouteMap(saved, [packageSource, currentSource]).message, null);
  assert.ok(recapRouteMap(saved, [currentSource, packageSource]).geometry);
  assert.ok(recapRouteMap(saved, [packageSource]).geometry, 'no ordinary cache required');
  assert.equal(recapRouteMap(saved, []).message, 'Route map unavailable', 'offline is not proof the map changed');
  const legacy = { ...saved, routeSnapshot: { ...saved.routeSnapshot!, mapAnchors: undefined } };
  assert.ok(recapRouteMap(legacy, [packageSource, currentSource]).geometry, 'old snapshots still use a matching original download');
});

test('removed downloads are unnecessary when saved calibration can reconstruct the map', () => {
  const current = { ...longRiver, anchors: longRiver.anchors.map(a => ({ ...a, riverMile: a.riverMile + 10 })) };
  const built = buildRouteIndex(current.line, current.anchors);
  assert.ok(built.ok);
  assert.deepEqual(recapRouteMap(saved, [{ route: current, index: built.index }]).geometry,
    recapRouteGeometry(saved, longRiver, originalIndex));
});

test('malformed calibration and moved anchors cannot silently produce a different map', () => {
  for (const mapAnchors of [null, [], [{ id: 'point-1', riverMile: 0 }],
    [{ id: 'point-1', riverMile: 0 }, { id: 'point-1', riverMile: 1 }],
    [{ id: 'point-1', riverMile: NaN }, { id: 'point-3', riverMile: 1 }],
    [...saved.routeSnapshot!.mapAnchors!].reverse()]) {
    const malformed = { ...saved, routeSnapshot: { ...saved.routeSnapshot!, mapAnchors } } as CompletedFloat;
    assert.equal(recapRouteGeometry(malformed, longRiver, originalIndex), null);
  }
  const moved = { ...longRiver, anchors: longRiver.anchors.map(a => a.id === 'point-2'
    ? { ...a, lngLat: [-90, 38] as [number, number] } : a) };
  assert.equal(recapRouteGeometry(saved, moved, originalIndex), null, 'no dropping necessary calibration anchors');
});

test('map descriptions describe available coverage and last-recorded position without relying on color', () => {
  const geometry = recapRouteGeometry(trip(), river, index)!;
  assert.match(recapMapDescription(geometry), /Akers to Pulltite/);
  assert.match(recapMapDescription(geometry), /recorded or estimated river coverage/);
  assert.match(recapMapDescription(geometry), /last recorded position/);
  const empty = recapRouteGeometry(trip({ coveredMiles: [], lastMile: null }), river, index)!;
  assert.match(recapMapDescription(empty), /No river coverage is shown/);
  assert.doesNotMatch(recapMapDescription(empty), /Highlighted|Orange|last recorded/);
});

test('the recap requests the same style as trip downloads in both appearances', () => {
  const recap = readFileSync('../eddy-ios/src/float/FloatRecapMap.tsx', 'utf8');
  const downloads = readFileSync('../eddy-ios/src/float/tripDownloads.ts', 'utf8');
  assert.match(recap, /styleURL=\{STYLE_URL\}/);
  assert.doesNotMatch(recap, /mapbox:\/\/styles\//, 'no private recap style that offline packs do not contain');
  assert.match(downloads, /styleURL: STYLE_URL/);
});
