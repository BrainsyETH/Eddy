// src/lib/usgs/gauges.ts
// Back-compat facade over the USGS flow provider.
//
// The fetch implementations live in src/lib/flow-providers/usgs.ts (modern
// api.waterdata.usgs.gov with legacy fallback). Existing call sites keep
// these signatures; new code should resolve a provider via
// getFlowProvider(gauge_stations.provider) instead of importing this module.

import { getFlowProvider } from '@/lib/flow-providers';
import { readSnapshotStatistics } from '@/lib/usgs/percentile-snapshot';
// The suspect-qualifier vocabulary is defined once in shared/reading-trust.ts;
// this facade classifies with it rather than keeping a second copy that can
// drift (it did: this table and the alert gate's disagreed with the chart's).
import { SUSPECT_QUALIFIERS } from '@shared/reading-trust';
import type {
  DailyStatistics,
  GaugeReading,
  HistoricalData,
  HistoricalReading,
} from '@/lib/flow-providers/types';

export type { GaugeReading, DailyStatistics, HistoricalData, HistoricalReading };

const usgs = () => getFlowProvider('usgs')!;

export interface QualifierStatus {
  /** Provisional (unapproved) — normal for real-time data; footnote only. */
  provisional: boolean;
  /** Value is suspect (estimated / ice / equipment) — surface loudly. */
  suspect: boolean;
  /** Short human note, or null when the reading is clean/approved. */
  note: string | null;
}

/** Classifies provider qualifier codes into a user-facing status. */
export function classifyQualifiers(
  qualifiers: string[] | null | undefined,
  provider: string | null | undefined = 'usgs',
): QualifierStatus {
  const codes = qualifiers ?? [];
  const suspect = codes.some((c) => SUSPECT_QUALIFIERS.has(c));
  const provisional = codes.includes('P');
  const publisher =
    provider === 'usace' ? 'USACE' : provider === 'nws' ? 'NWS' : provider === 'usgs' ? 'USGS' : 'provider';
  let note: string | null = null;
  if (suspect) {
    if (codes.includes('Ice')) note = 'Ice-affected reading — may be inaccurate';
    else if (codes.includes('e')) note = 'Estimated reading — may be inaccurate';
    else if (codes.includes('Eqp')) note = 'Sensor malfunction — reading suspect';
    else note = `Reading flagged by ${publisher} — may be inaccurate`;
  } else if (provisional) {
    note = `Provisional ${publisher} data`;
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
 *
 * These come from the USGS Statistics API
 * (src/lib/flow-providers/usgs-statistics.ts). When the live call comes back
 * empty or throws, fall back to our own snapshot of the same numbers — which
 * is also the only source for the ~14,000 national gauges no cron polls live.
 *
 * The fallback is deliberately here rather than in the flow provider: the
 * provider stays a pure HTTP client with no database dependency.
 */
export async function fetchDailyStatistics(
  siteId: string,
  date?: Date
): Promise<DailyStatistics | null> {
  let live: DailyStatistics | null = null;
  try {
    live = await usgs().fetchDailyStatistics(siteId, date);
  } catch (error) {
    console.warn(`[USGS] Live statistics failed for ${siteId}; trying snapshot:`, error);
  }

  // A row with no median is as useless as no row at all — fall back on both.
  if (live && live.p50 !== null) return live;

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const snapshot = await readSnapshotStatistics(createAdminClient(), siteId, date);
    if (snapshot && snapshot.p50 !== null) {
      console.log(`[USGS] Served ${siteId} statistics from snapshot`);
      return snapshot;
    }
  } catch (error) {
    console.warn(`[USGS] Snapshot lookup failed for ${siteId}:`, error);
  }

  return live;
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
/**
 * The upper anchor for the top of the interpolation.
 *
 * HISTORY, because the fallback order looks arbitrary without it. The LEGACY
 * statistics service returned p90 empty for every site/day, while still
 * publishing p80 and p95 — so requiring p90 killed this calculation outright,
 * and the fallback exists to interpolate against a real number rather than an
 * invented p90. The modern Statistics API POPULATES p90
 * (src/lib/flow-providers/usgs-statistics.ts), so the first branch is now the
 * one that normally runs.
 *
 * ⚠️ That change is user-visible and was measured, not assumed. With p90 null
 * the curve ran p75 → p95 across percentiles 75–95; with a real p90 it runs
 * p75 → p90 across 75–90, and since p90 < p95 an upper-middle flow now scores
 * ~10 percentiles higher. Across five curated gauges, 4.5% of probed readings
 * changed flow band, and 95% of those were one transition: "Higher than usual"
 * → "Much higher than usual". Reproduce with
 * scripts/compare-usgs-percentiles.ts (only possible while the legacy service
 * still answers).
 *
 * The new reading is the more accurate one — interpolating to a published p90
 * beats assuming linearity over a 20-percentile span — and it errs toward
 * caution on a safety-adjacent product. Kept deliberately. Preferring p95 here
 * would restore the old numbers by ignoring better data.
 */
function upperAnchor(stats: DailyStatistics): { value: number; percentile: number } | null {
  if (stats.p90 !== null && stats.p90 !== undefined) return { value: stats.p90, percentile: 90 };
  if (stats.p95 !== null && stats.p95 !== undefined) return { value: stats.p95, percentile: 95 };
  if (stats.p80 !== null && stats.p80 !== undefined) return { value: stats.p80, percentile: 80 };
  return null;
}

export function calculateDischargePercentile(
  dischargeCfs: number,
  stats: DailyStatistics
): number | null {
  const upper = upperAnchor(stats);
  if (stats.p10 === null || stats.p50 === null || upper === null) {
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
  if (stats.p75 !== null && dischargeCfs <= upper.value) {
    // Between p75 and whichever upper percentile is published
    const span = upper.value - stats.p75;
    if (span <= 0) return upper.percentile;
    return Math.round(75 + ((dischargeCfs - stats.p75) / span) * (upper.percentile - 75));
  }
  // Above the upper anchor
  return Math.min(
    100,
    Math.round(upper.percentile + ((dischargeCfs - upper.value) / upper.value) * (100 - upper.percentile))
  );
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
  { max: 75, rating: 'good', label: 'Good', description: 'Flowing conditions - minimal dragging' },
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
