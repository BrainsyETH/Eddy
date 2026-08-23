// shared/safety-summary.ts
// The one answer to "is there an official safety concern?"
//
// Both platforms and every renderer summarize a station's NWS flood status
// through this module, for the same reason the flood-stage unit guard lives in
// a memo on the iOS chart: precedence and phrasing must not be undoable by
// editing markup. The rules it encodes:
//
//   · NWS safety outranks Eddy recreation guidance. When a current or forecast
//     stage reaches an official category, that category IS the safety story,
//     whatever Eddy's condition ladder says about floating.
//   · Only the current-category state speaks in the present tense. A forecast
//     crossing reads as a forecast, or a forecast flood becomes a current one.
//   · Never infer safety from missing stages. "No official flood stages
//     published" is a statement about publication, not about the water.
//   · actionFt can be null while floodFt exists (curated stations carry two
//     stages, and some NWS stations publish action only), so "Below action
//     stage" is not always a legal sentence. The below-threshold state names
//     the lowest threshold that actually exists.
//
// Note on action-only stations: NWPS publishes some stations (e.g. BDPM7) with
// an action stage and -9999 sentinels for every flood category. The gauge
// route's publication gate (see api/gauges/[siteId]/route.ts) currently drops
// such stations' stages entirely — one unexplained violet line is not a chart
// worth drawing — so today they reach this machine as `stages: null` and read
// "No official flood stages published." This machine still handles the
// action-only shape correctly, so relaxing that gate is a route decision, not
// a rewrite here.
//
// The caller supplies a TRUSTED current stage or null — trust is
// reading-trust.ts's question. Feet only, established by the caller, for the
// reason documented on highestStagePassed().

import {
  FLOOD_STAGE_ORDER,
  highestStagePassed,
  type FloodStageKey,
} from './flood-stage';

export type FloodStageLevels = Partial<Record<FloodStageKey, number | null>>;

export interface ForecastStagePoint {
  /** ISO timestamp of the forecast point. */
  t: string;
  gaugeHeightFt: number | null;
}

export type SafetySummary =
  /** Current reading is at or above an official category. Present tense. */
  | { kind: 'current'; category: FloodStageKey }
  /**
   * Current is below every category, but the official forecast crosses one.
   * `crossesAt` is the first forecast point at or above the highest category
   * the forecast reaches.
   */
  | { kind: 'forecast'; category: FloodStageKey; crossesAt: string | null }
  /** Current reading is below the lowest published threshold. */
  | { kind: 'below'; lowestPublished: FloodStageKey }
  /** Stages are published but there is no trusted current reading in feet. */
  | { kind: 'no_reading' }
  /** The station publishes no official stages. Says nothing about the water. */
  | { kind: 'no_stages' };

function publishedStages(stages: FloodStageLevels | null | undefined): FloodStageLevels {
  const out: FloodStageLevels = {};
  if (!stages) return out;
  for (const key of FLOOD_STAGE_ORDER) {
    const value = stages[key];
    // NWPS uses large negative sentinels (-9999) for unpublished categories;
    // a negative flood stage is not a thing a river can be below.
    if (value != null && Number.isFinite(value) && value > 0) out[key] = value;
  }
  return out;
}

export function summarizeSafety(input: {
  stages: FloodStageLevels | null | undefined;
  /** Trusted current stage in feet, or null (untrusted, missing, or not ft). */
  currentFt: number | null | undefined;
  /** Official NWS forecast, oldest first. Optional. */
  forecast?: ForecastStagePoint[] | null;
}): SafetySummary {
  const stages = publishedStages(input.stages);
  const lowest = FLOOD_STAGE_ORDER.find((key) => stages[key] != null) ?? null;
  if (!lowest) return { kind: 'no_stages' };

  const currentFt =
    input.currentFt != null && Number.isFinite(input.currentFt) ? input.currentFt : null;

  // 1. Current at/above a category — the only present-tense state.
  const currentCategory = highestStagePassed(stages, currentFt);
  if (currentCategory) return { kind: 'current', category: currentCategory };

  // 2. Current below (or unavailable), forecast crosses a category.
  //
  // Evaluated even without a current reading: "official stages published;
  // current comparison unavailable" would bury a forecast flood, and the
  // forecast is the NWS's own statement, not an inference from the gap.
  const forecast = input.forecast ?? [];
  let forecastCategory: FloodStageKey | null = null;
  for (const point of forecast) {
    const passed = highestStagePassed(stages, point.gaugeHeightFt);
    if (!passed) continue;
    if (
      !forecastCategory ||
      FLOOD_STAGE_ORDER.indexOf(passed) > FLOOD_STAGE_ORDER.indexOf(forecastCategory)
    ) {
      forecastCategory = passed;
    }
  }
  if (forecastCategory) {
    const target = stages[forecastCategory]!;
    const crossing = forecast.find(
      (point) => point.gaugeHeightFt != null && point.gaugeHeightFt >= target,
    );
    return { kind: 'forecast', category: forecastCategory, crossesAt: crossing?.t ?? null };
  }

  // 3. Below the lowest published threshold.
  if (currentFt != null) return { kind: 'below', lowestPublished: lowest };

  // 4. Stages published, current comparison unavailable.
  return { kind: 'no_reading' };
}

const CATEGORY_NOUN: Record<FloodStageKey, string> = {
  action: 'NWS action stage',
  flood: 'NWS minor flood stage',
  moderate: 'NWS moderate flood stage',
  major: 'NWS major flood stage',
};

/**
 * The default sentence for a summary. `forecastDayLabel` is the caller's
 * platform-formatted day ("Monday") for the forecast state, because date
 * formatting is a locale/runtime concern and this module has neither.
 */
export function safetySummarySentence(
  summary: SafetySummary,
  options?: { forecastDayLabel?: string | null },
): string {
  switch (summary.kind) {
    case 'current':
      return `Currently at or above ${CATEGORY_NOUN[summary.category]}.`;
    case 'forecast': {
      const day = options?.forecastDayLabel;
      return `Forecast to reach ${CATEGORY_NOUN[summary.category]}${day ? ` ${day}` : ''}.`;
    }
    case 'below':
      return `Below ${CATEGORY_NOUN[summary.lowestPublished]}.`;
    case 'no_reading':
      return 'Official flood stages published; current comparison unavailable.';
    case 'no_stages':
      return 'No official flood stages published.';
  }
}
