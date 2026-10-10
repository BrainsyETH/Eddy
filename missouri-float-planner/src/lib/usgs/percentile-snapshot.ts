// src/lib/usgs/percentile-snapshot.ts
// Snapshot + read-back of USGS day-of-year percentiles — discharge ('00060')
// and, in the table though not yet in any user-facing band, gage height
// ('00065'; see STAGE PUBLICATION POLICY below).
//
// WHY THIS EXISTS
// The percentile ladder (p10/p25/p50/p75/p90) behind "× normal" framing and
// the CFS condition ladders is fetched per site. These statistics describe
// decades of record and are effectively static, so we snapshot them into our
// own table and fall back to it when the live call fails — and, for the
// ~14,000 national gauges the crons no longer poll, read from it exclusively.
//
// SOURCE, AND WHY THIS COMMENT USED TO SAY OTHERWISE
// This originally read from the LEGACY statistics service
// (waterservices.usgs.gov/nwis/stat/) and recorded that percentiles had no
// modern equivalent. They do: the USGS Statistics API
// (src/lib/flow-providers/usgs-statistics.ts) publishes the same ladder, adds
// a populated p90, and is not going away in Q1 2027. The `source` column
// records which produced a row, so a mixed table stays legible.
//
// FEB 29 CARRIES A QUARTER OF THE SAMPLE, AND SOMETIMES NO UPPER LADDER
// Measured on the production backfill (44 curated gauges, Aug 2026): of 15,372
// modern rows, 17 have a null p90 — and 14 of those are day_of_year 60. USGS
// suppresses the upper percentiles when the leap-day sample is too thin
// (4–8 years against 105 for an ordinary day), and on those rows p95 and p80
// are null too, so upperAnchor() finds nothing and the percentile comes back
// null. That renders as "no comparison available", which is the correct answer
// and already has its own colour (FLOW_BAND_UNKNOWN_SOLID) — not a bug to fix,
// but do not be surprised by it on February 29.
//
// LEAP-YEAR NORMALIZATION
// Rows are keyed by day_of_year computed as if every year were a leap year
// (Feb 29 = 60, Mar 1 = 61 — always). USGS reports month/day, so normalizing
// this way means a calendar date maps to exactly one row no matter the year.
// Using a naive "nth day of THIS year" would silently shift every date after
// February by one whenever the year's leapness differed from the snapshot's.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyStatistics } from '@/lib/flow-providers/types';
import {
  PARAM_DISCHARGE,
  PARAM_GAGE_HEIGHT,
  fetchDailyStatisticsRows,
} from '@/lib/flow-providers/usgs-statistics';

export { PARAM_DISCHARGE, PARAM_GAGE_HEIGHT };

/**
 * The parameters this table snapshots. Everything else is rejected loudly:
 * usgs_daily_percentiles keys on (site_no, parameter_code, day_of_year), so a
 * typo'd code would not fail — it would build a parallel ladder nobody reads.
 */
export const SNAPSHOT_PARAMETERS = [PARAM_DISCHARGE, PARAM_GAGE_HEIGHT] as const;
export type SnapshotParameter = (typeof SNAPSHOT_PARAMETERS)[number];

export function assertSnapshotParameter(code: string): SnapshotParameter {
  if ((SNAPSHOT_PARAMETERS as readonly string[]).includes(code)) {
    return code as SnapshotParameter;
  }
  throw new Error(
    `Unsupported percentile parameter '${code}' — expected one of ${SNAPSHOT_PARAMETERS.join(', ')}`
  );
}

// ── STAGE PUBLICATION POLICY ─────────────────────────────────────
// Snapshotting stage percentiles and SHOWING a user a seasonal comparison
// built on them are different decisions. Two hazards discharge does not have:
//
//   DATUM. Stage is measured against a station datum, and a datum shift
//   silently corrupts the older half of the record — the ladder still parses,
//   the numbers are just about a different zero. Until continuity can be
//   established per station, the default is SILENCE: no stage seasonal band.
//   A missing comparison is strictly better than a confident, datum-corrupted
//   one, and flow-band.ts already has the vocabulary for it
//   (FLOW_BAND_UNKNOWN_SOLID, "No historical comparison published").
//
//   DEPTH. Stage records are much shallower (31 years vs 105 at Van Buren),
//   so thin-sample suppression (the Feb-29 note above) bites more often.
//   Below MIN_YEARS_FOR_SEASONAL_BAND a band is not published at all: ten
//   years is the floor at which "higher than usual for the date" describes a
//   climate rather than a memory of a few wet springs.
//
// seasonalBandEligible() is the one gate every consumer must pass before
// turning a percentile row into a user-facing band. Flipping stage on is a
// deliberate edit HERE (with the datum mechanism that justifies it), not a
// side effect of data arriving in the table.

export const MIN_YEARS_FOR_SEASONAL_BAND = 10;

const STAGE_SEASONAL_CONTEXT_ENABLED = false;

export function seasonalBandEligible(input: {
  parameterCode: string;
  yearsOfRecord: number | null | undefined;
}): boolean {
  if (input.yearsOfRecord == null || input.yearsOfRecord < MIN_YEARS_FOR_SEASONAL_BAND) {
    return false;
  }
  if (input.parameterCode === PARAM_GAGE_HEIGHT) return STAGE_SEASONAL_CONTEXT_ENABLED;
  return input.parameterCode === PARAM_DISCHARGE;
}

/**
 * Written to usgs_daily_percentiles.source. Rows predating the migration carry
 * 'usgs_legacy_stat_service'; the column exists so the two are distinguishable
 * without guessing from snapshotted_at.
 */
export const PERCENTILE_SOURCE = 'usgs_statistics_api_v0';

/** Cumulative days before each month IN A LEAP YEAR. */
const LEAP_MONTH_OFFSETS = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

/**
 * Leap-year-normalized day of year for a 1-indexed month/day.
 * Returns null for an impossible date rather than a wrong number.
 */
export function leapDayOfYear(month: number, day: number): number | null {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dayOfYear = LEAP_MONTH_OFFSETS[month - 1] + day;
  return dayOfYear >= 1 && dayOfYear <= 366 ? dayOfYear : null;
}

/** Same, for a Date (uses local calendar fields, matching USGS month/day). */
export function leapDayOfYearForDate(date: Date): number | null {
  return leapDayOfYear(date.getMonth() + 1, date.getDate());
}

/**
 * Snapshot one site into usgs_daily_percentiles. Returns the number of rows
 * written (≈366 for a site with a full record).
 */
export async function snapshotSite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  siteId: string,
  parameterCode: SnapshotParameter = PARAM_DISCHARGE
): Promise<number> {
  assertSnapshotParameter(parameterCode);
  const rows = await fetchDailyStatisticsRows(siteId, parameterCode);
  if (!rows.length) return 0;

  const payload = rows.flatMap((row) => {
    const dayOfYear = leapDayOfYear(row.month, row.day);
    if (dayOfYear === null) return [];
    return [{
    site_no: siteId,
    parameter_code: parameterCode,
    day_of_year: dayOfYear,
    p05: row.p05,
    p10: row.p10,
    p20: row.p20,
    p25: row.p25,
    p50: row.p50,
    p75: row.p75,
    p80: row.p80,
    p90: row.p90,
    p95: row.p95,
    mean: row.mean,
    count_years: row.countYears,
    begin_year: row.beginYear,
    end_year: row.endYear,
    source: PERCENTILE_SOURCE,
    snapshotted_at: new Date().toISOString(),
    }];
  });

  if (!payload.length) return 0;

  const { error } = await supabase
    .from('usgs_daily_percentiles')
    .upsert(payload, { onConflict: 'site_no,parameter_code,day_of_year' });

  if (error) {
    throw new Error(`Failed to upsert percentiles for ${siteId}: ${error.message}`);
  }

  return payload.length;
}

/** Columns both readers select; one list so they can never drift apart. */
const SNAPSHOT_COLUMNS = 'p05, p10, p20, p25, p50, p75, p80, p90, p95, mean, count_years';

/**
 * How many site ids go in one `.in()` lookup.
 *
 * Small enough that the URL stays a few KB (USGS ids run 8–15 characters), and
 * large enough that a national pass is ~70 round trips rather than 14,000.
 */
export const SNAPSHOT_LOOKUP_CHUNK = 200;

export interface SnapshotStatisticsBatch {
  stats: Map<string, DailyStatistics>;
  /**
   * Lookups that errored. Reported rather than swallowed: a failed chunk
   * leaves its sites ungraded, and ungraded renders as "no comparison", which
   * is a plausible-looking answer. The caller must surface this count.
   */
  failedChunks: number;
}

/**
 * The statistics for a known set of sites on one calendar day.
 *
 * ── WHY BY SITE, AND NOT "EVERY ROW FOR TODAY" ────────────────────────────
 *
 * This replaced readAllSnapshotStatistics, which paged through the whole day
 * with `.order('site_no').range()`. The table's only index is its primary key,
 * (site_no, parameter_code, day_of_year), so filtering on day_of_year cannot
 * seek: every page walked the index from the first site, and OFFSET made each
 * page longer than the last. Measured on production (Oct 2026, ~4.2M rows),
 * page five took 10s against PostgREST's 8s statement timeout. The error path
 * returned the partial map without complaint, so every site past roughly
 * 0430xxxx — the whole of Missouri, and everything west of it — was graded
 * null on every hourly run, and the national layer painted them all as "no
 * comparison" while the per-site detail route graded them fine.
 *
 * site_no LEADS the key, so an `.in()` on it is a point lookup per site:
 * measured at ~0.6s for 300 sites, cold. Chunked so the request URL stays
 * short (see SNAPSHOT_LOOKUP_CHUNK).
 */
export async function readSnapshotStatisticsForSites(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  siteIds: readonly string[],
  date: Date = new Date(),
  parameterCode: SnapshotParameter = PARAM_DISCHARGE
): Promise<SnapshotStatisticsBatch> {
  const stats = new Map<string, DailyStatistics>();
  let failedChunks = 0;
  const dayOfYear = leapDayOfYearForDate(date);
  if (dayOfYear === null) return { stats, failedChunks };

  const unique = [...new Set(siteIds)];
  for (let i = 0; i < unique.length; i += SNAPSHOT_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + SNAPSHOT_LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from('usgs_daily_percentiles')
      .select(`site_no, ${SNAPSHOT_COLUMNS}`)
      .eq('parameter_code', parameterCode)
      .eq('day_of_year', dayOfYear)
      .in('site_no', chunk);

    if (error) {
      failedChunks++;
      console.error('[percentiles] batch read failed:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      stats.set(row.site_no, {
        siteId: row.site_no,
        parameterCode,
        month: date.getMonth() + 1,
        day: date.getDate(),
        p05: row.p05,
        p10: row.p10,
        p20: row.p20,
        p25: row.p25,
        p50: row.p50,
        p75: row.p75,
        p80: row.p80,
        p90: row.p90,
        p95: row.p95,
        mean: row.mean,
        yearsOfRecord: row.count_years,
      });
    }
  }

  return { stats, failedChunks };
}

/**
 * Read the snapshot back as a DailyStatistics — the shape the rest of the app
 * already consumes, so callers can't tell whether it came from the live
 * service or our table.
 */
export async function readSnapshotStatistics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  siteId: string,
  date: Date = new Date(),
  parameterCode: SnapshotParameter = PARAM_DISCHARGE
): Promise<DailyStatistics | null> {
  const dayOfYear = leapDayOfYearForDate(date);
  if (dayOfYear === null) return null;

  const { data, error } = await supabase
    .from('usgs_daily_percentiles')
    .select('p05, p10, p20, p25, p50, p75, p80, p90, p95, mean, count_years')
    .eq('site_no', siteId)
    .eq('parameter_code', parameterCode)
    .eq('day_of_year', dayOfYear)
    .maybeSingle();

  if (error || !data) return null;

  return {
    siteId,
    parameterCode,
    month: date.getMonth() + 1,
    day: date.getDate(),
    p05: data.p05,
    p10: data.p10,
    p20: data.p20,
    p25: data.p25,
    p50: data.p50,
    p75: data.p75,
    p80: data.p80,
    p90: data.p90,
    p95: data.p95,
    mean: data.mean,
    yearsOfRecord: data.count_years,
  };
}
