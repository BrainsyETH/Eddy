// src/lib/usace/cda.ts
// Thin client for the USACE CWMS Data API (CDA) — public, unauthenticated,
// no API key. Owns URL construction, the versioned Accept header, timeouts
// and null-stripping, so callers deal in {timestamp, value} pairs.
//
//   https://cwms-data.usace.army.mil/cwms-data/timeseries?office=SWL&name=...
//
// Two things about this API are easy to get wrong:
//
// 1. URL ENCODING IS LOAD-BEARING. Timeseries ids contain spaces ("Flow-Res
//    Out") and percent signs ("%-Flood Pool"). URLSearchParams encodes a space
//    as '+', which CDA rejects for `name`, so the query string is built by hand
//    with encodeURIComponent. Do not "simplify" this to URLSearchParams.
//
// 2. The `unit` parameter converts SERVER-SIDE — ask for cfs on a cms series,
//    ft on a metres series, F on a Celsius series and CDA does the maths. There
//    is deliberately no unit conversion in this file.
//
// Responses put nulls inside `values`, so every accessor filters before use.

const CDA_BASE = 'https://cwms-data.usace.army.mil/cwms-data';
const CDA_HEADERS = { Accept: 'application/json;version=2' } as const;

/**
 * Per-request ceiling. Sized against the cron budget: update-gauges runs with
 * maxDuration=60 and already spends ENRICH_BUDGET_MS=30_000 on enrichment, so
 * a slow district must not be able to eat the remainder.
 */
const REQUEST_TIMEOUT_MS = 8_000;

/** Observations publish hourly; no point revalidating faster than that. */
const REVALIDATE_SECONDS = 900;

export interface TimeseriesPoint {
  /** Epoch milliseconds, as CDA returns them. */
  timestamp: number;
  value: number;
}

export interface TimeseriesResult {
  name: string;
  /** Unit CDA converted to — the one that was requested. */
  units: string;
  points: TimeseriesPoint[];
}

function timeseriesUrl(
  office: string,
  tsId: string,
  unit: string,
  begin: Date,
  end: Date
): string {
  return (
    `${CDA_BASE}/timeseries?office=${encodeURIComponent(office)}` +
    `&name=${encodeURIComponent(tsId)}` +
    `&unit=${encodeURIComponent(unit)}` +
    `&begin=${encodeURIComponent(begin.toISOString())}` +
    `&end=${encodeURIComponent(end.toISOString())}`
  );
}

interface CdaTimeseriesResponse {
  name?: string;
  units?: string;
  /** [epochMillis, value, qualityCode] — value may be null. */
  values?: Array<[number, number | null, number]>;
}

/**
 * Fetch one timeseries window. Returns null on any failure — a missing metric
 * is normal (Clearwater has no turbines, MVS publishes no % flood pool), so
 * absence must be cheap and quiet rather than exceptional.
 */
export async function fetchTimeseries(
  office: string,
  tsId: string,
  unit: string,
  begin: Date,
  end: Date,
  options?: { skipCache?: boolean }
): Promise<TimeseriesResult | null> {
  const url = timeseriesUrl(office, tsId, unit, begin, end);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: CDA_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(options?.skipCache
        ? { cache: 'no-store' as const }
        : { next: { revalidate: REVALIDATE_SECONDS } }),
    });
  } catch (e) {
    console.error(`[CDA] ${office}/${tsId}: fetch failed`, e);
    return null;
  }

  if (!res.ok) {
    // A 404 means the timeseries id is wrong, not that CDA is unhealthy — worth
    // saying loudly, because it's how a district rename surfaces.
    if (res.status === 404) {
      console.error(`[CDA] ${office}/${tsId}: 404 — timeseries may have been renamed`);
    } else {
      console.error(`[CDA] ${office}/${tsId}: HTTP ${res.status}`);
    }
    return null;
  }

  let doc: CdaTimeseriesResponse;
  try {
    doc = (await res.json()) as CdaTimeseriesResponse;
  } catch (e) {
    console.error(`[CDA] ${office}/${tsId}: response was not JSON`, e);
    return null;
  }

  const points: TimeseriesPoint[] = (doc.values ?? [])
    .filter((v): v is [number, number, number] => v?.[1] != null && Number.isFinite(v[1]))
    .map(([timestamp, value]) => ({ timestamp, value }));

  return { name: doc.name ?? tsId, units: doc.units ?? unit, points };
}

/**
 * The most recent non-null point in a lookback window, or null.
 * `lookbackHours` covers the series interval plus publication lag.
 */
export async function fetchLatestValue(
  office: string,
  tsId: string,
  unit: string,
  lookbackHours = 8,
  options?: { skipCache?: boolean }
): Promise<TimeseriesPoint | null> {
  const end = new Date();
  const begin = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);
  const result = await fetchTimeseries(office, tsId, unit, begin, end, options);
  if (!result || result.points.length === 0) return null;
  return result.points.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
}

export interface TimeseriesChange {
  /** The window actually asked for, in hours. */
  hours: number;
  /** Signed change over that window, newest minus oldest. */
  delta: number;
}

/**
 * How close to the requested window a point has to sit to stand in for it.
 *
 * Wide enough to absorb a missed hourly reading is NOT the goal — a 45-minute
 * slack admits the 1Hour, 30Minutes and 15Minutes series CWMS publishes (all of
 * which land exactly on the mark) while rejecting a gappy series where the
 * nearest point is an hour or more off. A "3-hour change" measured over 4 hours
 * is a different number wearing the same label.
 */
const CHANGE_WINDOW_TOLERANCE_MS = 45 * 60 * 1000;

/**
 * The change across the last `hours` of a series, or null when it cannot be
 * measured honestly.
 *
 * Reads a window the caller already has in hand. `fetchLatestValue` fetches
 * eight hours and returns one point, so for any metric already being read this
 * costs nothing beyond the arithmetic.
 *
 * Returns null rather than a smaller window when the series is too short or too
 * gappy. A trend is a nice-to-have; a mislabelled one on a surface someone
 * wades against is not.
 */
export function changeOver(
  points: TimeseriesPoint[],
  hours: number
): TimeseriesChange | null {
  if (points.length < 2) return null;

  const latest = points.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  const target = latest.timestamp - hours * 60 * 60 * 1000;

  const oldest = points.reduce((best, p) =>
    Math.abs(p.timestamp - target) < Math.abs(best.timestamp - target) ? p : best
  );
  if (Math.abs(oldest.timestamp - target) > CHANGE_WINDOW_TOLERANCE_MS) return null;
  if (oldest.timestamp === latest.timestamp) return null;

  return { hours, delta: latest.value - oldest.value };
}

/** How live a reading is, decided server-side so every surface agrees. */
export type Staleness = 'fresh' | 'lagging' | 'stale';

export function stalenessOf(timestamp: number, now = Date.now()): Staleness {
  const hours = (now - timestamp) / (60 * 60 * 1000);
  if (hours <= 2) return 'fresh';
  if (hours <= 6) return 'lagging';
  return 'stale';
}
