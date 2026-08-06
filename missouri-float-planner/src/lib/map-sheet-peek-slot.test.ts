import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AVAILABILITY_SLOT_HEIGHT,
  decisionSlot,
  slotHeight,
  WATER_SLOT_HEIGHT,
} from '../../../eddy-ios/src/components/map-sheet/peekSlot';

// Covers eddy-ios/src/components/map-sheet/peekSlot.ts. The Expo app has no
// runner of its own, and this rule is worth more than most: it is what keeps the
// collapsed sheet's top edge still while its detail request lands.
//
// The invariant these tests protect is UNUSUAL in that the strongest form of it
// is the function's signature rather than any assertion below — decisionSlot
// cannot see the detail response, so it cannot change its answer when one
// arrives. What is asserted here is that the signature stays that way and that
// every branch resolves to something with a reserved height.

const pin = (layer: string) => ({ layer });

test('the campgrounds layer always reserves availability, never water', () => {
  // The tent wins even on a well-gauged river. Somebody tapping a campground
  // icon is asking where they sleep; the water is a swipe away on the same
  // sheet. Same layer-wins precedence as placeSymbol and initialTabKey.
  assert.equal(decisionSlot(pin('campgrounds'), { riverHasGauges: true }), 'availability');
  assert.equal(decisionSlot(pin('campgrounds'), { riverHasGauges: false }), 'availability');
});

test('the access layer reserves water when the river has a gauge', () => {
  assert.equal(decisionSlot(pin('access'), { riverHasGauges: true }), 'water');
});

test('an ungauged river reserves nothing', () => {
  // The collapse case, designed out rather than animated. A river Eddy grades
  // with nothing will never produce a reading, so reserving 30pt and then taking
  // it back would be the same movement on a timer.
  assert.equal(decisionSlot(pin('access'), { riverHasGauges: false }), 'none');
  assert.equal(slotHeight('none'), 0);
});

test('gauges, hazards and dams reserve nothing', () => {
  // A gauge needs no reservation because its reading rides on the pin and paints
  // on the first frame; a hazard and a dam have neither fact.
  for (const layer of ['gauges', 'allGauges', 'hazards', 'dams', 'outfitters']) {
    assert.equal(decisionSlot(pin(layer), { riverHasGauges: true }), 'none');
  }
});

test('an unknown layer reserves nothing rather than guessing', () => {
  // A new layer must not silently inherit the water slot and start promising a
  // reading that will never arrive.
  assert.equal(decisionSlot(pin('somethingNew'), { riverHasGauges: true }), 'none');
});

test('every reserving slot has a non-zero height', () => {
  // A reservation of zero is not a reservation. If either constant is ever set
  // to 0, the peek starts moving again and nothing else in the suite would say
  // so.
  assert.ok(WATER_SLOT_HEIGHT > 0);
  assert.ok(AVAILABILITY_SLOT_HEIGHT > 0);
  assert.equal(slotHeight('water'), WATER_SLOT_HEIGHT);
  assert.equal(slotHeight('availability'), AVAILABILITY_SLOT_HEIGHT);
});

test('the availability slot is the taller of the two', () => {
  // It carries a headline and a fortnight of nights; the water slot is one line.
  // If this ever inverts, one of them has stopped drawing what it claims to.
  assert.ok(AVAILABILITY_SLOT_HEIGHT > WATER_SLOT_HEIGHT);
});

test('the answer does not depend on anything that arrives late', () => {
  // THE POINT OF THE WHOLE MODULE, stated as a test rather than only as a
  // signature. `decisionSlot` takes a pin and one boolean the map screen already
  // holds — there is no third argument for a response to occupy — so calling it
  // repeatedly across a request's lifetime cannot produce two different answers.
  //
  // A future edit that threads `detail` through here to be cleverer would have
  // to delete this test to do it, which is the point at which somebody reads the
  // header.
  assert.equal(decisionSlot.length, 2);

  const context = { riverHasGauges: true };
  const first = decisionSlot(pin('access'), context);
  const afterDetailWouldHaveLanded = decisionSlot(pin('access'), context);
  assert.equal(first, afterDetailWouldHaveLanded);
});
