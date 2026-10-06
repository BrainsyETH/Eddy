// src/lib/gauge/get-gauge-conditions.ts
// Shared gauge-fetching and condition computation logic.
// Used by both the Eddy report generator and the chat tool handlers
// to avoid duplicated gauge-fetching code.

import type { ConditionCode } from '@/types/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGaugeReadings, classifyQualifiers } from '@/lib/usgs/gauges';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import { sectionGaugeSupportsReport } from './section-gauge-support';
import { toNum } from '@/lib/utils/num';

export interface GaugeConditionResult {
  riverId: string;
  riverName: string;
  riverSlug: string;
  stationId: string;
  usgsSiteId: string;
  gaugeName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit: 'ft' | 'cfs';
  sectionGaugeMatched: boolean;
  conditionCode: ConditionCode;
  conditionLabel: string;
  readingTimestamp: string | null;
  optimalRange: string;
  closureLevel: number | null;
  thresholds: ConditionThresholds;
  /** USGS qualifier note (e.g. "Estimated reading — may be inaccurate"), null when clean. */
  qualifierNote: string | null;
}

const GAUGE_LINK_SELECT = `
  level_too_low, level_low, level_optimal_min, level_optimal_max,
  level_high, level_dangerous, threshold_unit, flood_stage_ft, river_mile,
  gauge_stations!inner (id, name, usgs_site_id)
`;

/** Shape of GAUGE_LINK_SELECT. Named so both lookups below stay typed. */
interface GaugeLinkRow {
  river_mile: number | null;
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  threshold_unit: string | null;
  flood_stage_ft: number | null;
  gauge_stations:
    | { id: string; name: string | null; usgs_site_id: string | null }
    | Array<{ id: string; name: string | null; usgs_site_id: string | null }>
    | null;
}

/**
 * Fetches the latest gauge reading and computes condition for a river, or for
 * one reach of it.
 *
 * `sectionSlug` first honors explicit curation, then delegates positional
 * selection at the section start mile to the website RPC. Selection alone
 * does not establish reach support; see sectionGaugeSupportsReport. Omit it — as the
 * chat handlers and every whole-river caller do — and behaviour is unchanged:
 * the river's is_primary gauge.
 *
 * WHY THE SECTION ARGUMENT EXISTS: on a river with a dam in the middle, the
 * primary gauge is on one side of it. The Black's lower reach was being reported
 * from Annapolis, 20 miles above Clearwater Dam and 17 miles of lake away from
 * the water it claimed to describe — "good, 280 cfs" for a tailwater running
 * high at 3,310. The reach's own thresholds already exist on its river_gauges
 * row; they simply were not being read.
 *
 * Falls back to live USGS if DB reading is stale (>2 hours).
 *
 * Returns null if the river or gauge is not found.
 */
export async function getGaugeConditions(
  riverSlug: string,
  sectionSlug?: string | null,
): Promise<GaugeConditionResult | null> {
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

  let sectionStationId: string | null = null;
  let sectionStartMile: number | null = null;
  let sectionEndMile: number | null = null;
  if (sectionSlug) {
    const { data: section } = await supabase
      .from('river_sections')
      .select('primary_gauge_station_id, river_mile_start, river_mile_end')
      .eq('river_id', riverData.id)
      .eq('section_slug', sectionSlug)
      .maybeSingle();
    sectionStationId = section?.primary_gauge_station_id ?? null;
    sectionStartMile = toNum(section?.river_mile_start);
    sectionEndMile = toNum(section?.river_mile_end);
  }

  let gaugeLink: GaugeLinkRow | null = null;
  // Explicit curation wins, including on RPC errors or missing RPC results.
  // Never clear this assignment: if its link fails, any substitute remains
  // an unsupported station observation rather than a curated reach assessment.
  if (sectionStationId) {
    const { data } = await supabase
      .from('river_gauges')
      .select(GAUGE_LINK_SELECT)
      .eq('river_id', riverData.id)
      .eq('gauge_station_id', sectionStationId)
      .maybeSingle();
    gaugeLink = data as GaugeLinkRow | null;
  }
  if (!gaugeLink && sectionStartMile != null) {
    const { data: resolved, error } = await supabase.rpc('get_river_condition_segment', {
      p_river_id: riverData.id,
      p_put_in_mile: sectionStartMile,
    });
    if (error) console.warn('[GaugeConditions] Section gauge resolution failed:', error.message);
    const resolvedSectionUsgsId = error ? null : resolved?.[0]?.gauge_usgs_id ?? null;
    if (resolvedSectionUsgsId) {
      const { data } = await supabase
        .from('river_gauges')
        .select(GAUGE_LINK_SELECT)
        .eq('river_id', riverData.id)
        .eq('gauge_stations.usgs_site_id', resolvedSectionUsgsId)
        .maybeSingle();
      gaugeLink = data as GaugeLinkRow | null;
    }
  }

  if (!gaugeLink) {
    const { data, error: gaugeLinkError } = await supabase
      .from('river_gauges')
      .select(GAUGE_LINK_SELECT)
      .eq('river_id', riverData.id)
      .eq('is_primary', true)
      .single();
    gaugeLink = data as GaugeLinkRow | null;

    if (!gaugeLink) {
      console.warn(`[GaugeConditions] No primary gauge for river "${riverSlug}" (river_id: ${riverData.id}):`, gaugeLinkError?.message);
      return null;
    }
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
    .select('gauge_height_ft, discharge_cfs, reading_timestamp, qualifiers')
    .eq('gauge_station_id', station.id)
    .order('reading_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  let gaugeHeightFt = toNum(dbReading?.gauge_height_ft);
  let dischargeCfs = toNum(dbReading?.discharge_cfs);
  let readingTimestamp = dbReading?.reading_timestamp ?? null;
  let qualifiers: string[] | null = dbReading?.qualifiers ?? null;

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
        qualifiers = live.qualifiers?.length ? live.qualifiers : qualifiers;
      }
    } catch (e) {
      console.warn(`[GaugeConditions] Live USGS fetch failed for ${station.usgs_site_id}:`, e);
    }
  }

  // Compute condition
  const thresholds: ConditionThresholds = {
    levelTooLow: toNum(gaugeLink.level_too_low),
    levelLow: toNum(gaugeLink.level_low),
    levelOptimalMin: toNum(gaugeLink.level_optimal_min),
    levelOptimalMax: toNum(gaugeLink.level_optimal_max),
    levelHigh: toNum(gaugeLink.level_high),
    levelDangerous: toNum(gaugeLink.level_dangerous),
    floodStageFt: toNum(gaugeLink.flood_stage_ft),
    thresholdUnit: (gaugeLink.threshold_unit ?? undefined) as 'ft' | 'cfs' | undefined,
  };

  const condition = computeCondition(gaugeHeightFt, thresholds, dischargeCfs);

  // Build optimal range string
  const unit = gaugeLink.threshold_unit === 'cfs' ? 'cfs' : 'ft';
  const optMin = thresholds.levelOptimalMin;
  const optMax = thresholds.levelOptimalMax;
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
    thresholdUnit: unit,
    sectionGaugeMatched: !!sectionSlug && sectionGaugeSupportsReport({
      curatedStationId: sectionStationId,
      selectedStationId: station.id,
      startMile: sectionStartMile,
      endMile: sectionEndMile,
      gaugeMile: toNum(gaugeLink.river_mile),
    }),
    conditionCode: condition.code as ConditionCode,
    conditionLabel: condition.label,
    readingTimestamp,
    optimalRange,
    closureLevel: thresholds.levelDangerous ?? null,
    thresholds,
    // Only the "suspect" qualifiers (estimated/ice/equipment) get a note —
    // 'P' (provisional) is normal for all USGS real-time data.
    qualifierNote: (() => {
      const q = classifyQualifiers(qualifiers);
      return q.suspect ? q.note : null;
    })(),
  };
}
