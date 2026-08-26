// src/lib/trust/checks/float-endpoint-eligibility.test.ts
// The two directions of being wrong about whether a place is a launch.
//
// The fixtures are real shapes from the live table. The campground-with-a-ramp
// cases are the false positives a naive "campgrounds are not launches" rule
// would produce, where 50 approved campground-typed points are legitimately
// offered.
//
// Montauk State Park is here as the case that SHOULD fire, and that is the
// point. It is the Current's first put-in (20260823192151), it carries the
// access role, and it is deliberately not a float endpoint — Eddy's river
// geometry stops ~1.8 mi below it, so a route from it would start in the wrong
// place (20260823200007). `launch_not_selectable` is exactly the right thing to
// say about that, every day, until the geometry is extended. The finding is the
// reminder; without it the flag would quietly stay false forever.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveEndpointEligibilityFindings,
  isVehicleUnreachable,
  type EndpointEligibilityRow,
} from './float-endpoint-eligibility';

function row(overrides: Partial<EndpointEligibilityRow> = {}): EndpointEligibilityRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Baptist Camp',
    slug: 'baptist-camp',
    type: 'access',
    types: ['access'],
    approved: true,
    is_float_endpoint: true,
    river_mile_downstream: 12.4,
    river_slug: 'current',
    road_access: 'Gravel road off Hwy 19, passable in a car.',
    parking_info: 'Gravel lot for about eight vehicles.',
    ...overrides,
  };
}

test('a plain approved launch raises nothing', () => {
  assert.deepEqual(deriveEndpointEligibilityFindings([row()]), []);
});

/* ── A launch with no mile ────────────────────────────────────────────────── */

test('Van Buren — offered as a put-in with no river mile — is reported', () => {
  // The live shape that produced this rule. `van-buren` comes from
  // supabase/seed/access_points.sql, whose INSERT never lists
  // river_mile_downstream, so the row was approved and selectable at NULL from
  // the day it was created. toAccessPoint turns that into 0, 0 is the
  // headwaters, and the whole Current then compares as downstream of a landing
  // 85.9 miles in.
  const findings = deriveEndpointEligibilityFindings([
    row({
      name: 'Van Buren City Access',
      slug: 'van-buren',
      type: 'boat_ramp',
      types: [],
      river_mile_downstream: null,
    }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'endpoint_without_river_mile');
});

test('mile 0 is a real mile, not a missing one', () => {
  // The headwaters row of any river legitimately reads 0. Testing `== null`
  // rather than falsiness is what keeps it out of this finding — a `!row.mile`
  // guard would report every river's first put-in forever.
  assert.deepEqual(
    deriveEndpointEligibilityFindings([row({ river_mile_downstream: 0 })]),
    [],
  );
});

test('a point with no mile that is NOT offered raises nothing here', () => {
  // The harm is being offered at the wrong place. A row the picker never shows
  // has no position to be wrong about, and Echo Bluff State Park is the live
  // example of a deliberate non-endpoint. It still falls through to the roles
  // rules, which is where a non-launch belongs.
  assert.deepEqual(
    deriveEndpointEligibilityFindings([
      row({ types: ['campground', 'park'], is_float_endpoint: false, river_mile_downstream: null }),
    ]),
    [],
  );
});

test('a missing mile is reported instead of the roles finding, not alongside it', () => {
  // Both could fire on one row — no mile AND no launch role. The mile is the
  // one that makes the point actively wrong in the picker, so it wins and the
  // rule returns; two findings for one row would double-count the entity in
  // the ledger.
  const findings = deriveEndpointEligibilityFindings([
    row({ types: ['campground'], river_mile_downstream: null }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'endpoint_without_river_mile');
});

test('Montauk — a launch held back by the river line — is reported, deliberately', () => {
  // Its live state: approved so it keeps its page, pin and marker; carrying the
  // access role because it IS a put-in; not a float endpoint because the
  // geometry does not reach it yet. That combination is a launch nobody can
  // choose, and this rule is what keeps saying so until it can be.
  const findings = deriveEndpointEligibilityFindings([
    row({
      name: 'Montauk State Park',
      slug: 'montauk-state-park',
      type: 'access',
      types: ['access', 'campground', 'park'],
      approved: true,
      is_float_endpoint: false,
    }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'launch_not_selectable');
  assert.match(findings[0].title, /nobody can choose/);
});

test('a put-in that is also a park and a campground raises nothing when eligible', () => {
  // A place can be a launch AND somewhere you sleep; the roles axis is a set,
  // not a category. This is Montauk's shape once the geometry reaches it.
  const findings = deriveEndpointEligibilityFindings([
    row({
      type: 'access',
      types: ['access', 'campground', 'park'],
      approved: true,
      is_float_endpoint: true,
    }),
  ]);
  assert.deepEqual(findings, []);
});

test('a park with no launch role, correctly not offered, raises nothing', () => {
  // The state the column exists to express: approved, so it keeps its page and
  // pin, and ineligible, so it never reaches the picker.
  const findings = deriveEndpointEligibilityFindings([
    row({
      name: 'Some Bluff Overlook',
      slug: 'some-bluff-overlook',
      type: 'park',
      types: ['park'],
      approved: true,
      is_float_endpoint: false,
    }),
  ]);
  assert.deepEqual(findings, []);
});

test('a park still offered as an endpoint is flagged', () => {
  const findings = deriveEndpointEligibilityFindings([
    row({
      name: 'Some Bluff Overlook',
      slug: 'some-bluff-overlook',
      type: 'park',
      types: ['park', 'campground'],
      is_float_endpoint: true,
    }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'non_launch_offered_as_endpoint');
  assert.equal(findings[0].entityType, 'access_point');
  assert.match(findings[0].title, /offered as a put-in/);
});

test('a launch that cannot be chosen is flagged — the opt-in default going wrong', () => {
  const findings = deriveEndpointEligibilityFindings([
    row({ name: 'Tan Vat', slug: 'tan-vat', types: ['access', 'gravel_bar'], is_float_endpoint: false }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'launch_not_selectable');
  assert.match(findings[0].title, /nobody can choose/);
});

test('a campground with a boat ramp is a launch, and is not flagged', () => {
  // The false positive a "campgrounds are not launches" rule would produce.
  // Live, three approved rows carry campground+boat_ramp shapes.
  for (const types of [
    ['campground', 'boat_ramp'],
    ['boat_ramp', 'campground', 'park'],
    ['gravel_bar', 'campground'],
  ]) {
    assert.deepEqual(
      deriveEndpointEligibilityFindings([row({ types, is_float_endpoint: true })]),
      [],
      `${types.join('+')} should read as a launch`,
    );
  }
});

test('a bridge counts as a launch', () => {
  // Twelve approved rows are bridge-only. A low-water crossing is how a great
  // many Ozarks floats start, ramp or no ramp.
  assert.deepEqual(
    deriveEndpointEligibilityFindings([row({ types: ['bridge'], is_float_endpoint: true })]),
    [],
  );
});

test('an empty roles array is unjudgeable in both directions', () => {
  // 97 approved rows are in this state. Flagging them would produce a permanent
  // wall that says only "the types backfill has not happened".
  assert.deepEqual(
    deriveEndpointEligibilityFindings([row({ types: [], is_float_endpoint: true })]),
    [],
  );
  assert.deepEqual(
    deriveEndpointEligibilityFindings([row({ types: null, is_float_endpoint: true })]),
    [],
  );
  assert.deepEqual(
    deriveEndpointEligibilityFindings([row({ types: [], is_float_endpoint: false })]),
    [],
  );
});

test('unapproved rows are out of scope entirely', () => {
  // An unapproved row is invisible to the public, so neither direction can hurt
  // anyone yet. It is also the state every import lands in.
  assert.deepEqual(
    deriveEndpointEligibilityFindings([
      row({ approved: false, types: ['park'], is_float_endpoint: true }),
      row({ approved: false, types: ['access'], is_float_endpoint: false }),
    ]),
    [],
  );
});

test('the entity key is the uuid, not the slug', () => {
  // Slugs have drifted between environments before — 20260815000000 is a whole
  // migration about it — and a finding keyed on an editable field loses its
  // history the moment somebody edits it.
  const findings = deriveEndpointEligibilityFindings([
    row({ id: 'abc-123', slug: 'renamed-later', types: ['park'], is_float_endpoint: true }),
  ]);
  assert.equal(findings[0].entityKey, 'abc-123');
});

test('one row never raises both rules', () => {
  // The rules are mutually exclusive by construction (the first `continue`s),
  // and a row reported twice would double-count in the ledger.
  const findings = deriveEndpointEligibilityFindings([
    row({ types: ['access', 'park'], is_float_endpoint: false }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'launch_not_selectable');
});

test('a boat-in float camp offered as an endpoint is flagged on the road, not the roles', () => {
  // The live shape of five of the six USFS float camps on the Eleven Point, all
  // offered as put-ins with "NO ROAD ACCESS" on the row itself. Nobody
  // can leave a vehicle at any of them.
  const findings = deriveEndpointEligibilityFindings([
    row({
      name: 'Denny Hollow Float Camp',
      slug: 'denny-hollow-float-camp',
      type: 'campground',
      types: ['campground'],
      river_slug: 'eleven-point',
      is_float_endpoint: true,
      road_access: 'NO ROAD ACCESS',
    }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'unreachable_offered_as_endpoint');
  assert.match(findings[0].title, /no road to it/);
});

test('the road rule outranks the roles rule, so one row still raises one finding', () => {
  // Denny Hollow qualifies for BOTH: campground-only roles AND no road. The
  // road is the more fundamental fact and the one whose remediation is right,
  // so it wins — and the ledger never sees the same row twice.
  const findings = deriveEndpointEligibilityFindings([
    row({ types: ['campground'], is_float_endpoint: true, road_access: 'NO ROAD ACCESS' }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'unreachable_offered_as_endpoint');
});

test('a launch role does not rescue a boat-in camp', () => {
  // The gap this rule exists to close. A float camp really does have a gravel
  // bar, so adding the role is not wrong — but before this rule it silenced the
  // roles finding and left the point in the picker.
  const findings = deriveEndpointEligibilityFindings([
    row({
      types: ['campground', 'gravel_bar'],
      is_float_endpoint: true,
      road_access: 'NO ROAD ACCESS. Primary access by river from Riverton.',
    }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'unreachable_offered_as_endpoint');
});

test('a boat-in camp correctly excluded is not reported as a launch nobody can choose', () => {
  // The other direction, and the reason this is a guard rather than a third
  // finding. Once the flag is false these five are RIGHT, and telling somebody
  // to flip it would undo the fix.
  assert.deepEqual(
    deriveEndpointEligibilityFindings([
      row({
        types: ['campground', 'gravel_bar'],
        is_float_endpoint: false,
        road_access: 'NO ROAD ACCESS',
      }),
    ]),
    [],
  );
});

test('isVehicleUnreachable only fires on a leading declaration', () => {
  // Anchored deliberately: a loose match would pull in prose that says the
  // opposite, and a false positive both files a bogus finding AND suppresses
  // launch_not_selectable on the same row.
  for (const yes of [
    'NO ROAD ACCESS',
    'no road access',
    '  No road access. Hike or float in.',
    'NO VEHICLE ACCESS',
    'River access only',
  ]) {
    assert.equal(isVehicleUnreachable(yes), true, `${yes} should read as unreachable`);
  }
  for (const no of [
    'Gravel road, no road access issues in a passenger car.',
    'Paved to the ramp. No road access fee.',
    // The one anchoring alone would get wrong: the phrase IS at the front, and
    // the sentence says the opposite of what the rule is looking for.
    'No road access fee. Paved lot at the ramp.',
    'No vehicle access restrictions in summer.',
    'Good road access.',
    '',
    null,
  ]) {
    assert.equal(isVehicleUnreachable(no), false, `${no} should NOT read as unreachable`);
  }
});

test('Greenbriar — the one no rule could see — is caught on parking_info', () => {
  // Its exact live shape. road_access is NULL and `types` is empty, so the
  // roles rule correctly declined to judge it and a road_access-only guard
  // would have missed it too. It sat in the put-in picker beside five identical
  // neighbours that were being reported every day. The declaration is on the
  // row; it is just in the other field.
  const findings = deriveEndpointEligibilityFindings([
    row({
      name: 'Greenbriar Float Camp',
      slug: 'greenbriar-float-camp',
      type: 'float_camp',
      types: [],
      river_slug: 'eleven-point',
      is_float_endpoint: true,
      road_access: null,
      parking_info: 'No vehicle access. River only.',
    }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'unreachable_offered_as_endpoint');
  // The detail must quote the field that actually carried the declaration.
  assert.match(findings[0].detail, /No vehicle access/);
});

test('either field alone is enough, and neither is required', () => {
  assert.equal(isVehicleUnreachable('NO ROAD ACCESS', 'Gravel lot for eight.'), true);
  assert.equal(isVehicleUnreachable(null, 'No vehicle access. River only.'), true);
  assert.equal(isVehicleUnreachable(null, null), false);
  assert.equal(isVehicleUnreachable('Paved to the ramp.', 'Large paved lot.'), false);
});

test('a null road_access leaves the roles rules in charge', () => {
  // Most rows say nothing about the road. Silence is not a claim of
  // unreachability, and the roles rules must still work underneath.
  const findings = deriveEndpointEligibilityFindings([
    row({ types: ['park'], is_float_endpoint: true, road_access: null }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'non_launch_offered_as_endpoint');
});

test('findings are ordered deterministically', () => {
  const rows = [
    row({ id: 'b', name: 'Zebra Access', types: ['access'], is_float_endpoint: false }),
    row({ id: 'a', name: 'Alpha Park', types: ['park'], is_float_endpoint: true }),
  ];
  const forward = deriveEndpointEligibilityFindings(rows).map((f) => f.title);
  const reverse = deriveEndpointEligibilityFindings([...rows].reverse()).map((f) => f.title);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward, ['"Alpha Park" on the current is offered as a put-in but claims no launch', '"Zebra Access" on the current is a launch nobody can choose']);
});
