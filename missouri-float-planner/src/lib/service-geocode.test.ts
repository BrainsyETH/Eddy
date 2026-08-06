// src/lib/service-geocode.test.ts
// What may become a map pin, and the matcher that decides what gets written.
//
// Covers eddy-ios/src/map/mappable.ts and the accept rule in
// scripts/ingestion/geocode-services-dryrun.ts. The fixtures are the real
// measured near-misses, because the thresholds were chosen from them and a
// change that lets any of them through is the change worth catching.

import assert from 'node:assert/strict';
import test from 'node:test';
import { mappableService, searchableService } from '../../../eddy-ios/src/map/mappable';
import { accepts, milesBetween, nameScore } from '../../scripts/ingestion/geocode-services-dryrun';

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

test('searching around a place is a weaker requirement than pointing at it', () => {
  // A ten-mile "stays nearby" box does not care which end of town it starts
  // from. Two surfaces, two thresholds, one recorded fact — which is the whole
  // reason precision is stored rather than coordinates simply withheld.
  const centroid = { latitude: 37.15, longitude: -91.35, geocodePrecision: 'centroid' as const };
  assert.equal(mappableService(centroid), false);
  assert.equal(searchableService(centroid), true);
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
