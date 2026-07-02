// src/lib/usgs/gauges.ts
// Back-compat facade over the USGS flow provider.
//
// The fetch implementations live in src/lib/flow-providers/usgs.ts (modern
// api.waterdata.usgs.gov with legacy fallback). Existing call sites keep
// these signatures; new code should resolve a provider via
// getFlowProvider(gauge_stations.provider) instead of importing this module.

import { getFlowProvider } from '@/lib/flow-providers';
import type {
  DailyStatistics,
  GaugeReading,
  HistoricalData,
  HistoricalReading,
} from '@/lib/flow-providers/types';

export type { GaugeReading, DailyStatistics, HistoricalData, HistoricalReading };

const usgs = () => getFlowProvider('usgs')!;

/** Qualifier codes that mean the value itself is suspect (not just unapproved). */
const SUSPECT_QUALIFIERS = new Set(['e', 'Ice', 'Eqp', 'Bkw', 'Mnt', 'ZFl', '***', 'Dis', 'Rat', 'Ssn']);

export interface QualifierStatus {
  /** Provisional (unapproved) — normal for real-time data; footnote only. */
  provisional: boolean;
  /** Value is suspect (estimated / ice / equipment) — surface loudly. */
  suspect: boolean;
  /** Short human note, or null when the reading is clean/approved. */
  note: string | null;
}

/** Classifies USGS qualifier codes into a user-facing status. */
export function classifyQualifiers(qualifiers: string[] | null | undefined): QualifierStatus {
  const codes = qualifiers ?? [];
  const suspect = codes.some((c) => SUSPECT_QUALIFIERS.has(c));
  const provisional = codes.includes('P');
  let note: string | null = null;
  if (suspect) {
    if (codes.includes('Ice')) note = 'Ice-affected reading — may be inaccurate';
    else if (codes.includes('e')) note = 'Estimated reading — may be inaccurate';
    else if (codes.includes('Eqp')) note = 'Sensor malfunction — reading suspect';
    else note = 'Reading flagged by USGS — may be inaccurate';
  } else if (provisional) {
    note = 'Provisional USGS data';
  }
  return { provisional, suspect, note };
}

/**
 * Fetches current gauge readings for USGS sites.
 *
 * @param siteIds Array of USGS site IDs (e.g., ['07019000', '07018500'])
 * @param options.skipCache If true, bypasses Next.js cache (for cron jobs)
 */
export async function fetchGaugeReadings(
  siteIds: string[],
  options?: { skipCache?: boolean }
): Promise<GaugeReading[]> {
  return usgs().fetchLatest(siteIds, options);
}

/** Fetches a single gauge reading by site ID */
export async function fetchGaugeReading(siteId: string): Promise<GaugeReading | null> {
  const readings = await fetchGaugeReadings([siteId]);
  return readings[0] || null;
}

/**
 * Fetches daily discharge statistics (day-of-year percentiles) for a site.
 */
export async function fetchDailyStatistics(
  siteId: string,
  date?: Date
): Promise<DailyStatistics | null> {
  return usgs().fetchDailyStatistics(siteId, date);
}

/**
 * Fetches historical gauge readings (default 7 days).
 */
export async function fetchHistoricalReadings(
  siteId: string,
  days: number = 7
): Promise<HistoricalData | null> {
  return usgs().fetchHistory(siteId, days);
}

// ---------------------------------------------------------------------------
// Percentile → flow condition helpers (provider-agnostic math)
// ---------------------------------------------------------------------------

/**
 * Calculates what percentile a given discharge value falls into
 * based on historical daily statistics
 *
 * @param dischargeCfs Current discharge in cfs
 * @param stats Daily statistics for comparison
 * @returns Estimated percentile (0-100) or null if can't be calculated
 */
export function calculateDischargePercentile(
  dischargeCfs: number,
  stats: DailyStatistics
): number | null {
  if (stats.p10 === null || stats.p50 === null || stats.p90 === null) {
    return null;
  }

  // Interpolate between known percentiles
  if (dischargeCfs <= stats.p10) {
    // Below 10th percentile - estimate 0-10 range
    return Math.max(0, Math.round((dischargeCfs / stats.p10) * 10));
  }
  if (stats.p25 !== null && dischargeCfs <= stats.p25) {
    // Between p10 and p25
    return Math.round(10 + ((dischargeCfs - stats.p10) / (stats.p25 - stats.p10)) * 15);
  }
  if (stats.p25 !== null && dischargeCfs <= stats.p50) {
    // Between p25 and p50
    return Math.round(25 + ((dischargeCfs - stats.p25) / (stats.p50 - stats.p25)) * 25);
  }
  if (stats.p75 !== null && dischargeCfs <= stats.p75) {
    // Between p50 and p75
    return Math.round(50 + ((dischargeCfs - stats.p50) / (stats.p75 - stats.p50)) * 25);
  }
  if (stats.p75 !== null && dischargeCfs <= stats.p90) {
    // Between p75 and p90
    return Math.round(75 + ((dischargeCfs - stats.p75) / (stats.p90 - stats.p75)) * 15);
  }
  // Above 90th percentile
  return Math.min(100, Math.round(90 + ((dischargeCfs - stats.p90) / stats.p90) * 10));
}

export type FlowRating = 'flood' | 'high' | 'good' | 'low' | 'poor' | 'unknown';

export interface FlowCondition {
  rating: FlowRating;
  label: string;
  description: string;
  percentile: number | null;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
}

/**
 * Rating thresholds based on percentile
 * These align with MOHERP's methodology and Missouri Scenic Rivers guidance
 */
const PERCENTILE_RATINGS: Array<{ max: number; rating: FlowRating; label: string; description: string }> = [
  { max: 10, rating: 'poor', label: 'Too Low', description: 'Frequent dragging and portaging may occur' },
  { max: 25, rating: 'low', label: 'Low', description: 'Low - Floatable' },
  { max: 75, rating: 'good', label: 'Good', description: 'Ideal conditions - minimal dragging' },
  { max: 90, rating: 'high', label: 'High', description: 'Fast current - use caution' },
  { max: 100, rating: 'flood', label: 'Flood', description: 'Dangerous flooding - do not float' },
];

/**
 * Determines flow condition rating based on current discharge and historical statistics
 *
 * @param reading Current gauge reading
 * @param stats Daily statistics for the gauge
 * @returns Flow condition with rating, description, and context
 */
export function calculateFlowCondition(
  reading: GaugeReading,
  stats: DailyStatistics | null
): FlowCondition {
  // If no discharge data, return unknown
  if (reading.dischargeCfs === null) {
    return {
      rating: 'unknown',
      label: 'Unknown',
      description: 'Current conditions unavailable',
      percentile: null,
      dischargeCfs: null,
      gaugeHeightFt: reading.gaugeHeightFt,
    };
  }

  // If no statistics, we can still show the reading but can't rate it
  if (!stats || stats.p50 === null) {
    return {
      rating: 'unknown',
      label: 'Unknown',
      description: 'Historical data unavailable for comparison',
      percentile: null,
      dischargeCfs: reading.dischargeCfs,
      gaugeHeightFt: reading.gaugeHeightFt,
    };
  }

  const percentile = calculateDischargePercentile(reading.dischargeCfs, stats);

  if (percentile === null) {
    return {
      rating: 'unknown',
      label: 'Unknown',
      description: 'Unable to calculate percentile',
      percentile: null,
      dischargeCfs: reading.dischargeCfs,
      gaugeHeightFt: reading.gaugeHeightFt,
    };
  }

  // Find the appropriate rating based on percentile
  const ratingInfo = PERCENTILE_RATINGS.find((r) => percentile <= r.max) || PERCENTILE_RATINGS[PERCENTILE_RATINGS.length - 1];

  return {
    rating: ratingInfo.rating,
    label: ratingInfo.label,
    description: ratingInfo.description,
    percentile,
    dischargeCfs: reading.dischargeCfs,
    gaugeHeightFt: reading.gaugeHeightFt,
  };
}
