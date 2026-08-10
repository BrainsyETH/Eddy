// src/lib/stays-search.test.ts
// The "search Airbnb nearby" link, run from the web suite.
//
// Covers eddy-ios/src/lib/stays.ts. The box arithmetic is the whole substance
// of that file, and it is the kind that looks right and is a third wrong.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  airbnbSearchUrl,
  boundingBox,
  staySearchAreaLabel,
  STAY_SEARCH_RADIUS_MILES,
} from '../../../eddy-ios/src/lib/stays';

// Akers Ferry on the Current River — the middle of Eddy's world.
const AKERS = { lat: 37.3767, lng: -91.5561 };

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

test('the box is centred on the place and spans twice the radius', () => {
  const box = boundingBox(AKERS, 10);
  assert.ok(box.neLat > AKERS.lat && box.swLat < AKERS.lat);
  assert.ok(box.neLng > AKERS.lng && box.swLng < AKERS.lng);
  assert.ok(Math.abs((box.neLat + box.swLat) / 2 - AKERS.lat) < 1e-9, 'centred in latitude');
  assert.ok(Math.abs((box.neLng + box.swLng) / 2 - AKERS.lng) < 1e-9, 'centred in longitude');
});

test('longitude is widened by latitude, or the box is a third too narrow', () => {
  // THE bug this file exists to not have. Degrees of longitude converge toward
  // the poles, so a box built from the same delta both ways is 20% narrow at
  // Missouri's latitude — quietly missing the towns either side, which is
  // exactly where the cabins are.
  const box = boundingBox(AKERS, 10);
  const latSpan = box.neLat - box.swLat;
  const lngSpan = box.neLng - box.swLng;

  assert.ok(lngSpan > latSpan, 'a degree of longitude is shorter than one of latitude here');
  // cos(37.38°) ≈ 0.7947, so the longitude span is ~1.26x the latitude span.
  assert.ok(
    Math.abs(lngSpan / latSpan - 1 / Math.cos((AKERS.lat * Math.PI) / 180)) < 1e-6,
    'the ratio must be exactly 1/cos(lat)',
  );
});

test('the radius is a radius, so the box is twice it north-south', () => {
  // 5 miles / 69.05 miles-per-degree ≈ 0.0724°, so a 5-mile RADIUS is a
  // ~0.1448° tall box — about ten miles across. Wrong units here would be
  // invisible in the URL and obvious on the map, and confusing the radius for
  // the diameter would halve or double the search area silently.
  const box = boundingBox(AKERS, 5);
  assert.ok(Math.abs(box.neLat - box.swLat - 0.14483) < 0.001);
});

test('a bigger radius makes a bigger box, in both directions', () => {
  const small = boundingBox(AKERS, 5);
  const big = boundingBox(AKERS, 25);
  assert.ok(big.neLat - big.swLat > small.neLat - small.swLat);
  assert.ok(big.neLng - big.swLng > small.neLng - small.swLng);
});

test('the url carries the box and tells Airbnb to honour it', () => {
  const url = airbnbSearchUrl(AKERS)!;
  const q = params(url);

  assert.equal(new URL(url).origin + new URL(url).pathname, 'https://www.airbnb.com/s/homes');
  // Without search_by_map, Airbnb geocodes a place name and drifts to the
  // nearest town centre, which is not the question that was asked.
  assert.equal(q.get('search_by_map'), 'true');
  for (const key of ['ne_lat', 'ne_lng', 'sw_lat', 'sw_lng']) {
    assert.ok(q.get(key), `${key} missing`);
    assert.ok(Number.isFinite(Number(q.get(key))), `${key} is not a number`);
  }
  assert.ok(Number(q.get('ne_lat')) > Number(q.get('sw_lat')), 'north is north of south');
  assert.ok(Number(q.get('ne_lng')) > Number(q.get('sw_lng')), 'east is east of west');
});

test('a place with no geocode gets no button', () => {
  // Some directory rows have no coordinates at all. A button opening a search
  // of the whole world is worse than no button.
  assert.equal(airbnbSearchUrl(null), null);
  assert.equal(airbnbSearchUrl(undefined), null);
  assert.equal(airbnbSearchUrl({ lat: 0, lng: 0 }), null, 'null island is not a campground');
  assert.equal(airbnbSearchUrl({ lat: Number.NaN, lng: -91 }), null);
});

test('the default radius is the one the box is built from', () => {
  const box = boundingBox(AKERS);
  const explicit = boundingBox(AKERS, STAY_SEARCH_RADIUS_MILES);
  assert.deepEqual(box, explicit);
});

test('the copy states the DIAMETER, and derives it from the radius', () => {
  // The row says "About 10 miles across" while the constant is a 5-mile radius,
  // and those agree only because the label multiplies. Writing the number by
  // hand is how a row comes to state a distance it is not searching — which is
  // the failure this asserts against, not the arithmetic.
  assert.equal(staySearchAreaLabel(), `About ${STAY_SEARCH_RADIUS_MILES * 2} miles across`);
  assert.equal(staySearchAreaLabel(), 'About 10 miles across');
  assert.equal(staySearchAreaLabel(25), 'About 50 miles across');
});

test('no zoom parameter is sent, documented or otherwise', () => {
  // Airbnb publishes `search_by_map` and the four bounds; it publishes no zoom
  // parameter. Guessing one is how a link starts depending on undocumented
  // behaviour that can change without notice — and the bounds already say
  // everything a zoom would.
  const q = params(airbnbSearchUrl(AKERS)!);
  for (const key of [...q.keys()]) {
    assert.ok(!/zoom/i.test(key), `unexpected zoom-ish parameter: ${key}`);
  }
});
