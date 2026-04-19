// src/lib/social/live-conditions.ts
// Overlays live gauge-derived condition codes onto eddy_updates rows before
// they flow into captions / composition props. Without this, scheduled posts
// can run with up to ~25 hours of staleness because condition_code is frozen
// when the daily /api/cron/generate-eddy-updates writes the row.
//
// Mirrors the pattern in /api/og/social generateDigestImage — query
// river_gauges for thresholds + primary gauge station, pull the latest
// gauge_readings row per station, run computeCondition, and replace the
// stored condition_code / gauge_height_ft.
//
// The eddy_update's AI-generated text (quote_text, summary_text) is kept
// as-is — re-generating copy is out of scope and needs the Anthropic call
// anyway. Only the condition code + current height move.

import { computeCondition, type ConditionThresholds } from '@/lib/conditions';

export interface LiveCondition {
  condition_code: string;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
}

interface RiverGaugeRow {
  rivers: { slug: string } | null;
  gauge_stations: { id: string } | null;
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  threshold_unit: string | null;
}

interface ReadingRow {
  gauge_station_id: string;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
}

/**
 * Build a slug → live condition map from the latest gauge readings. Returns
 * an empty map on any DB error so the caller falls back to whatever the
 * eddy_update row already has (fail open, not closed).
 */
export async function buildLiveConditionsMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Map<string, LiveCondition>> {
  const LOG = '[LiveConditions]';
  const result = new Map<string, LiveCondition>();

  const { data: riverGauges, error: rgError } = await supabase
    .from('river_gauges')
    .select(`
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit,
      rivers!inner(slug),
      gauge_stations!inner(id)
    `)
    .eq('is_primary', true);

  if (rgError) {
    console.error(`${LOG} river_gauges query failed:`, rgError.message);
    return result;
  }

  type Thresholds = { thresholds: ConditionThresholds; stationId: string };
  const thresholdMap = new Map<string, Thresholds>();
  for (const rg of (riverGauges || []) as RiverGaugeRow[]) {
    const slug = rg.rivers?.slug;
    const stationId = rg.gauge_stations?.id;
    if (!slug || !stationId) continue;
    thresholdMap.set(slug, {
      stationId,
      thresholds: {
        levelTooLow: rg.level_too_low,
        levelLow: rg.level_low,
        levelOptimalMin: rg.level_optimal_min,
        levelOptimalMax: rg.level_optimal_max,
        levelHigh: rg.level_high,
        levelDangerous: rg.level_dangerous,
        thresholdUnit: (rg.threshold_unit || 'ft') as 'ft' | 'cfs',
      },
    });
  }

  const stationIds = Array.from(thresholdMap.values()).map((t) => t.stationId);
  if (stationIds.length === 0) return result;

  const { data: readings, error: rError } = await supabase
    .from('gauge_readings')
    .select('gauge_station_id, gauge_height_ft, discharge_cfs')
    .in('gauge_station_id', stationIds)
    .order('reading_timestamp', { ascending: false });

  if (rError) {
    console.error(`${LOG} gauge_readings query failed:`, rError.message);
    return result;
  }

  const readingByStation = new Map<string, ReadingRow>();
  for (const r of (readings || []) as ReadingRow[]) {
    if (!readingByStation.has(r.gauge_station_id)) readingByStation.set(r.gauge_station_id, r);
  }

  thresholdMap.forEach(({ thresholds, stationId }, slug) => {
    const reading = readingByStation.get(stationId);
    const heightFt = reading?.gauge_height_ft ?? null;
    const dischargeCfs = reading?.discharge_cfs ?? null;
    const live = computeCondition(heightFt, thresholds, dischargeCfs);
    result.set(slug, {
      condition_code: live.code,
      gauge_height_ft: heightFt,
      discharge_cfs: dischargeCfs,
    });
  });

  return result;
}

/**
 * Overlay live gauge-derived conditions onto an array of eddy_update rows.
 * Rows with no matching primary gauge fall through unchanged. Returns a new
 * array; does not mutate inputs.
 */
export async function overlayLiveConditions<
  T extends { river_slug: string; condition_code: string; gauge_height_ft: number | null },
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  updates: T[],
): Promise<T[]> {
  if (updates.length === 0) return updates;
  const liveMap = await buildLiveConditionsMap(supabase);
  if (liveMap.size === 0) return updates; // fall back to stored codes
  return updates.map((u) => {
    const live = liveMap.get(u.river_slug);
    if (!live) return u;
    return {
      ...u,
      condition_code: live.condition_code,
      gauge_height_ft: live.gauge_height_ft ?? u.gauge_height_ft,
    };
  });
}
