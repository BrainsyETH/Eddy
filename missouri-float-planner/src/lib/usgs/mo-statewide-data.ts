// Type definitions and constants for the /missouri-surface-water page.
// Geometry, gauges, access points, campgrounds, and POIs come from Supabase
// at request time via the get_mo_surface_water_dataset() RPC. Live readings
// come from USGS NWIS via fetchGaugeReadings.

import { createAdminClient } from '@/lib/supabase/admin';

export interface MOGauge {
  site_id: string;
  name: string;
  lon: number;
  lat: number;
  is_primary: boolean;
  threshold_unit: 'ft' | 'cfs';
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
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

// ─── Stage verdict (floater language) ──────────────────────────────────

export type StageVerdict = 'bony' | 'prime' | 'pushy' | 'hazard' | 'unknown';

export const STAGE_VERDICTS: Record<
  StageVerdict,
  { label: string; color: string; inner: string; desc: string }
> = {
  bony:    { label: 'Bony',      color: '#B89D72', inner: '#D9C9B0', desc: 'Will scrape — pack light or wait.' },
  prime:   { label: 'Prime',     color: '#347A47', inner: '#4EB86B', desc: 'Sweet spot. Go.' },
  pushy:   { label: 'Pushy',     color: '#1D525F', inner: '#4A9AAD', desc: 'Fast — strong paddlers only.' },
  hazard:  { label: 'Hazardous', color: '#7A2419', inner: '#F07052', desc: 'Stay off the water.' },
  unknown: { label: '—',         color: '#6B6459', inner: '#A49C8E', desc: '' },
};

/**
 * Given a current reading + the river's primary-gauge thresholds (from
 * river_gauges), classify floatability. We map the existing threshold model
 * (level_optimal_min / max / high / dangerous) directly onto the verdict
 * bands so we never disagree with the rest of the app.
 */
export function classifyStageFromThresholds(
  value: number | null,
  unit: 'ft' | 'cfs',
  th: {
    level_optimal_min: number | null;
    level_optimal_max: number | null;
    level_high: number | null;
    level_dangerous: number | null;
  },
): StageVerdict {
  if (value == null) return 'unknown';
  const lo = th.level_optimal_min;
  const hi = th.level_optimal_max;
  const high = th.level_high;
  const danger = th.level_dangerous;
  if (lo != null && value < lo) return 'bony';
  if (hi != null && value <= hi) return 'prime';
  if (danger != null && value >= danger) return 'hazard';
  if (high != null && value >= high) return 'pushy';
  if (hi != null && value > hi) return 'pushy';
  return 'unknown';
  void unit;
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
