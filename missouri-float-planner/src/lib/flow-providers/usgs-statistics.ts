// src/lib/flow-providers/usgs-statistics.ts
// USGS Water Data Statistics API — day-of-year discharge/stage normals.
//
// WHY THIS IS ITS OWN MODULE
// This is a DIFFERENT API from the OGC one in ./usgs.ts. It has its own host
// path (/statistics/v0, not /ogcapi/v0), its own response envelope, its own
// paging field, and it is NOT listed among the OGC collections — which is why
// it went unnoticed long enough for four files in this repo to claim day-of-year
// percentiles had no modern equivalent. They do. Keeping the two clients apart
// is what stops the next reader assuming one set of conventions covers both.
//
// It replaces waterservices.usgs.gov/nwis/stat/, which is decommissioned in
// Q1 2027 (https://waterdata.usgs.gov/blog/api-waterservices-decom/).
//
// WHAT IT PUBLISHES, vs the legacy service it replaces
//   legacy:  p05 p10 p20 p25 p50 p75 p80 p90 p95   — but p90 is ALWAYS empty
//   modern:  p05 p10     p25 p50 p75     p90 p95   — and p90 is populated
// Losing p20/p80 costs nothing: calculateDischargePercentile() interpolates on
// p10/p25/p50/p75 plus an upper anchor, and FLOW_BAND_SYSTEM cuts at 10/25/75/90
// — all present. A real p90 is strictly better than the p80 stand-in that
// upperAnchor() has been reaching for (see src/lib/usgs/gauges.ts).
//
// ⚠️ THE NUMBERS ARE NOT IDENTICAL TO LEGACY. USGS states the methodology
// changed (https://waterdata.usgs.gov/blog/wdfn-stats-delivery/). Drift between
// the two was measured per curated gauge before this became the default —
// scripts/compare-usgs-percentiles.ts reproduces that comparison, and can only
// run while the legacy service still answers.

import type { DailyStatisticsRow } from './types';

export const STATISTICS_BASE = 'https://api.waterdata.usgs.gov/statistics/v0';

/** Day-of-year normals. The API also serves 'MOY' (month), which we don't use. */
const NORMAL_TYPE_DOY = 'DOY';

/** Matches the `time_of_year_type` on a DOY value entry. */
const DAY_OF_YEAR = 'day_of_year';

export const PARAM_DISCHARGE = '00060';
/**
 * Gage height. The Statistics API publishes the same day-of-year ladder for it
 * (derived from statistic 30800, "selected value", where discharge uses the
 * 00003 daily mean) — but stage percentiles are DATUM-RELATIVE: a datum shift
 * silently invalidates the older half of the record in a way discharge is
 * immune to, and the sample is much shallower (31 years vs 105 at Van Buren).
 * See the publication policy in src/lib/usgs/percentile-snapshot.ts before
 * showing a user anything derived from these.
 */
export const PARAM_GAGE_HEIGHT = '00065';

/**
 * Percentile label (as the API spells it) → our column name.
 *
 * Driven off the response's own `percentiles` array rather than assumed by
 * position: the array is parallel to `values`, and a site that publishes a
 * shorter ladder would otherwise silently shift every number into the wrong
 * column. Labels we have no column for are ignored rather than dropped on the
 * floor silently — see parsePercentileEntry.
 */
const PERCENTILE_COLUMNS: Record<string, keyof DailyStatisticsRow> = {
  '5': 'p05',
  '10': 'p10',
  '20': 'p20',
  '25': 'p25',
  '50': 'p50',
  '75': 'p75',
  '80': 'p80',
  '90': 'p90',
  '95': 'p95',
};

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

interface NormalsValueEntry {
  time_of_year?: string;
  time_of_year_type?: string;
  /** Present on `percentile` entries — parallel to `percentiles`. */
  values?: Array<string | number | null>;
  /** Present on `percentile` entries — the labels for `values`. */
  percentiles?: Array<string | number>;
  /** Present on single-valued computations (arithmetic_mean, median, ...). */
  value?: string | number | null;
  sample_count?: number | null;
  computation?: string;
}

interface NormalsDataBlock {
  parameter_code?: string;
  values?: NormalsValueEntry[];
}

interface NormalsFeature {
  properties?: {
    monitoring_location_id?: string;
    data?: NormalsDataBlock[];
  } | null;
}

export interface NormalsResponse {
  features?: NormalsFeature[];
  /** Continuation URL, or null when the response is complete. */
  next?: string | null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function toNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(num) ? num : null;
}

/**
 * 'MM-DD' → {month, day}, or null for anything else.
 *
 * The API reports the day as a string, not the month_nu/day_nu integer pair the
 * legacy RDB used. Callers feed the result to leapDayOfYear(), which owns the
 * leap-year normalization and rejects impossible dates.
 */
export function parseTimeOfYear(value: string | undefined): { month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function emptyRow(month: number, day: number): DailyStatisticsRow {
  return {
    month,
    day,
    p05: null,
    p10: null,
    p20: null,
    p25: null,
    p50: null,
    p75: null,
    p80: null,
    p90: null,
    p95: null,
    mean: null,
    countYears: null,
    // The Statistics API reports sample_count but not the first/last water year
    // behind it. Null rather than a guess — count_years is what the UI shows.
    beginYear: null,
    endYear: null,
  };
}

/**
 * Folds one `percentile` entry into a row.
 *
 * `values` and `percentiles` are parallel arrays of STRINGS. Zipping them by
 * index only works while they are the same length; a mismatch means the payload
 * is not what we think it is, and writing p50 into the p75 column would be a
 * plausible-looking wrong answer rather than a visible failure.
 */
function applyPercentileEntry(row: DailyStatisticsRow, entry: NormalsValueEntry): void {
  const values = entry.values ?? [];
  const labels = entry.percentiles ?? [];
  if (values.length !== labels.length) {
    console.warn(
      `[USGS stats] percentile/value length mismatch (${labels.length} vs ${values.length}) at ${entry.time_of_year}; skipping entry`
    );
    return;
  }
  for (let i = 0; i < labels.length; i++) {
    const column = PERCENTILE_COLUMNS[String(labels[i]).trim()];
    if (!column) continue;
    (row[column] as number | null) = toNumber(values[i]);
  }
}

/**
 * Parses an observationNormals payload into day-of-year rows.
 *
 * One request returns every computation the API holds for the site
 * (percentile, arithmetic_mean, median, minimum, maximum); we keep the two the
 * app models and merge them onto a single row per calendar day.
 */
export function parseObservationNormals(
  payload: NormalsResponse,
  parameterCode: string = PARAM_DISCHARGE
): DailyStatisticsRow[] {
  const byDay = new Map<string, DailyStatisticsRow>();

  for (const feature of payload.features ?? []) {
    for (const block of feature.properties?.data ?? []) {
      // A site can carry several parameters in one response; take ours only.
      if (block.parameter_code && block.parameter_code !== parameterCode) continue;

      for (const entry of block.values ?? []) {
        // Defensive even though we request normal_type=DOY: omitting the
        // parameter returns month-of-year rows too, and a '07' month key would
        // parse as a date and overwrite a real day.
        if (entry.time_of_year_type !== DAY_OF_YEAR) continue;

        const date = parseTimeOfYear(entry.time_of_year);
        if (!date) continue;

        const key = `${date.month}-${date.day}`;
        let row = byDay.get(key);
        if (!row) {
          row = emptyRow(date.month, date.day);
          byDay.set(key, row);
        }

        if (entry.computation === 'percentile') {
          applyPercentileEntry(row, entry);
        } else if (entry.computation === 'arithmetic_mean') {
          row.mean = toNumber(entry.value);
        } else {
          continue;
        }

        // Both computations report the same sample_count; either may arrive
        // first, so take whichever is present rather than assuming an order.
        if (row.countYears === null) {
          row.countYears = toNumber(entry.sample_count) ?? null;
        }
      }
    }
  }

  return Array.from(byDay.values()).sort((a, b) => a.month - b.month || a.day - b.day);
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function statisticsHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.USGS_API_KEY;
  if (key) headers['X-Api-Key'] = key;
  return headers;
}

export function observationNormalsUrl(siteId: string, parameterCode: string): string {
  const url = new URL(`${STATISTICS_BASE}/observationNormals`);
  url.searchParams.set('monitoring_location_id', siteId.startsWith('USGS-') ? siteId : `USGS-${siteId}`);
  url.searchParams.set('parameter_code', parameterCode);
  url.searchParams.set('normal_type', NORMAL_TYPE_DOY);
  url.searchParams.set('mime_type', 'application/json');
  // 366 days × 5 computations = 1,830 entries for a full record; the cap is
  // 10,000 and one page covers any single site.
  url.searchParams.set('page_size', '10000');
  return url.toString();
}

/**
 * Every day-of-year statistic for one site.
 *
 * Throws on a non-OK response so callers can distinguish "the service is
 * unhappy" from "this site has no record" (which is an empty array, and normal
 * for a station commissioned too recently to have normals).
 *
 * ⚠️ A malformed parameter returns a NON-JSON body ('400 - Bad request (…)'),
 * so response.json() would throw something unhelpful. We check `ok` first.
 */
export async function fetchDailyStatisticsRows(
  siteId: string,
  parameterCode: string = PARAM_DISCHARGE
): Promise<DailyStatisticsRow[]> {
  const response = await fetch(observationNormalsUrl(siteId, parameterCode), {
    next: { revalidate: 86400 },
    headers: statisticsHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `USGS statistics API error for ${siteId}: ${response.status} ${response.statusText}`
    );
  }
  return parseObservationNormals((await response.json()) as NormalsResponse, parameterCode);
}
