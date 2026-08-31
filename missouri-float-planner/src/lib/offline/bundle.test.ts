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

// ── the seeded index ──────────────────────────────────────────────────────
//
// The bundle carries which rivers EXIST alongside what each one looks like,
// because the river screen needs an id before it can ask for anything else and
// /api/rivers was the only place carrying one. A fresh install therefore held a
// full-screen spinner in front of the river screen — for three strings that
// change no more often than the put-ins in the same payload.
//
// The rule that makes it safe is that it carries no water. These pin it.

import { toRiverIndexEntry, type RiverRow } from './shapes';

const riverRow = (over: Partial<RiverRow> = {}): RiverRow => ({
  id: 'river-1',
  name: 'Current River',
  slug: 'current',
  state: 'MO',
  river_type: 'spring_fed_float',
  length_miles: '184.0',
  description: null,
  difficulty_rating: 'I-II',
  region: 'Ozarks',
  ...over,
});

test('a seeded river carries no condition, ever', () => {
  // THE load-bearing one. A condition here would be a reading served from an
  // hour-cached, day-stale-served CDN entry and then held on disk until the
  // next launch — the "cached moment read three days later" the bundle's own
  // header rules out, on the one field where being wrong is dangerous.
  const entry = toRiverIndexEntry(riverRow(), 12);
  assert.equal(entry.currentCondition, null);

  // Declared rather than omitted, so a consumer holding a seeded index is
  // holding a RiverListItem and needs no branch of its own.
  assert.ok('currentCondition' in entry);
});

test('a seeded river carries the identity every screen is blocked on', () => {
  const entry = toRiverIndexEntry(riverRow(), 12);
  assert.equal(entry.id, 'river-1');
  assert.equal(entry.slug, 'current');
  assert.equal(entry.name, 'Current River');
  assert.equal(entry.accessPointCount, 12);
  // The canonical WEBSITE path, so a share sheet on a seeded river produces
  // the same URL as one on a loaded river.
  assert.equal(entry.path, '/rivers/missouri/current');
});

test('a river with no state still gets a usable path', () => {
  // Same fallback getRivers has used since it was written. A row with a null
  // state must not produce '/rivers/undefined/…'.
  assert.equal(toRiverIndexEntry(riverRow({ state: null }), 0).path, '/rivers/missouri/current');
});

test('the bundle emits an index and the app writes it to its own key', () => {
  // Two halves of one change, and either alone is inert. The key is separate
  // from INDEX_KEY on purpose: sharing one would let the launch seed land
  // after a good /api/rivers list and blank every condition on disk.
  assert.match(read(BUNDLE_LIB), /index: rivers\.map\(/, 'the bundle must emit an index');

  const client = read('../eddy-ios/src/api/client.ts');
  assert.match(client, /writeSeedIndex\(body\.index\)/, 'the app must store what it is sent');

  const cache = read('../eddy-ios/src/lib/riverCache.ts');
  assert.match(cache, /SEED_INDEX_KEY/, 'the seed must not share INDEX_KEY');
  assert.match(
    cache,
    /export async function readBestIndex/,
    'callers need one reader that prefers the live index over the seed',
  );
});
