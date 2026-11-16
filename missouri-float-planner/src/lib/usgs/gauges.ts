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
import { SUSPECT_QUALIFIERS, suspectQualifierNote } from '@shared/reading-trust';
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
    note = suspectQualifierNote(codes, publisher);
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
  options?: { skipCache?: boolean; signal?: AbortSignal }
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
  const p05 = stats.p05 ?? null;
  const p95 = stats.p95 ?? null;

  // ── The tails: never claim more than a published threshold supports ──────
  // A reading beyond the outermost published percentile has no measured
  // position, so the number may say "beyond p95" but never where beyond it,
  // and must never contradict a threshold that IS published. (Extrapolating
  // against p90 alone once scored 170 cfs as the 97th percentile on a day
  // whose published p95 was 1,000 cfs.) Band cuts (10 / 90) are unaffected:
  // every branch below keeps a value on the same side of them.
  if (dischargeCfs < stats.p10) {
    if (p05 !== null && p05 < stats.p10) {
      // Between p05 and p10, interpolate; below p05, proportional toward zero
      // flow (a physical floor), so only "below the 5th percentile" is claimed.
      if (dischargeCfs === p05) return 5;
      // Rounding must not land a reading above p05 on the 5th-percentile tier.
      if (dischargeCfs > p05) return Math.max(6, Math.round(5 + ((dischargeCfs - p05) / (stats.p10 - p05)) * 5));
      return Math.max(0, Math.min(5, Math.round((dischargeCfs / p05) * 5)));
    }
    // No p05: below p10 is all that is known. Stay above 5 so "at or below
    // the 5th percentile" is only ever said when p05 says it.
    return Math.max(6, Math.round((dischargeCfs / stats.p10) * 10));
  }
  if (dischargeCfs === stats.p10) return 10;
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
  // Above the upper anchor.
  if (upper.percentile === 90) {
    if (p95 !== null && p95 > upper.value) {
      if (dischargeCfs === p95) return 95;
      // Rounding must not lift a reading below p95 onto the 95th-percentile tier.
      if (dischargeCfs < p95) return Math.min(94, Math.round(90 + ((dischargeCfs - upper.value) / (p95 - upper.value)) * 5));
      return beyond(95, dischargeCfs, p95);
    }
    // No p95: above p90 is all that is known. Stay below 95.
    return Math.min(94, beyond(90, dischargeCfs, upper.value));
  }
  // p95 itself is the anchor (legacy service): beyond it is supported. The
  // p80 fallback knows nothing about p95, so it stays below 95 as well.
  return upper.percentile >= 95
    ? beyond(upper.percentile, dischargeCfs, upper.value)
    : Math.min(94, beyond(upper.percentile, dischargeCfs, upper.value));
}

/**
 * Past the outermost published percentile: ordered (a bigger exceedance
 * scores higher, so "most unusual" lists still sort) but compressed into the
 * remaining range — the value says "beyond `percentile`", not a position.
 */
function beyond(percentile: number, dischargeCfs: number, anchor: number): number {
  const excess = anchor > 0 ? (dischargeCfs - anchor) / anchor : 1;
  return Math.min(100, Math.max(percentile, Math.round(percentile + excess * (100 - percentile))));
}

// The percentile-verdict system that used to live here (FlowRating,
// FlowCondition, PERCENTILE_RATINGS, calculateFlowCondition) is gone, not
// moved. It labelled unrated gauges with recreation verdicts — "Too Low",
// "Good", "Flood" — which is exactly the claim Eddy declines to make about a
// station nobody has rated. The factual replacement is shared/flow-band.ts:
// same 10/25/75/90 cuts, comparison language ("Much lower than usual"), and
// a ramp that deliberately contains no green and no red. Nothing imported
// the old system when it was removed.
