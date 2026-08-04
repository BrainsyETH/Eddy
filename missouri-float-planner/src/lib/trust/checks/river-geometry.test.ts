import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundingBoxOf,
  coordsPerMileOf,
  deriveRiverGeometryIssues,
  isOutsideMissouri,
  type RiverGeometryMetrics,
} from './river-geometry';

function metrics(overrides: Partial<RiverGeometryMetrics> = {}): RiverGeometryMetrics {
  return {
    coordinateCount: 500,
    coordsPerMile: 12,
    boundingBox: { minLat: 37, maxLat: 38, minLng: -91, maxLng: -90 },
    geometryReadFailed: false,
    geometryMissing: false,
    lengthMiles: 42,
    directionVerified: true,
    geometryStartsAtHeadwaters: true,
    gaugeCount: 3,
    gaugesOnRiver: 2,
    ...overrides,
  };
}

function keys(m: Partial<RiverGeometryMetrics> = {}) {
  return deriveRiverGeometryIssues(metrics(m)).map((i) => i.ruleKey);
}

// ── the healthy case ─────────────────────────────────────────────

test('a well-formed river produces no issues', () => {
  assert.deepEqual(keys(), []);
});

// ── geometry states are mutually exclusive ───────────────────────

test('an unreadable geometry reports the read failure, not a low point count', () => {
  // The RPC threw, so coordinateCount is 0 by default rather than measured.
  // Reporting "very low coordinate density (0 points)" would describe a
  // measurement that never happened.
  assert.deepEqual(keys({ geometryReadFailed: true, coordinateCount: 0 }), [
    'geometry_unreadable',
  ]);
});

test('a missing geometry reports absence, not a low point count', () => {
  assert.deepEqual(keys({ geometryMissing: true, coordinateCount: 0 }), ['geometry_missing']);
});

test('a real but sparse geometry reports the point count', () => {
  assert.deepEqual(keys({ coordinateCount: 4 }), ['coordinate_count_very_low']);
});

// ── the individual rules ─────────────────────────────────────────

test('low coordinate density is reported separately from a low point count', () => {
  // A long river can carry hundreds of points and still be under-sampled.
  const found = keys({ coordinateCount: 200, coordsPerMile: 2.1 });
  assert.deepEqual(found, ['coordinate_density_low']);
});

test('a null coords-per-mile is not treated as zero', () => {
  // coordsPerMileOf returns null when length_miles is missing; comparing null
  // against the threshold numerically would make every unmeasured river fire.
  const found = keys({ coordsPerMile: null, lengthMiles: null });
  assert.equal(found.includes('coordinate_density_low'), false);
  assert.equal(found.includes('missing_length_miles'), true);
});

test('an unset headwaters flag fires only on null, not on false', () => {
  // false is an answer — the geometry starts at the mouth. null means nobody
  // has looked.
  assert.equal(keys({ geometryStartsAtHeadwaters: null }).includes('headwaters_flag_unset'), true);
  assert.equal(keys({ geometryStartsAtHeadwaters: false }).includes('headwaters_flag_unset'), false);
});

test('gauges linked but none near the line is reported', () => {
  // The misassociation class: either the gauges belong to another river or the
  // geometry stops short of them.
  assert.deepEqual(keys({ gaugeCount: 3, gaugesOnRiver: 0 }), ['no_gauges_near_geometry']);
});

test('a river with no gauges at all reports that instead', () => {
  // Not both — "no gauges are near the line" is meaningless when there are none.
  const found = keys({ gaugeCount: 0, gaugesOnRiver: 0 });
  assert.deepEqual(found, ['no_gauges_linked']);
});

// ── bounds ───────────────────────────────────────────────────────

test('a bounding box outside Missouri is flagged', () => {
  const found = keys({ boundingBox: { minLat: 37, maxLat: 38, minLng: -99, maxLng: -90 } });
  assert.deepEqual(found, ['bbox_outside_missouri']);
});

test('isOutsideMissouri accepts the state edges', () => {
  assert.equal(isOutsideMissouri({ minLat: 35, maxLat: 41, minLng: -97, maxLng: -88 }), false);
  assert.equal(isOutsideMissouri({ minLat: 34.9, maxLat: 41, minLng: -97, maxLng: -88 }), true);
});

test('a null bounding box does not fire the bounds rule', () => {
  assert.equal(keys({ boundingBox: null }).includes('bbox_outside_missouri'), false);
});

// ── the helpers ──────────────────────────────────────────────────

test('boundingBoxOf reads lng,lat order', () => {
  // GeoJSON is [lng, lat]; swapping them would put every Ozark river in Tibet
  // and make the Missouri bounds check fire on everything.
  const box = boundingBoxOf([
    [-91, 37],
    [-90, 38],
  ]);
  assert.deepEqual(box, { minLat: 37, maxLat: 38, minLng: -91, maxLng: -90 });
});

test('boundingBoxOf returns null for no coordinates', () => {
  assert.equal(boundingBoxOf([]), null);
});

test('coordsPerMileOf returns null rather than dividing by nothing', () => {
  assert.equal(coordsPerMileOf(100, null), null);
  assert.equal(coordsPerMileOf(100, 0), null);
  assert.equal(coordsPerMileOf(0, 50), null);
  assert.equal(coordsPerMileOf(500, 42), 11.9);
});

// ── the shape the ledger depends on ──────────────────────────────

test('every issue carries both a stable key and a human sentence', () => {
  // They have to travel together: the sentences interpolate live values and
  // cannot be fingerprinted, the keys are meaningless in the console.
  const issues = deriveRiverGeometryIssues(
    metrics({ coordinateCount: 4, lengthMiles: null, gaugeCount: 0 }),
  );
  assert.equal(issues.length > 0, true);
  for (const issue of issues) {
    assert.match(issue.ruleKey, /^[a-z_]+$/);
    assert.equal(issue.message.length > 0, true);
  }
});

test('the interpolated sentences still read the way the admin page expects', () => {
  // /api/admin/river-health renders issue.message directly and
  // src/app/admin/data-sync/page.tsx displays the list, so these strings are a
  // UI contract, not internal text.
  const issues = deriveRiverGeometryIssues(metrics({ coordinateCount: 4, coordsPerMile: 2.1 }));
  const messages = issues.map((i) => i.message);
  assert.equal(messages.includes('Very low coordinate density (4 points)'), true);
  assert.equal(messages.includes('Low coordinate density: 2.1 pts/mile (recommend 10+)'), true);
});
