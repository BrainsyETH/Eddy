// src/lib/float-share/verify.ts
// Whether a float share's condition stamp is borne out by the record.
//
// The share query is built on the phone and anyone can build one, so the
// stamp ("FLOOD STAGE · 48,000 cfs") would otherwise be Eddy's condition
// language on a number nobody checked. Before the stamp is drawn, the gauge
// the share names must be one of this river's gauges, and one of its
// recorded readings for that day must rate as the claimed code on the
// river's own ladder, at the claimed discharge. Anything else is drawn
// without the stamp (shared/float-share.ts withoutCondition), never refused:
// the float is still the paddler's, only the claim is dropped.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FloatShareState } from '@shared/float-share';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { applyFloodStageOverride, computeConditionFromDbRow } from '@/lib/conditions';
import { FloatShareReadError } from './names';

/** The share's calendar day is the paddler's own; readings are UTC. This margin covers any US zone. */
const DAY_MARGIN_MS = 12 * 3_600_000;
/** A whole-cfs claim against a reading that may have been revised by a hair. */
const CFS_TOLERANCE = 0.02;

const LINK_COLUMNS =
  'gauge_station_id,threshold_unit,level_too_low,level_low,level_optimal_min,level_optimal_max,level_high,level_dangerous,flood_stage_ft,gauge_stations!inner(usgs_site_id)' as const;

export function cfsMatches(claimed: number | null, recorded: number | null): boolean {
  if (claimed == null) return true;
  if (recorded == null) return false;
  return Math.abs(Math.round(recorded) - claimed) <= Math.max(1, claimed * CFS_TOLERANCE);
}

/**
 * True when a recorded reading of the named gauge, on that day, rates as the
 * share's condition at its cfs. A share with no condition has nothing to
 * verify and is true. A failed read throws FloatShareReadError (a 503).
 */
export async function verifyFloatShareCondition(db: SupabaseClient, state: FloatShareState, riverId: string): Promise<boolean> {
  const condition = state.condition;
  if (!condition) return true;
  const { data: link, error: linkError } = await db
    .from('river_gauges')
    .select(LINK_COLUMNS)
    .eq('river_id', riverId)
    .eq('gauge_stations.usgs_site_id', condition.gauge)
    .limit(1)
    .maybeSingle();
  if (linkError) throw new FloatShareReadError('Could not read the gauge');
  if (!link) return false;
  const day = Date.parse(`${state.date}T00:00:00Z`);
  const { data: readings, error: readError } = await db
    .from('gauge_readings')
    .select('gauge_height_ft,discharge_cfs,qualifiers')
    .eq('gauge_station_id', link.gauge_station_id)
    .gte('reading_timestamp', new Date(day - DAY_MARGIN_MS).toISOString())
    .lt('reading_timestamp', new Date(day + 86_400_000 + DAY_MARGIN_MS).toISOString())
    .limit(500);
  if (readError) throw new FloatShareReadError('Could not read the gauge history');
  const flood = link.flood_stage_ft == null ? null : Number(link.flood_stage_ft);
  return (readings ?? []).some((reading) => {
    if (classifyQualifiers(reading.qualifiers).suspect) return false;
    const heightFt = reading.gauge_height_ft == null ? null : Number(reading.gauge_height_ft);
    const dischargeCfs = reading.discharge_cfs == null ? null : Number(reading.discharge_cfs);
    if (heightFt == null && dischargeCfs == null) return false;
    const code = applyFloodStageOverride(computeConditionFromDbRow(heightFt, link, dischargeCfs).code, heightFt, flood);
    return code === condition.code && cfsMatches(condition.cfs, dischargeCfs);
  });
}
