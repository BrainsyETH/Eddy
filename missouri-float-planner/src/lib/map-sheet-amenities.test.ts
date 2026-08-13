import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessAmenities,
  accessAmenityLabel,
  drawableAmenities,
} from '../../../eddy-ios/src/components/map-sheet/accessAmenities';

// Covers the one derivation that turns `access_points.amenities` into something
// a reader can use. Before it, every surface in the product rendered the raw
// column: the sheet showed a pill reading `boat_ramp`.
//
// The column is an unconstrained TEXT[], so the interesting cases here are the
// ones the database permits and the vocabulary does not describe.

test('the declared vocabulary gets labels, not slugs', () => {
  const labels = accessAmenities(['parking', 'restrooms', 'boat_ramp']).map((a) => a.label);
  assert.deepEqual(labels, ['Parking', 'Restrooms', 'Boat ramp']);
});

test('the four the catalog has drawn carry their mark', () => {
  const marks = new Map(
    accessAmenities(['parking', 'restrooms', 'camping', 'boat_ramp']).map((a) => [a.slug, a.symbol]),
  );
  assert.deepEqual(
    marks,
    new Map([
      ['parking', 'parking'],
      ['restrooms', 'facilities'],
      ['camping', 'campground'],
      ['boat_ramp', 'boatRamp'],
    ]),
  );
});

test('picnic and store keep the word and take no mark', () => {
  // ABSENT, NEVER SUBSTITUTED. `facilities` is the restroom drawing, so hanging
  // a picnic area on it would make one drawing mean two things in one sheet.
  for (const slug of ['picnic', 'store']) {
    const [entry] = accessAmenities([slug]);
    assert.equal(entry.symbol, null, `${slug} must not borrow a mark`);
    assert.ok(entry.label.length > 0, `${slug} must still be named`);
  }
});

test('store is handled even though AMENITIES omits it', () => {
  // It is in the seed data and has never been in the web constant — exactly the
  // drift an unconstrained column invites, and the reason this is a decoder
  // rather than a total table.
  assert.deepEqual(accessAmenities(['store']), [
    { slug: 'store', label: 'Store', symbol: null },
  ]);
});

test('a value nobody has declared is shown, not dropped', () => {
  // Silently discarding it is how a real fact about a put-in disappears with no
  // bug report. Humanised so it sits beside the known ones.
  assert.deepEqual(accessAmenities(['fish_cleaning_station']), [
    { slug: 'fish_cleaning_station', label: 'Fish cleaning station', symbol: null },
  ]);
});

test('order is the row order, not sorted', () => {
  // Two put-ins with the same amenities must not look different for a reason no
  // reader could name.
  const forward = accessAmenities(['restrooms', 'parking']).map((a) => a.slug);
  assert.deepEqual(forward, ['restrooms', 'parking']);
});

test('blanks, whitespace and case are normalised', () => {
  assert.deepEqual(
    accessAmenities(['  Parking ', '', '   ', 'RESTROOMS']).map((a) => a.label),
    ['Parking', 'Restrooms'],
  );
});

test('a repeated value draws once', () => {
  // A repeated mark reads as two of the thing rather than as one recorded twice.
  assert.equal(accessAmenities(['parking', 'parking']).length, 1);
});

test('null, undefined and empty all give nothing', () => {
  assert.deepEqual(accessAmenities(null), []);
  assert.deepEqual(accessAmenities(undefined), []);
  assert.deepEqual(accessAmenities([]), []);
});

test('drawableAmenities keeps only the ones with a mark', () => {
  const drawable = drawableAmenities(['parking', 'picnic', 'boat_ramp']);
  assert.deepEqual(
    drawable.map((a) => a.slug),
    ['parking', 'boat_ramp'],
  );
});

test('the spoken label names everything, drawable or not', () => {
  // The row is announced once and in full: an amenity with no mark is still a
  // fact, and VoiceOver is where it survives the glance dropping it.
  assert.equal(accessAmenityLabel(['parking', 'picnic']), 'Parking, Picnic area');
});

test('the spoken label is null rather than empty when there is nothing', () => {
  // So a caller drops the property instead of announcing a blank.
  assert.equal(accessAmenityLabel([]), null);
  assert.equal(accessAmenityLabel(null), null);
});
