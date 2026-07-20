// src/lib/flow-providers/usgs-historical.ts
// Fetches the USGS gauge reading closest to a specific point in time — used to
// backfill a River Visual photo's gauge height / discharge from when the photo
// was actually taken (EXIF capture time), not when it was uploaded.
//
// Two sources, IV preferred:
//   - Instantaneous values (IV): a ±12h window, take the reading nearest the
//     target instant. Carries BOTH gauge height and discharge and serves data
//     years back, so it is tried first for every date.
//   - Daily values (DV, daily mean): fallback only when IV has nothing. Coarser
//     (one mean per day) and discharge-only — USGS does not publish a
//     gauge-height daily mean — so a DV result has no stage.
//
// EXIF DateTimeOriginal carries no timezone, so callers pass a best-effort
// instant; IV's wide window + nearest-match tolerates the offset, and DV is
// matched on the calendar date (not the instant) so an evening capture doesn't
// grab the next day's midnight-stamped mean.

const LEGACY_IV_URL = 'https://waterservices.usgs.gov/nwis/iv/';
const LEGACY_DV_URL = 'https://waterservices.usgs.gov/nwis/dv/';

const PARAM_GAGE_HEIGHT = '00065';
const PARAM_DISCHARGE = '00060';
const DAY_MS = 24 * 60 * 60 * 1000;

function validHeight(v: number): boolean {
  return !isNaN(v) && v > -100 && v < 500;
}
function validDischarge(v: number): boolean {
  return !isNaN(v) && v >= 0 && v < 1_000_000;
}

interface LegacyValue {
  value: string;
  dateTime: string;
}
interface LegacyTimeSeries {
  variable: { variableCode: Array<{ value: string }> };
  values: Array<{ value: LegacyValue[] }>;
}
interface LegacyResponse {
  value?: { timeSeries?: LegacyTimeSeries[] };
}

export interface UsgsReadingAt {
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** The USGS observation timestamp actually used (nearest to the target). */
  observedAt: string | null;
  /** Which USGS service the value came from. */
  source: 'iv' | 'dv';
}

async function fetchLegacyJson(url: URL): Promise<LegacyResponse | null> {
  // Historical values never change; cache aggressively.
  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  return (await res.json()) as LegacyResponse;
}

/**
 * From a set of USGS time series (one per parameter), pick the height and
 * discharge values whose timestamps are nearest the target instant.
 */
function pickNearest(
  timeSeries: LegacyTimeSeries[],
  targetMs: number,
  preferDateStr?: string
): { gaugeHeightFt: number | null; dischargeCfs: number | null; observedAt: string | null } {
  let gaugeHeightFt: number | null = null;
  let dischargeCfs: number | null = null;
  let observedAt: string | null = null;
  let bestDiff = Infinity;

  for (const series of timeSeries) {
    const code = series.variable?.variableCode?.[0]?.value;
    const values = series.values?.[0]?.value ?? [];

    let best: LegacyValue | null = null;
    let bestSeriesDiff = Infinity;
    for (const v of values) {
      // Daily values are stamped at local midnight, so matching by nearest
      // instant grabs an adjacent day for an evening capture. When a target
      // calendar date is given (the DV path), prefer the exact-date value.
      if (preferDateStr && v.dateTime.slice(0, 10) === preferDateStr) {
        best = v;
        bestSeriesDiff = 0;
        break;
      }
      const t = new Date(v.dateTime).getTime();
      if (isNaN(t)) continue;
      const diff = Math.abs(t - targetMs);
      if (diff < bestSeriesDiff) {
        bestSeriesDiff = diff;
        best = v;
      }
    }
    if (!best) continue;

    const num = parseFloat(best.value);
    if (code === PARAM_GAGE_HEIGHT && validHeight(num)) {
      gaugeHeightFt = num;
    } else if (code === PARAM_DISCHARGE && validDischarge(num)) {
      dischargeCfs = num;
    } else {
      continue;
    }
    // Track the closest observation timestamp across the parameters used.
    if (bestSeriesDiff < bestDiff) {
      bestDiff = bestSeriesDiff;
      observedAt = best.dateTime;
    }
  }

  return { gaugeHeightFt, dischargeCfs, observedAt };
}

async function fetchInstantaneousAt(siteId: string, when: Date): Promise<UsgsReadingAt | null> {
  const url = new URL(LEGACY_IV_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('parameterCd', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  url.searchParams.set('startDT', new Date(when.getTime() - 12 * 60 * 60 * 1000).toISOString());
  url.searchParams.set('endDT', new Date(when.getTime() + 12 * 60 * 60 * 1000).toISOString());
  url.searchParams.set('siteStatus', 'all');

  const data = await fetchLegacyJson(url);
  const timeSeries = data?.value?.timeSeries;
  if (!timeSeries || timeSeries.length === 0) return null;

  const { gaugeHeightFt, dischargeCfs, observedAt } = pickNearest(timeSeries, when.getTime());
  if (gaugeHeightFt === null && dischargeCfs === null) return null;
  return { gaugeHeightFt, dischargeCfs, observedAt, source: 'iv' };
}

async function fetchDailyMeanAt(siteId: string, when: Date): Promise<UsgsReadingAt | null> {
  const url = new URL(LEGACY_DV_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('parameterCd', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  // Widen a day on each side to tolerate the timezone-less capture instant,
  // then take the daily-mean value nearest the target.
  url.searchParams.set('startDT', new Date(when.getTime() - DAY_MS).toISOString().slice(0, 10));
  url.searchParams.set('endDT', new Date(when.getTime() + DAY_MS).toISOString().slice(0, 10));
  url.searchParams.set('statCd', '00003'); // daily mean

  const data = await fetchLegacyJson(url);
  const timeSeries = data?.value?.timeSeries;
  if (!timeSeries || timeSeries.length === 0) return null;

  const { gaugeHeightFt, dischargeCfs, observedAt } = pickNearest(
    timeSeries,
    when.getTime(),
    when.toISOString().slice(0, 10)
  );
  if (gaugeHeightFt === null && dischargeCfs === null) return null;
  return { gaugeHeightFt, dischargeCfs, observedAt, source: 'dv' };
}

/**
 * Best-effort gauge reading for `siteId` nearest `when`. Recent captures use
 * instantaneous data; older ones fall back to the daily mean. Returns null when
 * USGS has nothing usable (network error, gap in record, ungauged period).
 */
export async function fetchUsgsReadingAt(siteId: string, when: Date): Promise<UsgsReadingAt | null> {
  // Try instantaneous first for any date. IV carries both gauge height and
  // discharge and serves data years back (the old ~120-day retention no longer
  // holds), so it gives the reading at the actual capture time — and, unlike DV,
  // it has stage. Fall back to the daily mean only when IV returns nothing.
  const iv = await fetchInstantaneousAt(siteId, when).catch(() => null);
  if (iv) return iv;
  return fetchDailyMeanAt(siteId, when).catch(() => null);
}
