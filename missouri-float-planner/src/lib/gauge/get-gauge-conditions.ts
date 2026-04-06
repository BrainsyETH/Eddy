// src/lib/gauge/get-gauge-conditions.ts
// Shared gauge-fetching and condition computation logic.
// Used by both the Eddy report generator and the chat tool handlers
// to avoid duplicated gauge-fetching code.

import type { ConditionCode } from '@/types/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';

export interface GaugeConditionResult {
  riverId: string;
  riverName: string;
  riverSlug: string;
  stationId: string;
  usgsSiteId: string;
  gaugeName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  conditionCode: ConditionCode;
  conditionLabel: string;
  readingTimestamp: string | null;
  optimalRange: string;
  closureLevel: number | null;
  thresholds: ConditionThresholds;
}

/**
 * Fetches the latest gauge reading and computes condition for a river.
 * Falls back to live USGS if DB reading is stale (>2 hours).
 *
 * Returns null if the river or gauge is not found.
 */
export async function getGaugeConditions(riverSlug: string): Promise<GaugeConditionResult | null> {
  const supabase = createAdminClient();

  // Get river
  const { data: riverData, error: riverError } = await supabase
    .from('rivers')
    .select('id, name, slug')
    .eq('slug', riverSlug)
    .single();

  if (!riverData) {
    console.warn(`[GaugeConditions] River not found for slug "${riverSlug}":`, riverError?.message);
    return null;
  }

  // Get primary gauge with thresholds
  const { data: gaugeLink, error: gaugeLinkError } = await supabase
    .from('river_gauges')
    .select(`
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit,
      gauge_stations (id, name, usgs_site_id)
    `)
    .eq('river_id', riverData.id)
    .eq('is_primary', true)
    .single();

  if (!gaugeLink) {
    console.warn(`[GaugeConditions] No primary gauge for river "${riverSlug}" (river_id: ${riverData.id}):`, gaugeLinkError?.message);
    return null;
  }

  const station = Array.isArray(gaugeLink.gauge_stations)
    ? gaugeLink.gauge_stations[0]
    : gaugeLink.gauge_stations;

  if (!station?.usgs_site_id) {
    console.warn(`[GaugeConditions] Gauge station missing usgs_site_id for river "${riverSlug}"`);
    return null;
  }

  // Try DB reading first, fall back to live USGS
  const { data: dbReading } = await supabase
    .from('gauge_readings')
    .select('gauge_height_ft, discharge_cfs, reading_timestamp')
    .eq('gauge_station_id', station.id)
    .order('reading_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  let gaugeHeightFt = dbReading?.gauge_height_ft ?? null;
  let dischargeCfs = dbReading?.discharge_cfs ?? null;
  let readingTimestamp = dbReading?.reading_timestamp ?? null;

  // If DB reading is stale (>2 hours), try live USGS
  const ageMs = readingTimestamp ? Date.now() - new Date(readingTimestamp).getTime() : Infinity;
  if (ageMs > 2 * 60 * 60 * 1000) {
    try {
      const liveReadings = await fetchGaugeReadings([station.usgs_site_id], { skipCache: true });
      const live = liveReadings[0];
      if (live) {
        if (live.gaugeHeightFt !== null && live.gaugeHeightFt !== undefined) {
          gaugeHeightFt = live.gaugeHeightFt;
        }
        if (live.dischargeCfs !== null && live.dischargeCfs !== undefined) {
          dischargeCfs = live.dischargeCfs;
        }
        if (live.readingTimestamp) {
          readingTimestamp = live.readingTimestamp;
        }
      }
    } catch (e) {
      console.warn(`[GaugeConditions] Live USGS fetch failed for ${station.usgs_site_id}:`, e);
    }
  }

  // Compute condition
  const thresholds: ConditionThresholds = {
    levelTooLow: gaugeLink.level_too_low,
    levelLow: gaugeLink.level_low,
    levelOptimalMin: gaugeLink.level_optimal_min,
    levelOptimalMax: gaugeLink.level_optimal_max,
    levelHigh: gaugeLink.level_high,
    levelDangerous: gaugeLink.level_dangerous,
    thresholdUnit: (gaugeLink as Record<string, unknown>).threshold_unit as 'ft' | 'cfs' | undefined,
  };

  const condition = computeCondition(gaugeHeightFt, thresholds, dischargeCfs);

  // Build optimal range string
  const unit = gaugeLink.threshold_unit === 'cfs' ? 'cfs' : 'ft';
  const optMin = gaugeLink.level_optimal_min;
  const optMax = gaugeLink.level_optimal_max;
  const optimalRange = (optMin != null && optMax != null)
    ? `${optMin}-${optMax} ${unit}`
    : 'unknown';

  return {
    riverId: riverData.id,
    riverName: riverData.name,
    riverSlug: riverData.slug,
    stationId: station.id,
    usgsSiteId: station.usgs_site_id,
    gaugeName: station.name || 'Unknown gauge',
    gaugeHeightFt,
    dischargeCfs,
    conditionCode: condition.code as ConditionCode,
    conditionLabel: condition.label,
    readingTimestamp,
    optimalRange,
    closureLevel: gaugeLink.level_dangerous ?? null,
    thresholds,
  };
}
