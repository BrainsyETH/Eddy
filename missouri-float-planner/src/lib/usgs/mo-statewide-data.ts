// Type definitions and constants for the /missouri-surface-water page.
// Geometry, gauges, access points, campgrounds, and POIs come from Supabase
// at request time via the get_mo_surface_water_dataset() RPC. Live readings
// come from USGS NWIS via fetchGaugeReadings.
//
// Condition vocabulary mirrors src/lib/conditions.ts (the same one used by
// /api/conditions, /api/plan, /rivers, and the embeds), so floater verdicts,
// colors, and thresholds stay aligned across pages.

import { createAdminClient } from '@/lib/supabase/admin';
import { computeCondition } from '@/lib/conditions';
import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';

export type ThresholdSource = 'usgs' | 'nws_ahps' | 'outfitter' | 'editorial';

export interface MOGauge {
  site_id: string;
  name: string;
  /** NWS AHPS location ID (e.g., 'VBNM7'). Required for forecast lookup. */
  nws_lid: string | null;
  /**
   * Display coordinates: snapped onto the river's NHD geometry when the
   * USGS site is within 500m of the reach, otherwise the raw site location.
   */
  lon: number;
  lat: number;
  /** Raw USGS site location, always the unmoved gauge station. */
  lon_raw: number | null;
  lat_raw: number | null;
  /** Distance in meters between raw site location and nearest reach vertex. */
  snap_distance_m: number | null;
  is_primary: boolean;
  threshold_unit: 'ft' | 'cfs';
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  /** USGS-published flood stage (ft). Source of truth for hazard override. */
  flood_stage_ft: number | null;
  /** USGS-published action stage (ft) — first response level. */
  action_stage_ft: number | null;
  threshold_source: ThresholdSource | null;
  threshold_source_url: string | null;
  threshold_updated_at: string | null;
}

export interface MOAccessPoint {
  id: string;
  name: string;
  slug: string;
  type: string;
  river_mile_downstream: number | null;
  lon: number;
  lat: number;
  ownership: string | null;
  /** Photos attached to this access point (00022). Always an array,
   *  empty when none. Surfaced via 00123. */
  image_urls?: string[];
}

export interface MOPoi {
  id: string;
  name: string;
  slug: string | null;
  /** spring | cave | historical_site | scenic_viewpoint | waterfall | geological | other */
  type: string;
  lat: number;
  lon: number;
  river_mile: number | null;
  nps_url: string | null;
  description: string | null;
}

export interface MOCampground {
  id: string;
  name: string;
  lat: number;
  lon: number;
  total_sites: number | null;
  sites_reservable: number | null;
  sites_first_come: number | null;
  reservation_url: string | null;
  nps_url: string | null;
}

export interface MORiver {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  length_miles: number | null;
  geometry: GeoJSON.LineString;
  gauges: MOGauge[] | null;
  access_points: MOAccessPoint[] | null;
  pois: MOPoi[] | null;
}

export interface MODataset {
  rivers: MORiver[];
  campgrounds: MOCampground[];
  generated_at: string;
}

export async function fetchMODataset(): Promise<MODataset> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('get_mo_surface_water_dataset');
  if (error) throw new Error(`Supabase RPC failed: ${error.message}`);
  return data as MODataset;
}

// ─── Theme tokens (mirrors tailwind.config.ts) ──────────────────────────

export const THEME = {
  // Map background — primary-900 with a slight warm shift.
  mapBg: '#0F2D35',
  basinFill: '#163F4A',
  stateFill: '#F4EFE7',     // secondary-100 (sandbar tan)
  stateGrain: '#E8DFD0',    // secondary-200
  stateOutline: '#1D525F',  // primary-700

  cardBg: '#FAF8F4',        // secondary-50
  cardBorder: '#3F3B33',    // neutral-800
  cardShadow: '#1A1814',    // neutral-950

  ink: '#2D2A24',           // neutral-900
  inkDim: '#6B6459',        // neutral-600
  parchment: '#F2EAD8',
  live: '#F07052',          // accent-500 — sunset coral
  liveDim: '#E5573F',

  primary: '#2D7889',
  primaryDark: '#163F4A',
  trail: '#4EB86B',         // support-500
  tan: '#B89D72',           // secondary-500
};

// ─── Percentile classification (USGS NWIS standard 5-band scheme) ───────

export interface PercentileClass {
  min: number;
  max: number;
  label: string;
  short: string;
  color: string;
}

export const PERCENTILE_CLASSES: PercentileClass[] = [
  { min: 0,  max: 10,  label: 'Much below normal', short: '<P10',   color: '#7A2419' }, // accent-900
  { min: 10, max: 25,  label: 'Below normal',      short: 'P10–25', color: '#CC3E2B' }, // accent-700
  { min: 25, max: 75,  label: 'Normal',            short: 'P25–75', color: '#2D7889' }, // primary-500
  { min: 75, max: 90,  label: 'Above normal',      short: 'P75–90', color: '#4A9AAD' }, // primary-400
  { min: 90, max: 100, label: 'Much above normal', short: '>P90',   color: '#0F2D35' }, // primary-900
];

export function classifyPercentile(p: number): PercentileClass {
  for (const c of PERCENTILE_CLASSES) if (p >= c.min && p < c.max) return c;
  return PERCENTILE_CLASSES[PERCENTILE_CLASSES.length - 1];
}

export function colorForPercentile(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return '#857D70'; // neutral-500
  return classifyPercentile(p).color;
}

// ─── Float condition (canonical app vocabulary) ────────────────────────
//
// We use the same ConditionCode + CONDITION_COLORS the rest of Eddy uses
// (/plan, /rivers, /api/conditions, embeds). The map verdict, the right-
// rail badge, and the river-line color all agree with what the
// /rivers/[slug] detail page shows for the same gauge reading.
//
// The legacy 4-band scheme (bony/prime/pushy/hazard) used to live here
// and was the cause of the cross-page mismatch.

export type StageVerdict = ConditionCode;

export const STAGE_VERDICTS: Record<
  ConditionCode,
  { label: string; color: string; inner: string; desc: string }
> = {
  too_low:   { label: 'Too Low',  color: CONDITION_COLORS.too_low,   inner: '#A49C8E', desc: 'Too low to float — frequent dragging and portaging likely.' },
  low:       { label: 'Low',      color: CONDITION_COLORS.low,       inner: '#F2C94C', desc: 'Low — expect some dragging in shallow areas.' },
  good:      { label: 'Good',     color: CONDITION_COLORS.good,      inner: '#A8DD3F', desc: 'Good — floatable with minimal dragging.' },
  flowing:   { label: 'Flowing',  color: CONDITION_COLORS.flowing,   inner: '#34D399', desc: 'Ideal conditions. Go.' },
  high:      { label: 'High',     color: CONDITION_COLORS.high,      inner: '#FB923C', desc: 'Fast current — strong paddlers only.' },
  dangerous: { label: 'Flood',    color: CONDITION_COLORS.dangerous, inner: '#F87171', desc: 'Flood-stage water. Do not float.' },
  unknown:   { label: '—',        color: CONDITION_COLORS.unknown,   inner: '#A49C8E', desc: '' },
};

/**
 * Given a current reading + the river's primary-gauge thresholds, classify
 * floatability via computeCondition(), the same function /api/conditions
 * and /api/plan use. Falls back to USGS-published flood_stage_ft when the
 * editorial dangerous band isn't set — a flood-stage reading is hazardous
 * regardless of editorial calibration.
 */
export function classifyStageFromThresholds(
  value: number | null,
  unit: 'ft' | 'cfs',
  th: {
    level_too_low?: number | null;
    level_low?: number | null;
    level_optimal_min: number | null;
    level_optimal_max: number | null;
    level_high: number | null;
    level_dangerous: number | null;
    flood_stage_ft?: number | null;
  },
): ConditionCode {
  if (value == null) return 'unknown';

  // Flood-stage override: NWS flood stage is the authoritative hazard
  // line for ft-threshold gauges, even if level_dangerous wasn't set.
  if (unit === 'ft' && th.flood_stage_ft != null && value >= th.flood_stage_ft) {
    return 'dangerous';
  }

  const result = computeCondition(
    unit === 'ft' ? value : null,
    {
      levelTooLow: th.level_too_low ?? null,
      levelLow: th.level_low ?? null,
      levelOptimalMin: th.level_optimal_min,
      levelOptimalMax: th.level_optimal_max,
      levelHigh: th.level_high,
      levelDangerous: th.level_dangerous,
      thresholdUnit: unit,
    },
    unit === 'cfs' ? value : null,
  );
  return result.code;
}

export function colorForCondition(c: ConditionCode | null | undefined): string {
  if (!c) return CONDITION_COLORS.unknown;
  return CONDITION_COLORS[c];
}

export function labelForCondition(c: ConditionCode | null | undefined): string {
  if (!c) return CONDITION_LABELS.unknown;
  return CONDITION_LABELS[c];
}

// ─── Access-point and POI display tokens ────────────────────────────────

export interface AccessPointStyle {
  fill: string;
  stroke: string;
  label: string;
}

export function accessPointStyle(type: string): AccessPointStyle {
  if (type.includes('put') || type === 'access') {
    return { fill: '#4EB86B', stroke: '#1A3D23', label: 'Access' };
  }
  if (type.includes('take')) {
    return { fill: '#F07052', stroke: '#7A2419', label: 'Take-out' };
  }
  if (type.includes('camp')) {
    return { fill: '#B89D72', stroke: '#3D3425', label: 'Camp' };
  }
  return { fill: '#2D7889', stroke: '#0F2D35', label: 'Access' };
}

export const POI_GLYPHS: Record<string, string> = {
  spring: '◉',
  cave: '⌬',
  historical_site: '◈',
  scenic_viewpoint: '▲',
  waterfall: '≋',
  geological: '◆',
  other: '◉',
};

export const POI_TONES: Record<string, string> = {
  spring: '#4A9AAD',
  cave: '#524D43',
  historical_site: '#99835F',
  scenic_viewpoint: '#347A47',
  waterfall: '#2D7889',
  geological: '#7A684B',
  other: '#857D70',
};
