import assert from 'node:assert/strict';
import test from 'node:test';
import { decisionSlot } from '../../../eddy-ios/src/components/map-sheet/peekSlot';

// Covers eddy-ios/src/components/map-sheet/peekSlot.ts. The Expo app has no
// runner of its own, and this rule is worth more than most: it is what keeps the
// collapsed sheet's top edge still while its detail request lands.
//
// The invariant these tests protect is UNUSUAL in that the strongest form of it
// is the function's signature rather than any assertion below — decisionSlot
// cannot see the detail response, so it cannot change its answer when one
// arrives. What is asserted here is that the signature stays that way and that
// every branch resolves to something with a reserved height.

const pin = (layer: string, hasAvailability = false) => ({ layer, hasAvailability });

test('a bookable campground reserves availability, even on a gauged river', () => {
  // The tent wins where there is an answer. Somebody tapping a campground icon
  // is asking where they sleep; the water is a swipe away on the same sheet.
  // Same layer-wins precedence as placeSymbol and initialTabKey.
  assert.equal(decisionSlot(pin('campgrounds', true), { riverHasGauges: true }), 'availability');
  assert.equal(decisionSlot(pin('campgrounds', true), { riverHasGauges: false }), 'availability');
});

test('a campground Eddy cannot book falls through to the water', () => {
  // THE COMMON CASE: 42 of 166 campground pins are linked to a booking system
  // Eddy can read. Reserving the card for the other 124 spent the tallest block
  // in the peek — on the surface with the least room to spare — to say there was
  // nothing to say.
  //
  // It falls through rather than reserving nothing: a campground is still a
  // place on a river, and the water is a real fact about it.
  assert.equal(decisionSlot(pin('campgrounds', false), { riverHasGauges: true }), 'water');
  assert.equal(decisionSlot(pin('campgrounds', false), { riverHasGauges: false }), 'none');
});

test('the access layer reserves water when the river has a gauge', () => {
  assert.equal(decisionSlot(pin('access'), { riverHasGauges: true }), 'water');
});

test('a boat ramp is an access point and reserves the water like one', () => {
  // The rule used to be spelt `layer !== 'campgrounds' && layer !== 'access'`,
  // which is a list of the marks that existed when it was written. A ramp would
  // have fallen through to `none` and silently lost its reading — the failure
  // ADR 0008 records, in the one module where it is invisible until somebody
  // taps a ramp on a gauged river.
  assert.equal(decisionSlot(pin('boatRamps'), { riverHasGauges: true }), 'water');
  assert.equal(decisionSlot(pin('boatRamps'), { riverHasGauges: false }), 'none');
  // And a ramp is not a campground, whatever the place is also tagged: the
  // reserved fact follows the mark that was tapped.
  assert.equal(decisionSlot(pin('boatRamps', true), { riverHasGauges: true }), 'water');
});

test('an ungauged river reserves nothing', () => {
  // The collapse case, designed out rather than animated. A river Eddy grades
  // with nothing will never produce a reading, so reserving space and then
  // taking it back would be the same movement on a timer.
  assert.equal(decisionSlot(pin('access'), { riverHasGauges: false }), 'none');
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

/*
 * ── WHAT IS DELIBERATELY NOT TESTED HERE ─────────────────────────────────
 *
 * Two tests used to assert the slot HEIGHT constants were positive and ordered.
 * They passed while the campground card was 106pt against a declared 96 — the
 * peek moved ten points and every assertion in this file stayed green, because
 * a constant being non-zero says nothing about whether it matches what renders.
 *
 * The constants are gone: GlanceSlot reserves by mounting the real component in
 * a pending mode, so the reservation IS the thing being reserved for and there
 * is no number left to get wrong. Nothing replaced those assertions, because
 * nothing here can render React Native — this suite is node:test over pure .ts.
 * The height claim is checked at run time instead, by the __DEV__ onLayout
 * comparison in GlanceSlot, which runs on every device at every text size.
 *
 * If a height constant ever comes back into this module, it will need a much
 * better answer than the two tests it deleted.
 */

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
