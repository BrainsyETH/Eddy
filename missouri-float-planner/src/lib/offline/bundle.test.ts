import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { etagFor } from './etag';
import {
  NO_LIVE_AVAILABILITY,
  toAccessPoint,
  toHazard,
  type AccessPointRow,
  type HazardRow,
} from './shapes';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const BUNDLE_LIB = 'src/lib/offline/bundle.ts';
const BUNDLE_ROUTE = 'src/app/api/offline/bundle/route.ts';

// ── the ETag ──────────────────────────────────────────────────────────────

test('the same bundle hashes to the same ETag', () => {
  const body = { v: 1, rivers: [{ slug: 'current', hazards: [] }] };
  assert.equal(etagFor(body), etagFor(structuredClone(body)));
});

test('a changed bundle hashes to a different ETag', () => {
  // Otherwise a new hazard would never reach a phone that already has a copy.
  const before = { v: 1, rivers: [{ slug: 'current', hazards: [] }] };
  const after = { v: 1, rivers: [{ slug: 'current', hazards: [{ id: 'h1' }] }] };
  assert.notEqual(etagFor(before), etagFor(after));
});

/**
 * The load-bearing one, and the reason this file exists.
 *
 * A generated-at timestamp anywhere in the bundle makes the ETag change on
 * every request. Every install then pulls the full payload on every launch
 * instead of a 304 — roughly 1 MB per install per day — and the app goes on
 * working perfectly the whole time, so nothing ever surfaces it. It is a
 * regression that can only be caught by looking, which is what this does.
 */
test('the bundle body is built without reading a clock', () => {
  for (const path of [BUNDLE_LIB, BUNDLE_ROUTE]) {
    const src = read(path)
      // Comments discuss timestamps at length; the ban is on calling one.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const clock of ['Date.now(', 'new Date(', 'toISOString(', 'performance.now(']) {
      assert.ok(
        !src.includes(clock),
        `${path} calls ${clock}) — a time-varying body makes the ETag useless`,
      );
    }
  }
});

test('a 304 carries the same cache headers as the 200 it replaces', () => {
  // A revalidated response with no Cache-Control can be treated as
  // uncacheable, which puts every launch back on the origin.
  const src = read(BUNDLE_ROUTE);
  assert.match(src, /const headers = \{[^}]*cdnCacheHeaders\([^)]*\)[^}]*ETag/);
  assert.match(src, /status: 304, headers/);
});

test('the error path is not CDN-cached', () => {
  // A 500 held at the edge for an hour takes the offline cache down for every
  // install that launches in that window, including ones with nothing cached.
  const src = read(BUNDLE_ROUTE);
  const errorResponse = src.slice(src.indexOf('Failed to build offline bundle'));
  assert.ok(!errorResponse.includes('cdnCacheHeaders'));
});

// ── shape parity with the per-river routes ────────────────────────────────

/**
 * The bundle and the per-river routes are two producers of ONE stored value:
 * the bundle seeds the iOS cache for all rivers, then the routes write through
 * to the same key as rivers are opened. If they disagree about a field, a
 * river renders one way on a cold install and another way after a visit, and
 * whichever wrote last wins silently.
 *
 * Sharing the mappers makes that unrepresentable. This asserts they are still
 * shared, because re-inlining a transform is the natural thing to do while
 * editing one route and would restore the drift without any test failing.
 */
test('the per-river routes and the bundle map rows with the same functions', () => {
  const users = [
    ['src/app/api/rivers/[slug]/route.ts', 'toRiverDetail'],
    ['src/app/api/rivers/[slug]/hazards/route.ts', 'toHazard'],
    ['src/app/api/rivers/[slug]/access-points/route.ts', 'toAccessPoint'],
    [BUNDLE_LIB, 'toRiverDetail'],
    [BUNDLE_LIB, 'toHazard'],
    [BUNDLE_LIB, 'toAccessPoint'],
  ] as const;

  for (const [path, mapper] of users) {
    const src = read(path);
    assert.match(
      src,
      new RegExp(`import[\\s\\S]*?${mapper}[\\s\\S]*?from '@/lib/offline/shapes'`),
      `${path} should map rows with ${mapper} from shapes.ts, not its own copy`,
    );
  }
});

// ── the mappers themselves ────────────────────────────────────────────────

const hazardRow = (over: Partial<HazardRow> = {}): HazardRow => ({
  id: 'h1',
  river_id: 'r1',
  name: 'Low-water dam',
  type: 'dam',
  river_mile_downstream: 12.5,
  description: null,
  severity: 'high',
  portage_required: true,
  portage_side: 'left',
  seasonal_notes: null,
  location: { coordinates: [-91.5, 37.2] },
  ...over,
});

test('a hazard with no recorded position is still a hazard', () => {
  // The alternative — dropping it, as an unmappable access point is dropped —
  // is failure-as-absence on the one surface that can least afford it. The
  // river screen lists hazards by mile, so an unpinnable one still reads.
  const mapped = toHazard(hazardRow({ location: null }));
  assert.equal(mapped.id, 'h1');
  assert.deepEqual(mapped.coordinates, { lng: 0, lat: 0 });
});

const BOUNDS = { minLng: -96, minLat: 35.5, maxLng: -89, maxLat: 40.7 };

const accessRow = (over: Partial<AccessPointRow> = {}): AccessPointRow => ({
  id: 'a1',
  river_id: 'r1',
  name: 'Akers Ferry',
  slug: 'akers-ferry',
  river_mile_downstream: 3,
  type: 'boat_ramp',
  types: null,
  is_public: true,
  ownership: null,
  description: null,
  amenities: null,
  parking_info: null,
  road_access: null,
  facilities: null,
  fee_required: null,
  fee_notes: null,
  directions_override: null,
  image_urls: null,
  google_maps_url: null,
  location_orig: { coordinates: [-91.5, 37.2] },
  location_snap: null,
  road_surface: null,
  parking_capacity: null,
  managing_agency: null,
  official_site_url: null,
  local_tips: null,
  nearby_services: null,
  nps_campground_id: null,
  ...over,
});

test('an access point outside the service area is dropped', () => {
  // A put-in is somewhere a person drives to. Bad coordinates are worse than
  // a missing row, so this one case IS filtered rather than shown.
  assert.equal(toAccessPoint(accessRow({ location_orig: { coordinates: [12.4, 41.9] } }), new Map(), BOUNDS, NO_LIVE_AVAILABILITY), null);
  assert.equal(toAccessPoint(accessRow({ location_orig: null, location_snap: null }), new Map(), BOUNDS, NO_LIVE_AVAILABILITY), null);
});

test('an access point falls back to snapped coordinates when it has no original', () => {
  const mapped = toAccessPoint(
    accessRow({ location_orig: null, location_snap: { coordinates: [-91.5, 37.2] } }),
    new Map(),
    BOUNDS,
    NO_LIVE_AVAILABILITY,
  );
  assert.deepEqual(mapped?.coordinates, { lng: -91.5, lat: 37.2 });
});

test('an access point with no types list falls back to its single type', () => {
  // The app renders `types` and would show an untyped pin for every access
  // point predating the multi-type column.
  assert.deepEqual(toAccessPoint(accessRow(), new Map(), BOUNDS, NO_LIVE_AVAILABILITY)?.types, ['boat_ramp']);
});

// ── mile 0 as a sentinel for "we don't know" ──────────────────────────────
//
// CHARACTERIZATION TESTS. Every assertion below records what toAccessPoint
// does TODAY, and today it is wrong. They are written to pass now so CI stays
// green while the remediation is sequenced, and to FAIL the moment the
// serializer starts rejecting unplaceable points — which is the point. Do not
// "fix" a failure here by loosening the assertion; flip it, and say so.
//
// What they pin down, from production on the Current River:
//
//   access_points.slug = 'van-buren' — approved, river_mile_downstream NULL,
//   types '{}'. It is the ONLY approved access point on ANY river with a null
//   downstream mile, and it is a duplicate of two other Van Buren records that
//   both carry mile 85.90. Geometry agrees they are one place: snapped, the
//   three land at 84.15 / 84.15 / 84.17 — within 35 metres of each other.
//
// The row reaches the app as mile 0.0, which on the Current is Montauk, the
// headwaters, 86 miles upstream of the town it is named for.
//
// Mile 0 is doing double duty as a real position AND as "unknown", in at least
// two places — the coercion below, and the `accessPointRiverMile > 0` guard in
// src/lib/access-points/detail.ts that decides whether to look for a reach
// gauge at all. That conflation is the defect; these tests are its fixture.

test('an access point with no river mile is currently reported as mile 0', () => {
  // src/lib/offline/shapes.ts: `: 0` where the row's mile is null.
  //
  // AFTER THE FIX this should return null, the way an access point with
  // unusable coordinates already does — a put-in nobody can place on the river
  // is not a put-in at mile zero.
  const mapped = toAccessPoint(
    accessRow({ river_mile_downstream: null }),
    new Map(),
    BOUNDS,
    NO_LIVE_AVAILABILITY,
  );
  assert.equal(mapped?.riverMile, 0);
});

test('a null river mile sorts a mid-river access above the real headwaters put-in', () => {
  // The user-visible half. Every client re-sorts by riverMile —
  // eddy-ios/src/hooks/useFloatPlan.ts:89, map-sheet/RiverSheet.tsx:213 — so
  // the coerced zero does not stay a display quirk. It reorders the river.
  const vanBuren = toAccessPoint(
    accessRow({ id: 'vb', name: 'Van Buren City Access', slug: 'van-buren', river_mile_downstream: null }),
    new Map(),
    BOUNDS,
    NO_LIVE_AVAILABILITY,
  );
  const tanVat = toAccessPoint(
    accessRow({ id: 'tv', name: 'Tan Vat', slug: 'tan-vat', river_mile_downstream: 0.9 }),
    new Map(),
    BOUNDS,
    NO_LIVE_AVAILABILITY,
  );

  // AFTER THE FIX this is the tripwire: an access point that cannot be placed
  // on the river should be rejected here, the way bad coordinates already are,
  // and `vanBuren` should be null.
  assert.ok(vanBuren, 'an unplaceable access point still serializes today');

  const ordered = [tanVat!, vanBuren].sort((a, b) => a.riverMile - b.riverMile);
  assert.equal(ordered[0].slug, 'van-buren');

  // ── AND WHY THE FIX IS REJECTION, NOT A NULLABLE MILE ───────────────────
  //
  // Widening riverMile to `number | null` looks like the smaller change and is
  // not a fix at all: `null` coerces to 0 in arithmetic, so `a.riverMile -
  // b.riverMile` puts a null-mile row in exactly the same place a zero did.
  // Every comparator in the app keeps the bug, silently, with a type that now
  // claims to model the absence. Verified by patching shapes.ts to return null
  // and re-running this file: the three assertions above it went red and this
  // one stayed green.
  const asNull = [
    { slug: 'tan-vat', riverMile: 0.9 },
    { slug: 'van-buren', riverMile: null as unknown as number },
  ].sort((a, b) => a.riverMile - b.riverMile);
  assert.equal(
    asNull[0].slug,
    'van-buren',
    'a null mile sorts to the headwaters exactly as mile 0 does — nulling the type changes nothing',
  );
});

test('an access point with an empty types list does NOT fall back to its single type', () => {
  // The sibling of the test above it: `row.types || [row.type]` cannot see an
  // empty array, because [] is truthy. `types: null` falls back and `types: []`
  // does not, so a row that lost its roles ships with none — and the roles axis
  // (ADR 0008) is what every map layer and campground filter reads.
  //
  // AFTER THE FIX both should yield ['boat_ramp'].
  assert.deepEqual(
    toAccessPoint(accessRow({ types: [] }), new Map(), BOUNDS, NO_LIVE_AVAILABILITY)?.types,
    [],
  );
});

test('the production van-buren row reproduces both defects at once', () => {
  // Not a synthetic case. These are the live column values, so this test fails
  // as soon as either the serializer or the data is corrected — whichever lands
  // first — and that is the intended tripwire.
  const mapped = toAccessPoint(
    accessRow({
      id: 'van-buren-prod',
      name: 'Van Buren City Access',
      slug: 'van-buren',
      river_mile_downstream: null,
      type: 'boat_ramp',
      types: [],
      location_orig: { coordinates: [-91.015, 36.9936] },
      location_snap: { coordinates: [-91.01469, 36.99215] },
    }),
    new Map(),
    BOUNDS,
    NO_LIVE_AVAILABILITY,
  );

  assert.equal(mapped?.riverMile, 0, 'mile 85.90 arrives as mile 0');
  assert.deepEqual(mapped?.types, [], 'a boat ramp arrives with no role at all');
  // The coordinates are the one thing that is right: location_orig wins, and
  // it is 163 m from the centreline. The pin is in Van Buren; only the river
  // mile and the roles say otherwise.
  assert.deepEqual(mapped?.coordinates, { lng: -91.015, lat: 36.9936 });
});
