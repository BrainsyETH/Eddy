// shared/flow-band.ts
//
// The SECOND vocabulary: how a gauge compares to its own history.
//
// ── Why this is not a ConditionCode ─────────────────────────────────────────
// CONDITION_SYSTEM answers "should you float this river today". It only means
// anything where a human has rated a specific stretch against a specific gauge
// — that is what river_gauges.level_* is, and there are 46 of them. The
// national tier is ~14,000 gauges nobody has rated.
//
// So the honest thing a gauge can say about itself with no curation at all is
// how today's flow compares to this same day in its own record. That is a
// HYDROLOGICAL FACT, not a verdict. "Much higher than usual for this time of
// year" is true whether the river is a Class V torrent or a flat float; whether
// you should be on it is a different question, and one Eddy declines to answer
// for an unrated gauge. See docs/EDDY_IOS_STRATEGY.md ("Eddy never issues a
// floatability verdict on an uncurated gauge") and the "Data honesty" section
// of docs/mo-surface-water-observatory.md.
//
// This file sits BESIDE condition-system.ts on purpose, so the difference
// between the two is visible to the next person rather than something they
// have to reconstruct. Do not merge them. Do not map one onto the other.
//
// ── Why these cut points ────────────────────────────────────────────────────
// 10 / 25 / 75 / 90 are not a new invention. They are exactly the boundaries
// percentileSentence() in eddy-ios/src/lib/readingCopy.ts has been shipping.
// (They were also PERCENTILE_RATINGS' cuts in src/lib/usgs/gauges.ts, before
// that system was retired for labelling unrated gauges with recreation
// verdicts.) Sharing them means the band and the sentence can never disagree
// about the same number.
//
// Pure TypeScript, no imports — the same constraint condition-system.ts is
// under, so Metro, tsx and Next can all consume it.

export type FlowBand = "much_lower" | "lower" | "normal" | "higher" | "much_higher";

export interface FlowBandDef {
  band: FlowBand;
  /**
   * Short label for a chip. A COMPARISON, never a verdict — no band may ever
   * borrow "Flowing", "Good", "Too Low" or "Flood" from CONDITION_SYSTEM.
   */
  label: string;
  /** The full sentence, matching percentileSentence() word for word. */
  sentence: string;
  /**
   * Canonical hex, for the same reason CONDITION_SYSTEM carries its own: so
   * there is exactly one definition and no surface can drift from it.
   *
   * These are the brand's teal scale (`primary` in eddy-ios/src/theme/palette.ts)
   * with warm stone at the dry end, transcribed here so the ramp is testable
   * from the web runner — the app has none — and so the website can adopt the
   * same ramp without reaching into the phone's palette.
   *
   * THE CONSTRAINT: no value here may equal any CONDITION_SYSTEM colour, and
   * none may be green or red. Green and red are learnable verdicts in this
   * product; a reference gauge makes no verdict. flow-band.test.ts asserts it.
   */
  solid: string;
}

/**
 * Driest to wettest.
 *
 * Deliberately NOT a severity order. CONDITION_SYSTEM has two orderings because
 * "most alarming first" and "most floatable first" are different questions;
 * this has one, because a percentile is a position on a scale and nothing else.
 * There is no "worst" flow band — a river at the 5th percentile is low, not
 * dangerous, and one at the 95th is high, not necessarily unrunnable.
 */
export const FLOW_BAND_ORDER: FlowBand[] = [
  "much_lower",
  "lower",
  "normal",
  "higher",
  "much_higher",
];

export const FLOW_BAND_SYSTEM: Record<FlowBand, FlowBandDef> = {
  much_lower: {
    band: "much_lower",
    label: "Much lower",
    sentence: "Much lower than usual for this time of year",
    // Warm stone (neutral[400]). The dry end leaves the teal family on purpose:
    // "barely any water" is qualitatively different from "some water", and
    // stone says it in a way a pale teal does not.
    solid: "#A49C8E",
  },
  lower: {
    band: "lower",
    label: "Lower",
    sentence: "Lower than usual for this time of year",
    solid: "#A3D1DB", // primary[200]
  },
  normal: {
    band: "normal",
    label: "Normal",
    sentence: "About normal for this time of year",
    solid: "#4A9AAD", // primary[400]
  },
  higher: {
    band: "higher",
    label: "Higher",
    sentence: "Higher than usual for this time of year",
    solid: "#256574", // primary[600]
  },
  much_higher: {
    band: "much_higher",
    label: "Much higher",
    sentence: "Much higher than usual for this time of year",
    solid: "#163F4A", // primary[800]
  },
};

/**
 * The dot for a gauge we hold no statistics for.
 *
 * Its own colour, not `normal`'s: painting an ungraded gauge as normal claims
 * we compared it to something. Stone-300, one step lighter than the dry end, so
 * it reads as absent rather than as the bottom of the scale.
 */
export const FLOW_BAND_UNKNOWN_SOLID = "#C2BAAC";

/**
 * Percentile → band, or null when there is no percentile.
 *
 * NULL IS A REAL ANSWER and the common one: most of the ~14,000 national
 * gauges have no day-of-year statistics snapshot, and plenty never will (a
 * station commissioned last year has no history to compare against). Callers
 * must render null as "no comparison available", never as "normal" — claiming
 * a river is running normally when we have nothing to compare it to is exactly
 * the kind of invented reassurance the condition ladder refuses to make when
 * a station has no rating.
 */
export function flowBand(percentile: number | null | undefined): FlowBand | null {
  if (percentile === null || percentile === undefined) return null;
  if (!Number.isFinite(percentile)) return null;

  const p = Math.max(0, Math.min(100, percentile));
  if (p < 10) return "much_lower";
  if (p < 25) return "lower";
  if (p < 75) return "normal";
  if (p < 90) return "higher";
  return "much_higher";
}

/** The chip label, or null when there is no band to label. */
export function flowBandLabel(band: FlowBand | null): string | null {
  return band ? FLOW_BAND_SYSTEM[band].label : null;
}

/** The full sentence, or null. Matches percentileSentence() exactly. */
export function flowBandSentence(band: FlowBand | null): string | null {
  return band ? FLOW_BAND_SYSTEM[band].sentence : null;
}
