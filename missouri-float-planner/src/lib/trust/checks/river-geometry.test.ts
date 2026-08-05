import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundingBoxOf,
  coordsPerMileOf,
  deriveRiverGeometryIssues,
  geometryLengthMiles,
  isOutsideStateBounds,
  type RiverGeometryMetrics,
} from './river-geometry';

function metrics(overrides: Partial<RiverGeometryMetrics> = {}): RiverGeometryMetrics {
  return {
    coordinateCount: 500,
    coordsPerMile: 12,
    geometryLengthMiles: 42,
    boundingBox: { minLat: 37, maxLat: 38, minLng: -91, maxLng: -90 },
    geometryReadFailed: false,
    geometryMissing: false,
    lengthMiles: 42,
    directionVerified: true,
    geometryStartsAtHeadwaters: true,
    gaugeCount: 3,
    gaugesOnRiver: 2,
    state: 'MO',
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
  // coordsPerMileOf returns null when there is no measured length; comparing
  // null against the threshold numerically would make every unmeasured river
  // fire.
  const found = keys({ coordsPerMile: null, lengthMiles: null, geometryLengthMiles: null });
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

test('a bounding box outside its own state is flagged', () => {
  const found = keys({ boundingBox: { minLat: 37, maxLat: 38, minLng: -99, maxLng: -90 } });
  assert.deepEqual(found, ['bbox_outside_state']);
});

test('an Arkansas river is judged against Arkansas, not Missouri', () => {
  // The Caddo tops out at 34.46 N, below Missouri's 35, and was filed at HIGH
  // as "geometry may be incorrect" for the offence of being in Arkansas.
  const caddo = { minLat: 34.168506, maxLat: 34.458022, minLng: -93.836118, maxLng: -93.043141 };
  assert.equal(keys({ boundingBox: caddo, state: 'AR' }).includes('bbox_outside_state'), false);
  assert.equal(keys({ boundingBox: caddo, state: 'MO' }).includes('bbox_outside_state'), true);
});

test('a river that crosses the state line is not a defect', () => {
  // The Kings River rises in Madison County, Arkansas and empties into Table
  // Rock Lake in Missouri, reaching 36.59 N — past Arkansas's own 36.50 border.
  const kings = { minLat: 35.894879, maxLat: 36.594602, minLng: -93.675608, maxLng: -93.523529 };
  assert.equal(isOutsideStateBounds(kings, 'AR'), false);
});

test('an unknown state is judged against every state at once', () => {
  // Not silence: a river with no state still has a geometry that can be wildly
  // wrong. The union is the widest claim that is still true.
  const inMissouri = { minLat: 37, maxLat: 38, minLng: -91, maxLng: -90 };
  const nowhereNear = { minLat: 45, maxLat: 46, minLng: -105, maxLng: -104 };
  assert.equal(isOutsideStateBounds(inMissouri, null), false);
  assert.equal(isOutsideStateBounds(nowhereNear, null), true);
});

test('isOutsideStateBounds accepts the state edges', () => {
  assert.equal(isOutsideStateBounds({ minLat: 35, maxLat: 41, minLng: -97, maxLng: -88 }, 'MO'), false);
  assert.equal(isOutsideStateBounds({ minLat: 34.9, maxLat: 41, minLng: -97, maxLng: -88 }, 'MO'), true);
});

test('a null bounding box does not fire the bounds rule', () => {
  assert.equal(keys({ boundingBox: null }).includes('bbox_outside_state'), false);
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
  assert.equal(
    messages.includes('Low coordinate density: 2.1 pts/mile of channel (under 3)'),
    true,
  );
});

// ── density is measured against the line, not against a stored column ──
//
// The bug this section exists for: coordsPerMile used to divide the vertex
// count by rivers.length_miles, a column the import script writes only when a
// river is first created. Half the metric therefore described a different line
// than the other half, and whether a river appeared in the console was partly a
// function of how stale its mileage column was.

test('geometryLengthMiles measures the line it is given', () => {
  // One degree of latitude is ~69.05 statute miles anywhere on the sphere.
  const oneDegreeNorth = geometryLengthMiles([
    [-91, 37],
    [-91, 38],
  ]);
  assert.ok(oneDegreeNorth !== null);
  assert.ok(Math.abs(oneDegreeNorth - 69.05) < 0.1, `got ${oneDegreeNorth}`);
});

test('geometryLengthMiles sums every segment, not the end-to-end distance', () => {
  // A line that doubles back is twice as long as the straight run, which is the
  // entire reason a meandering river is longer than the valley it sits in.
  const there = geometryLengthMiles([
    [-91, 37],
    [-91, 38],
  ])!;
  const andBack = geometryLengthMiles([
    [-91, 37],
    [-91, 38],
    [-91, 37],
  ])!;
  assert.ok(Math.abs(andBack - there * 2) < 0.01);
});

test('geometryLengthMiles returns null when there is no line to measure', () => {
  assert.equal(geometryLengthMiles([]), null);
  assert.equal(geometryLengthMiles([[-91, 37]]), null);
});

test('a stale length_miles cannot flatter a sparse geometry', () => {
  // War Eagle Creek, as it stood on 2026-08-05: 261 vertices, a 68.1-mile line,
  // and 33.17 in length_miles. Against the column it scored 7.9 pts/mile — twice
  // its real figure, and the reason the sparsest line in the catalog was the one
  // river comfortably clear of the old threshold.
  assert.equal(coordsPerMileOf(261, 68.1), 3.8);
  assert.equal(coordsPerMileOf(261, 33.17), 7.9);

  // What it is actually guilty of, now that both halves come from the line: the
  // mileage column, not the vertex count. 3.8 is ordinary for this catalog.
  const found = keys({
    coordinateCount: 261,
    coordsPerMile: coordsPerMileOf(261, 68.1),
    geometryLengthMiles: 68.1,
    lengthMiles: 33.17,
  });
  assert.equal(found.includes('length_miles_disagrees_geometry'), true);
  assert.equal(found.includes('coordinate_density_low'), false);
});

test('the whole catalog does not fire on one import tolerance', () => {
  // Every active river fell between 3.1 and 5.1 pts/mile on 2026-08-05, because
  // they all came out of one Douglas-Peucker pass. At a threshold of 5 that was
  // 22 findings describing one fact. Gasconade is the sparsest at 3.14.
  assert.equal(keys({ coordsPerMile: 3.14 }).includes('coordinate_density_low'), false);
  assert.equal(keys({ coordsPerMile: 5.1 }).includes('coordinate_density_low'), false);
  // A placeholder line is still caught, which is what the rule is for.
  assert.equal(keys({ coordsPerMile: 2.4 }).includes('coordinate_density_low'), true);
});

test('the density sentence states the threshold it actually enforces', () => {
  // It read "(recommend 10+)" while the rule fired below 5, so it asked for a
  // number the check does not enforce and nothing in between ever appeared.
  const [issue] = deriveRiverGeometryIssues(metrics({ coordsPerMile: 2.4 })).filter(
    (i) => i.ruleKey === 'coordinate_density_low',
  );
  assert.match(issue.message, /under 3/);
  assert.doesNotMatch(issue.message, /10\+/);
});

// ── the drift the density metric used to hide ─────────────────────

test('a length_miles that disagrees with the line is its own finding', () => {
  const found = keys({ lengthMiles: 33.17, geometryLengthMiles: 68.1 });
  assert.equal(found.includes('length_miles_disagrees_geometry'), true);
});

test('a few percent between guide miles and a digitized channel is not a finding', () => {
  // Published guide miles and a traced line are different measurements of the
  // same river and legitimately differ; only a gap wide enough to skew mile
  // markers is worth surfacing.
  assert.equal(
    keys({ lengthMiles: 96.8, geometryLengthMiles: 91.31 }).includes(
      'length_miles_disagrees_geometry',
    ),
    false,
  );
  assert.equal(
    keys({ lengthMiles: 54.7, geometryLengthMiles: 44.84 }).includes(
      'length_miles_disagrees_geometry',
    ),
    true,
  );
});

test('a missing length_miles reports absence rather than disagreement', () => {
  // Two different problems, and "0% off" is not what a null column means.
  const found = keys({ lengthMiles: null, geometryLengthMiles: 68.1 });
  assert.equal(found.includes('missing_length_miles'), true);
  assert.equal(found.includes('length_miles_disagrees_geometry'), false);
});

test('an unmeasurable geometry cannot accuse the stored column', () => {
  // No line to compare against is not evidence that the column is wrong.
  const found = keys({ geometryMissing: true, coordinateCount: 0, geometryLengthMiles: null });
  assert.equal(found.includes('length_miles_disagrees_geometry'), false);
});
