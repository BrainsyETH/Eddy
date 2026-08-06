// eddy-ios/src/components/map-sheet/peekSlot.ts
// Which single fact the collapsed sheet reserves room for, decided before any
// request is made.
//
// ── THE SIGNATURE IS THE GUARANTEE ───────────────────────────────────────
//
// There is deliberately no `detail` parameter. That absence is not an oversight
// to be corrected the first time a caller wants to be cleverer — it is the whole
// mechanism, and it is why the peek cannot move.
//
// The problem it solves: a put-in's water and a campground's availability both
// arrive from useAccessPointDetail, a few hundred milliseconds after the sheet
// is already open and being read. Anything that renders NOTHING and then
// SOMETHING changes the peek's measured height, and MapSheet does exactly what
// it promises in that situation — it follows its own detent to the new height
// over 180ms. What the reader sees is the sheet resettling under their thumb for
// having done nothing at all. That is the same class of defect PR #1151 fixed by
// choosing the shell from the pin's TYPE rather than from how many tabs had
// qualified, and this is the same answer one level down.
//
// So the slot is chosen from what is known on the FIRST FRAME: the layer the
// finger landed on, and whether the river carries any gauge at all — both of
// which the map screen is already holding when it draws the pin. A function that
// cannot see the response cannot change its mind when the response lands.
//
// ── One slot, never two ───────────────────────────────────────────────────
//
// A campground that is also a put-in has both facts, and stacking them was the
// original sin: a tent tap would grow a water block AND a fortnight of nights
// after the sheet had settled. The LAYER is the intent signal — the campgrounds
// and access layers present the very same access point under different icons,
// and the one tapped is the one being looked for. Same precedence as
// placeSymbol's and initialTabKey's, for the same reason.
//
// ── Why 'none' exists, and why it is not "we could not tell" ──────────────
//
// A river with no gauge at all will never produce a reading, so reserving space
// for one would spend 30pt of a peek that is negotiating with the map for the
// screen — and then collapse it, which is the movement this module exists to
// prevent, merely delayed. Asking `riverHasGauges` up front is what lets the
// common ungauged case reserve nothing and say nothing.
//
// ── The slot NEVER collapses, which is why it may say it found nothing ────
//
// Reserving space and then removing it is just movement on a timer. So once a
// slot is reserved it stays reserved, and a request that resolves to nothing
// gets a terminal line rather than an empty box — "No gauge grades this stretch
// yet", the exact words AccessConditionsTab used before this replaced it.
//
// That is a SCOPED exception to the sheet's absent-never-empty rule
// (sections.tsx), and the distinction is real: that rule exists to keep
// database-shaped rows like "Parking: unknown" off a surface competing with the
// map. This is not one of those. The reader tapped a tent, was told Eddy was
// checking, and is owed the outcome — silence after a promise reads as a broken
// app, which is the failure the rule is trying to avoid, not an instance of it.
//
// ── A pure .ts module, on purpose ────────────────────────────────────────
//
// The web suite type-checks and runs this file (the Expo app has no runner of
// its own) and resolves `@/*` to its OWN src/, so nothing here may import
// through the app alias or from a .tsx. Same constraint as tabs.ts and
// placeSymbol.ts — see their headers.

/**
 * The one fact the collapsed sheet holds room for.
 *
 * `none` is a decision, not a failure: it means this pin can produce neither
 * fact, so nothing is reserved and nothing will appear.
 */
export type DecisionSlot = 'water' | 'availability' | 'none';

/** Just the fields the rules read. Structural — see the header. */
interface LayerTapped {
  layer: string;
  /**
   * Whether this place can be booked through Eddy at all.
   *
   * From the PIN — `MapAccessPoint.hasLiveAvailability` for an access point, or
   * the availability the campgrounds layer already carries for a service — so it
   * is answerable on the first frame like everything else here.
   *
   * Without it a campground tap always reserved the card, and three quarters of
   * campgrounds have no booking system Eddy can read: 124 of 166 pins spent the
   * tallest block in the peek to say they had nothing to say, on the surface
   * with the least room to spare.
   */
  hasAvailability: boolean;
}

/**
 * What the map already knows about the pin's surroundings when it draws it.
 *
 * `riverHasGauges` comes from the statewide network the map screen is already
 * holding (`network.bySlug`), NOT from the access-point detail response — the
 * whole point is that this is answerable on the first frame.
 */
export interface SlotContext {
  riverHasGauges: boolean;
}

/**
 * ── THERE ARE NO HEIGHT CONSTANTS HERE, AND THAT IS THE SECOND FIX ───────
 *
 * This module used to export WATER_SLOT_HEIGHT and AVAILABILITY_SLOT_HEIGHT for
 * GlanceSlot to reserve with, and both were wrong. The campground card measured
 * 106pt against a declared 96, so the `minHeight` built from it was inert and
 * the sheet moved anyway; and the card had three different heights depending on
 * which state availabilityHero returned, so it moved by a different amount per
 * campground.
 *
 * The deeper problem is that no number could have been right. The height being
 * predicted depends on the reader's TEXT SIZE, which is a runtime property — a
 * constant correct at the default is wrong at every accessibility size, in the
 * direction that pushes the action row off the peek.
 *
 * GlanceSlot reserves by MOUNTING the real component in a pending mode instead,
 * so the reservation is the thing it is reserving for. Deciding WHICH fact is
 * still this module's job and is still detail-free; predicting how tall it will
 * be never was answerable here.
 */

/**
 * Which fact this pin's peek reserves room for.
 *
 * Gauges and hazards get `none` — a gauge's reading is carried on the pin itself
 * (see PinSheet's gaugeFacts, built from pin.value and pin.code) and paints on
 * the first frame with nothing outstanding, so it needs no reservation; a hazard
 * has neither fact.
 */
export function decisionSlot(pin: LayerTapped, context: SlotContext): DecisionSlot {
  // The tent wins over everything, including a point that is also a boat ramp on
  // a well-gauged river — somebody tapping a campground icon is asking where
  // they sleep. But only when there is an answer: a campground Eddy cannot book
  // FALLS THROUGH to the water rather than reserving a card to be empty in.
  //
  // That fall-through is why the flag has to be on the pin. Deciding it from the
  // response would put the choice back after the sheet had settled, which is the
  // one thing this module exists to prevent.
  if (pin.layer === 'campgrounds' && pin.hasAvailability) return 'availability';
  if (pin.layer !== 'campgrounds' && pin.layer !== 'access') return 'none';
  return context.riverHasGauges ? 'water' : 'none';
}
