// shared/float-time-caveat.ts
// The sentence that travels with a dam-tailwater float time.
//
// ── Why one module, in shared/ ─────────────────────────────────────────────
// Stage 3 of the field-usability plan let a tailwater be ESTIMATED when a live
// flow was on hand, flagged `releaseDependent`, instead of refused outright.
// The iOS plan card then said "Built from the current dam release" — and three
// things about that sentence were untrue at least some of the time:
//
//   1. On the published-time branch (`model: 'known'`) the number is an
//      outfitter's figure scaled by the condition band. No discharge went into
//      it at all. It is still invalidated by a generation change, so the flag
//      is right; the provenance claim was not.
//   2. On the flow branch the discharge is whatever gauge the segment lookup
//      chose for the put-in, whose role may be `downstream` (Poplar Bluff)
//      rather than `release`. It is "the flow at that gauge", not "the
//      release".
//   3. Chat and the website served the same newly-unlocked number with no
//      caveat of any kind, because the sentence lived in one iOS component.
//
// So the sentence is built HERE, from the model and the gauge the server named,
// and every surface — iOS card, website card, chat tool result — asks for it.
// shared/ is @eddy/conditions on iOS and @shared on the web.

export type FloatTimeCaveatModel = 'known' | 'flow' | 'band';

export interface ReleaseCaveatInput {
  /** A generation change invalidates this time. True for every model on a tailwater. */
  releaseDependent: boolean;
  /** Which model produced the number. Unknown reads as "not the flow model". */
  model?: FloatTimeCaveatModel | string | null;
  /** The station whose flow the estimate used, when the flow model ran. */
  gaugeName?: string | null;
}

/** The headline for a tailwater with no flow to estimate from. */
export const REGULATED_HEADLINE = 'No single float time';

/** The sentence under it. Uncertainty about WHEN, not a verdict about whether. */
export const REGULATED_SENTENCE =
  'Dam releases can change mid-float, so one estimate would be wrong the moment the ' +
  "units start or stop. Check the dam's schedule before you go.";

const TAIL =
  "If generation starts or stops mid-float this time is wrong — check the dam's schedule " +
  'before you launch.';

/**
 * The caveat beside a release-dependent float time, or null when there is
 * none to give. Says what the number was actually built from:
 *
 *   flow model   "Estimated from the flow at Black River below Clearwater Dam
 *                 right now. If generation…"
 *   anything else "Assumes the release stays as it is now. If generation…"
 *
 * Never "built from the current dam release": the estimate has never read the
 * release itself, only a gauge somewhere below it.
 */
export function releaseCaveat(input: ReleaseCaveatInput | null | undefined): string | null {
  if (!input?.releaseDependent) return null;
  if (input.model === 'flow') {
    const where = input.gaugeName ? `the flow at ${input.gaugeName}` : 'the flow below the dam';
    return `Estimated from ${where} right now. ${TAIL}`;
  }
  return `Assumes the release stays as it is now. ${TAIL}`;
}

/** The short form for a "How this estimate works" row. */
export const RELEASE_HOW_ROW = 'Only while the release holds.';
