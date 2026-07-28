// eddy-ios/src/theme/floodStage.ts
// NWS flood stages — the THIRD visual language, and the last one.
//
// Read the headers of src/theme/conditions.ts and src/theme/flow.ts first. The
// app already keeps two vocabularies deliberately apart:
//
//   CONDITION_SYSTEM  a VERDICT. "Eddy has rated this stretch and says float
//                     it / don't." Greens, lime, yellow, orange, red.
//   FLOW_BAND_SYSTEM  a COMPARISON. "This station is higher than usual for the
//                     date." Never permission. One teal ramp, no shared hue.
//
// A flood stage is neither. It is a threshold PUBLISHED BY SOMEONE ELSE — the
// National Weather Service — for a specific station, and quoting it is not the
// same as issuing a verdict. That distinction is exactly the one that let the
// national tier have flood stages at all; see the header of
// scripts/import-nwps-gauges.ts, which says it outright: "quoting someone
// else's official threshold is not the same as inventing one."
//
// ── Why violet, for a thing about flooding ─────────────────────────────────
// Because red is spoken for, and it is spoken for by a claim Eddy is declining
// to make. A red line across an unrated creek's hydrograph would read as Eddy
// saying "dangerous" about a stretch nobody has rated — the precise confusion
// the flow-band ramp abandoned green and red to avoid. Violet appears in
// neither system and in no part of the brand palette, so a violet line can only
// be the thing its own label says it is.
//
// ── One hue across all four categories ─────────────────────────────────────
// Action, flood, moderate and major are one authority's one scale, so they are
// one colour at rising opacity with a tightening dash. A four-colour ramp would
// invite reading the categories as four different KINDS of fact, and — worse —
// would need four hues that avoid two existing systems.
//
// THE LINE IS NEVER THE WHOLE MESSAGE. Every stage drawn must carry its label,
// for the same reason the flow bands must: four steps of one violet are not
// reliably separable on a phone in sunlight, and "NWS flood stage" is the part
// that says whose threshold this is.

/** Violet-600. In no condition ladder, no flow band, and no brand family. */
const NWS_HUE = '#7C3AED';

export type FloodStageKey = 'action' | 'flood' | 'moderate' | 'major';

/**
 * Lowest first, which is the order they cross as a river rises — and therefore
 * the order they should be searched to answer "which one is this reading past".
 */
export const FLOOD_STAGE_ORDER: FloodStageKey[] = ['action', 'flood', 'moderate', 'major'];

interface FloodStageDef {
  /** The NWS's own name for the category. Never paraphrased. */
  label: string;
  /** Rising with severity, so major reads as the firmest line on the chart. */
  opacity: number;
  /** Tightening with severity — the redundant cue for the opacity ramp. */
  dash: string;
  /**
   * What being ABOVE this stage means, in the NWS's terms.
   *
   * Phrased as a description of the water and never as an instruction. Eddy
   * tells people what to do only about stretches it has rated; here it is
   * relaying somebody else's measurement, and "do not float" is a sentence this
   * app has not earned the right to say about an unrated creek.
   */
  sentence: string;
}

export const FLOOD_STAGE_SYSTEM: Record<FloodStageKey, FloodStageDef> = {
  action: {
    label: 'NWS action stage',
    opacity: 0.45,
    dash: '2,4',
    sentence: 'Above the NWS action stage — the level at which the Weather Service starts watching this gauge.',
  },
  flood: {
    label: 'NWS flood stage',
    opacity: 0.65,
    dash: '4,3',
    sentence: 'Above NWS minor flood stage.',
  },
  moderate: {
    label: 'NWS moderate flood',
    opacity: 0.8,
    dash: '6,2',
    sentence: 'Above NWS moderate flood stage.',
  },
  major: {
    label: 'NWS major flood',
    opacity: 1,
    dash: '8,2',
    sentence: 'Above NWS major flood stage.',
  },
};

export function floodStageColor(): string {
  return NWS_HUE;
}

/**
 * A stage, at the precision it was published at.
 *
 * NOT formatReading(), which fixes stage to two decimals — correctly, because
 * that function formats a MEASUREMENT and two decimals is what a gauge reports.
 * A flood stage is a THRESHOLD somebody chose, and they choose round numbers:
 * the curated backfill alone holds 20, 7, 13, 8, 5.3. Printing "20.00 ft" for a
 * line the Weather Service published as "20" claims a precision that is not in
 * the source, on the one number here Eddy did not measure.
 */
export function formatStage(feet: number): string {
  const rounded = Math.round(feet * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toString()} ft`;
}

export function floodStageLabel(key: FloodStageKey): string {
  return FLOOD_STAGE_SYSTEM[key].label;
}

/**
 * The highest stage a reading has passed, or null when it is below all of them
 * — or when there is nothing to compare against.
 *
 * FEET ONLY, and the caller must have established that before calling. NWPS
 * publishes these thresholds in feet and nothing else (its category `flow` field
 * comes back as -9999), so comparing a discharge against one is arithmetic that
 * produces a sentence about danger from two unrelated numbers. Every call site
 * guards on the unit; this function cannot, because it is handed a bare number.
 */
export function highestStagePassed(
  stages: Partial<Record<FloodStageKey, number | null>>,
  gaugeHeightFt: number | null | undefined,
): FloodStageKey | null {
  if (gaugeHeightFt == null || !Number.isFinite(gaugeHeightFt)) return null;

  let passed: FloodStageKey | null = null;
  for (const key of FLOOD_STAGE_ORDER) {
    const threshold = stages[key];
    if (threshold == null || !Number.isFinite(threshold)) continue;
    if (gaugeHeightFt >= threshold) passed = key;
  }
  return passed;
}
