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

/** Just the field the layer rule reads. Structural — see the header. */
interface LayerTapped {
  layer: string;
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
 * How tall each slot reserves, in points.
 *
 * Declared here rather than in the component so the number is visible beside the
 * rule that needs it, and so a test can assert the reservation exists at all.
 *
 * These are FLOORS the filled state must also honour: the reserved box and the
 * real content are given the same minHeight, so content shorter than the
 * reservation is padded rather than snapping the sheet shorter. Content TALLER
 * than the reservation would still move the peek, which is why the water row is
 * a single line by construction and the availability card is fixed-height.
 */
export const WATER_SLOT_HEIGHT = 30;
export const AVAILABILITY_SLOT_HEIGHT = 96;

export function slotHeight(slot: DecisionSlot): number {
  if (slot === 'water') return WATER_SLOT_HEIGHT;
  if (slot === 'availability') return AVAILABILITY_SLOT_HEIGHT;
  return 0;
}

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
  // a well-gauged river. Somebody tapping a campground icon is asking where they
  // sleep, and the water is a swipe away on the same sheet.
  if (pin.layer === 'campgrounds') return 'availability';
  if (pin.layer !== 'access') return 'none';
  return context.riverHasGauges ? 'water' : 'none';
}
