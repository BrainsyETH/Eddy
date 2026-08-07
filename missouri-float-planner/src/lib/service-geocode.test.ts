// src/lib/service-geocode.test.ts
// What may become a map pin, and the matcher that decides what gets written.
//
// Covers eddy-ios/src/map/mappable.ts and the accept rule in
// scripts/ingestion/geocode-services-dryrun.ts. The fixtures are the real
// measured near-misses, because the thresholds were chosen from them and a
// change that lets any of them through is the change worth catching.

import assert from 'node:assert/strict';
import test from 'node:test';
import { mappableService } from '../../../eddy-ios/src/map/mappable';
import {
  accepts,
  milesBetween,
  nameScore,
  pickBest,
  POI_TAGS,
  sweepBox,
} from '../../scripts/ingestion/geocode-services-dryrun';

/* ── What may be drawn ────────────────────────────────────────────────────── */

test('a town centroid is never a pin', () => {
  // The whole point. A centroid puts a private campground somewhere in the
  // right county, and somebody plans a two-hour drive around a pin.
  assert.equal(
    mappableService({ latitude: 37.15, longitude: -91.35, geocodePrecision: 'centroid' }),
    false,
  );
});

test('a corroborated coordinate is a pin', () => {
  assert.equal(
    mappableService({ latitude: 37.15518, longitude: -91.36701, geocodePrecision: 'exact' }),
    true,
  );
  assert.equal(
    mappableService({ latitude: 37.15, longitude: -91.35, geocodePrecision: 'approximate' }),
    true,
  );
});

test('coordinates from before provenance was tracked stay on the map', () => {
  // Thirteen services were entered before the column existed. Demanding
  // 'exact' would have silently un-pinned every one of them to make a point.
  assert.equal(mappableService({ latitude: 37.1, longitude: -91.3 }), true);
  assert.equal(
    mappableService({ latitude: 37.1, longitude: -91.3, geocodePrecision: null }),
    true,
  );
});

test('no coordinates is never a pin, whatever the precision says', () => {
  assert.equal(
    mappableService({ latitude: null, longitude: null, geocodePrecision: 'exact' }),
    false,
  );
  assert.equal(mappableService({ latitude: 37.1, longitude: null }), false);
});



/* ── What may be written ──────────────────────────────────────────────────── */

const EMINENCE: [number, number] = [37.1506, -91.3576];
const ALTON: [number, number] = [36.6945, -91.3996];
const JEROME: [number, number] = [37.9262, -91.9777];

test('the one real match clears both tests', () => {
  // Circle B: an OSM camp_site whose name matched exactly, 0.6 miles from
  // Eminence, and the operator's own street address landed 0.22 miles from it.
  const v = accepts('Circle B Campground & Resort', EMINENCE, {
    name: 'Circle B',
    lat: 37.15518,
    lng: -91.36701,
  });
  assert.equal(v.ok, true, `expected accept, got ${v.why}`);
  assert.ok(v.miles < 1);
});

test('a plausible name at the wrong end of the state is rejected', () => {
  // Camp River Campground is in Alton. Two Rivers Campground is a real, other
  // campground 35 miles away on a different river. Name similarity alone was
  // 0.81 and would have put Eddy's pin on somebody else's campground.
  const v = accepts('Camp River Campground', ALTON, {
    name: 'Two Rivers Campground',
    lat: 37.18948,
    lng: -91.27559,
  });
  assert.equal(v.ok, false);
});

test('every measured near-miss stays rejected', () => {
  // The set that made this script propose rather than apply. If a threshold
  // change lets any of these through, Eddy starts pointing at the wrong place.
  const nearMisses: [string, [number, number], string, number, number][] = [
    ['Story’s Creek Campground', EMINENCE, 'Brazil Creek Campground', 37.98641, -91.03264],
    ['Ruby’s Landing', JEROME, 'Twin Rivers Landing', 37.18948, -91.27559],
    ['Arapaho Campground', [37.9681, -91.3549], 'Huzzah Campground', 38.02258, -91.20157],
    ['Blue Springs Ranch', [38.1548, -91.244], 'Lane Springs', 37.79746, -91.83669],
  ];

  for (const [name, town, osm, lat, lng] of nearMisses) {
    const v = accepts(name, town, { name: osm, lat, lng });
    assert.equal(v.ok, false, `${name} -> ${osm} must not be written automatically`);
  }
});

test('a candidate with no town to check against is never accepted', () => {
  // Distance is the independent fact Eddy holds that the geocoder does not.
  // Without it there is only one test, and one test let four wrong campgrounds
  // through.
  const v = accepts('Circle B Campground & Resort', null, {
    name: 'Circle B',
    lat: 37.15518,
    lng: -91.36701,
  });
  assert.equal(v.ok, false);
});

test('the shared words in every campground name do not create a match', () => {
  // "Campground" against "Campground" is not evidence of anything.
  assert.ok(nameScore('Elk River Campground', 'Bear Creek Campground') < 0.86);
});

test('distance is in miles and symmetric', () => {
  assert.ok(Math.abs(milesBetween(EMINENCE, EMINENCE)) < 1e-9);
  assert.ok(Math.abs(milesBetween(EMINENCE, ALTON) - milesBetween(ALTON, EMINENCE)) < 1e-9);
  // Eminence to Alton is about 31 miles as the crow flies.
  assert.ok(Math.abs(milesBetween(EMINENCE, ALTON) - 31) < 4);
});

/* ── The search area follows the data ────────────────────────────────────── */

test('the swept box contains every town it was built from', () => {
  // It was a hardcoded '36.4,-92.6,38.6,-90.6' — the Missouri Ozarks. Eddy has
  // since grown onto the Elk River and into Arkansas, and those rows fell
  // outside it: never candidates at all, yet printed with a "match" 220 miles
  // away that a reader could easily take for a near-miss.
  const towns: [number, number][] = [
    [37.15, -91.36], // Eminence, MO
    [36.54, -94.49], // Noel, MO — Elk River, west of the old box
    [34.4, -93.6], // Caddo Gap, AR — south of the old box
    [36.23, -92.68], // Yellville, AR
  ];
  const [s, w, n, e] = sweepBox(towns).split(',').map(Number);
  for (const [lat, lng] of towns) {
    assert.ok(lat > s && lat < n, `${lat} outside ${s}..${n}`);
    assert.ok(lng > w && lng < e, `${lng} outside ${w}..${e}`);
  }
});

test('the box is padded by the distance test, not by a guess', () => {
  // The swept area IS the area a candidate could be accepted in. Twelve miles
  // is roughly 0.174 degrees of latitude; the pad must cover that and must not
  // be wildly larger, or the sweep pulls in POIs that could never qualify.
  const [s, , n] = sweepBox([[37.0, -91.0]]).split(',').map(Number);
  const padDegrees = (n - s) / 2;
  assert.ok(padDegrees >= 12 / 69, `pad ${padDegrees} is narrower than the distance test`);
  assert.ok(padDegrees < 0.3, `pad ${padDegrees} is far wider than the distance test`);
});

test('longitude is padded wider than latitude, because degrees shrink', () => {
  // At 37°N a degree of longitude is about four fifths of a degree of latitude.
  // An unscaled pad is too narrow east-to-west — exactly where the Elk River
  // rows sit relative to the rest of the roster.
  const [s, w, n, e] = sweepBox([[37.0, -91.0]]).split(',').map(Number);
  assert.ok(e - w > n - s);
});

test('a sweep with no geocoded towns refuses rather than inventing a box', () => {
  assert.throws(() => sweepBox([]), /nothing to sweep/i);
});

/* ── Every type gets its own corpus ──────────────────────────────────────── */

test('each service type sweeps tags that describe it', () => {
  // Every type used to sweep tourism=camp_site, so asking for outfitters
  // compared canoe liveries against campgrounds and printed matches that meant
  // nothing at all.
  assert.ok(POI_TAGS.campground.includes('tourism=camp_site'));
  assert.ok(POI_TAGS.cabin_lodge.some((t) => t.startsWith('tourism=')));
  assert.ok(POI_TAGS.outfitter.includes('amenity=boat_rental'));
  assert.ok(!POI_TAGS.outfitter.includes('tourism=camp_site'), 'an outfitter is not a campground');
  assert.ok(!POI_TAGS.cabin_lodge.includes('tourism=camp_site'), 'a lodge is not a campground');
});

test('the three directory types are all covered', () => {
  // A type with no tags now throws in main() rather than silently sweeping the
  // wrong corpus, so this is the list that keeps that from firing in practice.
  for (const type of ['outfitter', 'campground', 'cabin_lodge']) {
    assert.ok(POI_TAGS[type]?.length, `${type} has no OSM tags`);
  }
});

/* ── A passing candidate is never hidden behind a distant namesake ───────── */

test('a qualifying match outranks a perfect name in another county', () => {
  // The bug: selection was by name score alone, so the 200-mile namesake won
  // and the good match down the road was never printed. The row then read as
  // "no candidate" when a fine one existed.
  const town: [number, number] = [37.15, -91.36];
  const best = pickBest('Circle B Campground & Resort', town, [
    { name: 'Circle B Campground & Resort', lat: 39.5, lng: -94.5 }, // perfect, far
    { name: 'Circle B Campground', lat: 37.16, lng: -91.37 }, // slightly lower, near
  ]);
  assert.ok(best);
  assert.equal(best.verdict.ok, true);
  assert.ok(best.verdict.miles < 12, `chose the one ${best.verdict.miles.toFixed(0)} mi away`);
});

test('with nothing qualifying, the distant namesake is still reported', () => {
  // That line is worth printing — it is how a reader learns the only thing of
  // this name is in another county — it just must not displace a real match.
  const town: [number, number] = [36.7, -91.87]; // Alton, MO
  const best = pickBest('Camp River Campground', town, [
    { name: 'Two Rivers Campground', lat: 37.19, lng: -91.28 },
  ]);
  assert.ok(best);
  assert.equal(best.verdict.ok, false);
  assert.ok(best.verdict.miles > 12);
});

test('among equally bad candidates the nearer one is shown', () => {
  const town: [number, number] = [37.15, -91.36];
  const best = pickBest("Story's Creek Campground", town, [
    { name: 'Hazel Creek Campground', lat: 39.9, lng: -92.9 },
    { name: 'Hazel Creek Campground', lat: 37.4, lng: -91.5 },
  ]);
  assert.ok(best);
  assert.ok(best.verdict.miles < 60);
});

test('no candidates at all yields null rather than a fabricated match', () => {
  assert.equal(pickBest('Anything', [37, -91], []), null);
});
