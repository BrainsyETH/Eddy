// Skip writes that would store what the row already holds.
//
// Why this exists: on 2026-11-12 the production database ran out of disk I/O
// and every page timed out. The national gauge pass upserted all ~14,000
// gauge_latest rows every 15 minutes (81M updates on a 14k-row table), and the
// percentile snapshot rewrote ~366 rows per site although USGS statistics
// change about once a year. Most of those writes changed nothing but a
// timestamp. Each one still cost a new row version, WAL and later vacuum work.
//
// The comparisons below normalise to what Postgres stores, so a value that
// only differs in precision the column cannot hold does not count as a change.

/** numeric(p, 2) columns hold two decimals; compare at that precision. */
function sameNumeric(stored: unknown, next: number | null, decimals?: number): boolean {
  const s = stored === null || stored === undefined ? null : Number(stored);
  if (next === null || next === undefined) return s === null;
  if (s === null || !Number.isFinite(s)) return false;
  if (decimals === undefined) return s === next;
  const factor = 10 ** decimals;
  return Math.round(s * factor) === Math.round(next * factor);
}

function sameTimestamp(stored: unknown, next: string): boolean {
  if (typeof stored !== 'string') return false;
  const s = Date.parse(stored);
  return Number.isFinite(s) && s === Date.parse(next);
}

function sameTextArray(stored: unknown, next: string[] | null): boolean {
  const s = Array.isArray(stored) ? stored : [];
  const n = next ?? [];
  return s.length === n.length && s.every((value, i) => value === n[i]);
}

// ── gauge_latest ────────────────────────────────────────────────────────────

/** The gauge_latest columns a pass compares (everything but fetched_at). */
export const GAUGE_LATEST_COMPARED_COLUMNS =
  'gauge_station_id, reading_timestamp, gauge_height_ft, discharge_cfs, qualifiers, flow_percentile';

export interface StoredLatestRow {
  gauge_station_id: string;
  reading_timestamp: string | null;
  gauge_height_ft: number | string | null;
  discharge_cfs: number | string | null;
  qualifiers: string[] | null;
  flow_percentile: number | null;
}

export interface NextLatestRow {
  gauge_station_id: string;
  reading_timestamp: string;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
  qualifiers: string[];
  flow_percentile: number | null;
}

/**
 * True when writing `next` would leave the stored row as it is, apart from
 * fetched_at. fetched_at then keeps the time the reading was first stored;
 * readers that need "when did Eddy last reach USGS" take the newest fetched_at
 * across the table, which any changed gauge in the pass keeps current.
 */
export function latestRowUnchanged(stored: StoredLatestRow | undefined, next: NextLatestRow): boolean {
  if (!stored) return false;
  return (
    sameTimestamp(stored.reading_timestamp, next.reading_timestamp) &&
    sameNumeric(stored.gauge_height_ft, next.gauge_height_ft, 2) &&
    sameNumeric(stored.discharge_cfs, next.discharge_cfs, 2) &&
    sameTextArray(stored.qualifiers, next.qualifiers) &&
    sameNumeric(stored.flow_percentile, next.flow_percentile)
  );
}

// ── usgs_daily_percentiles ──────────────────────────────────────────────────

/** Value columns of a percentile row (keys and snapshotted_at excluded). */
export const PERCENTILE_VALUE_COLUMNS = [
  'p05', 'p10', 'p20', 'p25', 'p50', 'p75', 'p80', 'p90', 'p95', 'mean',
  'count_years', 'begin_year', 'end_year',
] as const;

export type PercentileValues = {
  [K in (typeof PERCENTILE_VALUE_COLUMNS)[number]]: number | null;
} & { source: string };

export type StoredPercentileRow = {
  [K in (typeof PERCENTILE_VALUE_COLUMNS)[number]]?: number | string | null;
} & { day_of_year: number; source?: string | null };

/**
 * True when the stored row already holds these statistics from the same
 * source. snapshotted_at is not compared and no reader uses it.
 */
export function percentileRowUnchanged(
  stored: StoredPercentileRow | undefined,
  next: PercentileValues,
): boolean {
  if (!stored || stored.source !== next.source) return false;
  return PERCENTILE_VALUE_COLUMNS.every((column) => sameNumeric(stored[column], next[column]));
}
