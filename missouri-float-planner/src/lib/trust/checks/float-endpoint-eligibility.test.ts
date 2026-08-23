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
    river_slug: 'current',
    ...overrides,
  };
}

test('a plain approved launch raises nothing', () => {
  assert.deepEqual(deriveEndpointEligibilityFindings([row()]), []);
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
