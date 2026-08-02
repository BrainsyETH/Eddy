// src/lib/usgs/percentile-snapshot.ts
// Snapshot + read-back of USGS day-of-year discharge percentiles.
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
// LEAP-YEAR NORMALIZATION
// Rows are keyed by day_of_year computed as if every year were a leap year
// (Feb 29 = 60, Mar 1 = 61 — always). USGS reports month/day, so normalizing
// this way means a calendar date maps to exactly one row no matter the year.
// Using a naive "nth day of THIS year" would silently shift every date after
// February by one whenever the year's leapness differed from the snapshot's.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyStatistics } from '@/lib/flow-providers/types';
import { fetchDailyStatisticsRows } from '@/lib/flow-providers/usgs-statistics';

const PARAM_DISCHARGE = '00060';

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
  siteId: string
): Promise<number> {
  const rows = await fetchDailyStatisticsRows(siteId, PARAM_DISCHARGE);
  if (!rows.length) return 0;

  const payload = rows.flatMap((row) => {
    const dayOfYear = leapDayOfYear(row.month, row.day);
    if (dayOfYear === null) return [];
    return [{
    site_no: siteId,
    parameter_code: PARAM_DISCHARGE,
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
 * Every site's statistics for one calendar day, as a Map keyed by site id.
 *
 * The national readings cron grades ~14,000 sites in a pass, and
 * readSnapshotStatistics() is one round trip per site. This is one query for
 * the whole day instead — there is at most one row per site per day_of_year,
 * so "today's rows" IS the working set, and no site-id list has to be shipped
 * up in the request (a 14,000-element `.in()` would blow the URL length the
 * same way fetchLatestModern does).
 *
 * Paged explicitly because PostgREST caps a response at 1,000 rows by default,
 * and a silent truncation here would look exactly like "most gauges have no
 * historical data" — a wrong answer that reads as a plausible one.
 */
export async function readAllSnapshotStatistics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  date: Date = new Date()
): Promise<Map<string, DailyStatistics>> {
  const out = new Map<string, DailyStatistics>();
  const dayOfYear = leapDayOfYearForDate(date);
  if (dayOfYear === null) return out;

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('usgs_daily_percentiles')
      .select(`site_no, ${SNAPSHOT_COLUMNS}`)
      .eq('parameter_code', PARAM_DISCHARGE)
      .eq('day_of_year', dayOfYear)
      // Ordered because .range() over an unordered result is not stable
      // pagination — windows can repeat and skip rows, which here would look
      // like "most gauges have no historical data".
      .order('site_no')
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('[percentiles] batch read failed:', error.message);
      return out;
    }
    for (const row of data ?? []) {
      out.set(row.site_no, {
        siteId: row.site_no,
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
    if (!data || data.length < PAGE) break;
  }

  return out;
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
  date: Date = new Date()
): Promise<DailyStatistics | null> {
  const dayOfYear = leapDayOfYearForDate(date);
  if (dayOfYear === null) return null;

  const { data, error } = await supabase
    .from('usgs_daily_percentiles')
    .select('p05, p10, p20, p25, p50, p75, p80, p90, p95, mean, count_years')
    .eq('site_no', siteId)
    .eq('parameter_code', PARAM_DISCHARGE)
    .eq('day_of_year', dayOfYear)
    .maybeSingle();

  if (error || !data) return null;

  return {
    siteId,
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
