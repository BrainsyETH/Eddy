import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessAmenities,
  accessAmenityLabel,
  accessAmenityLabelFor,
  drawableAmenities,
  drawableAmenitiesFor,
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

/* ── Reading the rest of the row ──────────────────────────────────────────── */
//
// `amenities` is empty on roughly half the approved catalog while the same rows
// carry a facilities sentence describing exactly what is there. These cases are
// taken verbatim from production rows, because the risk here is not a missing
// mark — it is a mark on a put-in whose own description says it has none, which
// is a wasted drive rather than a wasted glance.

test('the facilities sentence is read when the column is empty', () => {
  // Baptist Camp on the Current, exactly as stored: no amenities array, and
  // every fact about it in prose beside a recorded capacity.
  const marks = drawableAmenitiesFor({
    amenities: null,
    facilities: 'Vault toilets only. No water, no camping allowed at this access.',
    parkingInfo: 'Paved lot with ample parking. Gets busy on summer weekends and during trout season.',
    parkingCapacity: '20',
  });

  assert.deepEqual(
    marks.map((m) => m.slug).sort(),
    ['parking', 'restrooms'],
    'toilets and a paved lot are drawn; the camping it explicitly forbids is not',
  );
});

test('a negated clause denies its terms rather than matching them', () => {
  // Every one of these is a real facilities line. A matcher that only looked
  // for the word would put a mark on all four.
  const none = (evidence: Parameters<typeof drawableAmenitiesFor>[0]) =>
    drawableAmenitiesFor(evidence).map((m) => m.slug);

  assert.deepEqual(none({ facilities: 'No developed facilities. Undeveloped bridge access. No restrooms.' }), []);
  assert.deepEqual(none({ parkingInfo: 'No public parking at bridge.' }), []);
  assert.deepEqual(none({ parkingInfo: 'No lot; roadside only.' }), []);
  assert.deepEqual(
    none({ facilities: 'No restrooms, potable water, picnic tables, or maintained structures' }),
    [],
    'one "No" governing a list must not release the items after the first comma',
  );
});

test('a denial outranks a grant elsewhere in the same row', () => {
  // "One-lane gravel ramp, vault toilet; no water or developed day-use
  // amenities." The ramp and the toilet are real; the denial governs only its
  // own clause.
  const marks = drawableAmenitiesFor({
    facilities: 'One-lane gravel ramp, vault toilet; no water or developed day-use amenities.',
  });
  assert.deepEqual(marks.map((m) => m.slug).sort(), ['boat_ramp', 'restrooms']);

  // And a denial anywhere in the row beats a grant anywhere else in it.
  const contradicted = drawableAmenitiesFor({
    facilities: 'Concrete boat ramp. No boat ramp is maintained above the falls.',
  });
  assert.deepEqual(contradicted.map((m) => m.slug), []);
});

test('a launch is not a ramp', () => {
  // "Essentially a kayak/boat launch" is a bank you slide a boat down. The mark
  // says a vehicle can back a trailer to the water, and somebody towing one
  // acts on that. The catalog writes real ones as ramps and slipways.
  const launch = drawableAmenitiesFor({
    facilities: 'Minimal – essentially a kayak/boat launch; no restrooms or park buildings.',
  });
  assert.deepEqual(launch.map((m) => m.slug), [], 'no ramp mark, and no restroom either');

  const ramp = drawableAmenitiesFor({ facilities: 'Concrete boat ramp with courtesy dock.' });
  assert.deepEqual(ramp.map((m) => m.slug), ['boat_ramp']);
});

test('a structured positive loses to a prose denial, and that is the rule', () => {
  // A boat_ramp `type` beside "No boat ramp — carry-in access" is a
  // contradiction in the data. Drawing the mark would send a trailer; the safe
  // reading of a contradiction is silence. Asserted rather than left implicit,
  // because the opposite precedence is the obvious thing for somebody to
  // "fix" later.
  const marks = drawableAmenitiesFor({
    type: 'boat_ramp',
    facilities: 'No boat ramp — carry-in access at low-water bridge.',
  });
  assert.deepEqual(marks.map((m) => m.slug), []);
});

test('a comma list under one "No" costs a mark rather than inventing one', () => {
  // KNOWN LIMIT, asserted so it stays visible. "No restrooms, paved parking for
  // 20" loses the parking too, because the clause splitter does not break on
  // commas — and it must not, or "No restrooms, potable water, picnic tables"
  // releases everything after the first item. The failure is a missing mark,
  // never a wrong one, and the fix is the backfill rather than a cleverer
  // parser.
  assert.deepEqual(
    drawableAmenitiesFor({ facilities: 'No restrooms, paved parking for 20' }).map((m) => m.slug),
    [],
  );
  // The declared column is how such a row gets its marks back today.
  assert.deepEqual(
    drawableAmenitiesFor({
      amenities: ['parking'],
      facilities: 'No restrooms, paved parking for 20',
    }).map((m) => m.slug),
    ['parking'],
  );
});

test('an em-dashed aside cannot smuggle in what the clause denies', () => {
  // Big Piney's Baptist Camp Access: "No boat ramp — carry-in access at
  // low-water bridge." Splitting on the dash is what keeps "No boat ramp" from
  // being read as a sentence that mentions a boat ramp.
  const marks = drawableAmenitiesFor({
    amenities: ['parking', 'restrooms', 'picnic'],
    facilities:
      'Low-water bridge on County Road N-345; wade-fishing access. No boat ramp — carry-in access at low-water bridge.',
  });
  assert.deepEqual(marks.map((m) => m.slug), ['parking', 'restrooms']);
});

test('structured facts count, and the declared column is never re-derived', () => {
  const ramp = drawableAmenitiesFor({ amenities: [], type: 'boat_ramp' });
  assert.deepEqual(ramp.map((m) => m.slug), ['boat_ramp']);

  const camp = drawableAmenitiesFor({ amenities: [], npsCampground: { name: 'Alley Spring' } });
  assert.deepEqual(camp.map((m) => m.slug), ['camping']);

  // Declared already, so evidence adds nothing and the order is the row's.
  const declared = drawableAmenitiesFor({
    amenities: ['restrooms', 'parking'],
    parkingCapacity: '20',
    facilities: 'Vault toilets.',
  });
  assert.deepEqual(declared.map((m) => m.slug), ['restrooms', 'parking']);
});

test('the spoken label says everything the marks do', () => {
  // A row that draws a mark it does not speak gives a VoiceOver reader strictly
  // less than the screen shows.
  const evidence = {
    amenities: ['picnic'],
    facilities: 'Vault toilets only.',
    parkingCapacity: '20',
  };
  const spoken = accessAmenityLabelFor(evidence)!;
  for (const mark of drawableAmenitiesFor(evidence)) {
    assert.ok(spoken.includes(mark.label), `${mark.label} is drawn but not spoken`);
  }
  assert.ok(spoken.includes('Picnic area'), 'an undrawable declared amenity is still spoken');
});

test('a row with nothing to say says nothing', () => {
  assert.deepEqual(drawableAmenitiesFor({}), []);
  assert.equal(accessAmenityLabelFor({}), null);
  assert.equal(accessAmenityLabelFor({ facilities: 'county-road bridge access' }), null);
});
