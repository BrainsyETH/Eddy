// src/lib/gauges/flood-stages.ts
// The one implementation of flood-stage precedence.
//
// Extracted from /api/gauges/[siteId] when /api/conditions/[riverId] needed
// the same answer for the iOS river screen — which was drawing charts with no
// safety lines because its payload had no path to the stages. Two routes
// re-deriving "which source's stages win" is how one of them quietly stops
// agreeing with the other about an official safety threshold.
//
// The precedence:
//
//   Station `nwps_*` columns first. They are the national import and exist
//   only on UNCURATED rows by construction, so on a curated station they are
//   all null and the river_gauges pairing answers instead.
//
//   A row with no minor-flood stage is not published as a flood-stage station
//   at all: `action` alone is a watch threshold with no flood line under it,
//   which is not enough to draw a flood overlay from and would leave a chart
//   with one unexplained violet line on it. (An action-only station therefore
//   reads "No official flood stages published" — shared/safety-summary.ts
//   records the tension and handles the action-only shape if this gate is
//   ever relaxed; relaxing it is a decision to make HERE, once, not per
//   route.)
//
// FEET ONLY, like everything about these stages — see the GaugeFloodStages
// doc in src/types/api.ts.

import type { GaugeFloodStages } from '@/types/api';
import { toNum } from '@/lib/utils/num';

export type { GaugeFloodStages };

/** The station-level columns the resolver reads, as they come off the row. */
export interface StationFloodStageColumns {
  nws_lid?: string | null;
  nwps_action_stage_ft?: number | string | null;
  nwps_flood_stage_ft?: number | string | null;
  nwps_moderate_stage_ft?: number | string | null;
  nwps_major_stage_ft?: number | string | null;
}

/** The curated river_gauges pairing's two stages. */
export interface CuratedFloodStageColumns {
  flood_stage_ft?: number | string | null;
  action_stage_ft?: number | string | null;
}

export function resolveFloodStages(
  station: StationFloodStageColumns | null | undefined,
  curated: CuratedFloodStageColumns | null | undefined,
): GaugeFloodStages | null {
  const nwpsFlood = toNum(station?.nwps_flood_stage_ft);
  if (nwpsFlood) {
    return {
      actionFt: toNum(station?.nwps_action_stage_ft),
      floodFt: nwpsFlood,
      moderateFt: toNum(station?.nwps_moderate_stage_ft),
      majorFt: toNum(station?.nwps_major_stage_ft),
      lid: station?.nws_lid ?? null,
      source: 'nwps',
    };
  }

  const curatedFlood = toNum(curated?.flood_stage_ft);
  if (curatedFlood) {
    return {
      actionFt: toNum(curated?.action_stage_ft),
      floodFt: curatedFlood,
      // river_gauges holds only the two stages the condition ladder needs to
      // anchor against. Absent is absent — it is not evidence that the
      // Weather Service publishes no moderate stage for this station.
      moderateFt: null,
      majorFt: null,
      lid: station?.nws_lid ?? null,
      source: 'curated',
    };
  }

  return null;
}
