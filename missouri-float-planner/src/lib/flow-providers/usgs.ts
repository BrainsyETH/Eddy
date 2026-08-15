// src/lib/flow-providers/usgs.ts
// USGS flow provider.
//
// Primary endpoints are the modern OGC API (api.waterdata.usgs.gov), which
// supersedes waterservices.usgs.gov — the legacy service is scheduled for
// decommission in early 2027, with possible degradation starting August 2026
// (https://waterdata.usgs.gov/blog/api-waterservices-decom/).
//
// Every modern call falls back to the legacy endpoint on failure so the
// migration can ship safely; set USGS_FLOW_API=legacy to force legacy-only
// (emergency rollback) or USGS_FLOW_API=modern-only to disable the fallback
// once the modern path is verified in production.
//
// Day-of-year percentiles come from the USGS Statistics API, which is a
// SEPARATE service from this one — different host path, different envelope,
// not an OGC collection. It lives in ./usgs-statistics.ts. (This header used to
// say percentiles had no modern equivalent. They do; that claim outlived the
// fact by long enough to reach three other files.)

import { LEGACY_IV_URL, LEGACY_STAT_URL } from './usgs-legacy';
import { fetchDailyStatisticsRows } from './usgs-statistics';
import type {
  DailyStatistics,
  DailyStatisticsRow,
  FlowProvider,
  GaugeReading,
  HistoricalData,
  HistoricalReading,
} from './types';

// Exported because src/lib/usgs/national-sites.ts fetches the SAME collections
// by bbox rather than by site id, and a second copy of these constants is how
// the two paths would end up pointed at different API generations.
export const MODERN_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v0/collections';

// USGS parameter codes: 00065 = gage height (ft), 00060 = discharge (cfs)
export const PARAM_GAGE_HEIGHT = '00065';
export const PARAM_DISCHARGE = '00060';

type UsgsApiMode = 'modern' | 'modern-only' | 'legacy';

function apiMode(): UsgsApiMode {
  const mode = process.env.USGS_FLOW_API;
  if (mode === 'legacy' || mode === 'modern-only') return mode;
  return 'modern';
}

/** Optional API key raises the modern API's rate limit. */
export function modernHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/geo+json' };
  const key = process.env.USGS_API_KEY;
  if (key) headers['X-Api-Key'] = key;
  return headers;
}

/**
 * Sanity filters shared by both API generations (USGS uses -999999 for errors).
 *
 * Exported because usgs-historical.ts reads the SAME collections for a
 * point-in-time lookup and used to keep its own copies. Two definitions of
 * "is this a real gauge height" is how one path starts accepting a sentinel.
 */
export function validHeight(v: number): boolean {
  return !isNaN(v) && v > -100 && v < 500;
}
export function validDischarge(v: number): boolean {
  return !isNaN(v) && v >= 0 && v < 1000000;
}

/** '07019000' → 'USGS-07019000' (modern monitoring location id format). */
function toLocationId(siteId: string): string {
  return siteId.startsWith('USGS-') ? siteId : `USGS-${siteId}`;
}

/**
 * Drops site ids that are not site ids.
 *
 * A null or empty entry is not a gauge that will come back empty — it poisons
 * the BATCH. The modern path throws on `null.startsWith`; the legacy path is
 * worse, because `join(',')` turns it into `sites=07064533,,07067000`, which
 * waterservices answers with a 400 for every site in the request. One such row
 * reaching /api/usgs/mo-statewide took the condition colours off both maps.
 *
 * Callers still filter at their own level where they can tell WHY a station has
 * no USGS number (see /api/gauges, which knows the provider). This is the floor
 * under all of them: nothing that talks to USGS should be able to be handed an
 * empty identifier.
 */
export function usgsSiteIds(siteIds: readonly (string | null | undefined)[]): string[] {
  return siteIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}
/**
 * 'USGS-07019000' → '07019000'.
 *
 * Exported alongside the fold below for national-sites.ts. Note it strips only
 * the USGS agency prefix: the monitoring-locations collection also carries
 * 'AR001-…' and other agencies, which national ingest filters out rather than
 * mangling into a site id that looks USGS-shaped and is not.
 */
export function fromLocationId(locationId: string): string {
  return locationId.replace(/^USGS-/, '');
}

// ---------------------------------------------------------------------------
// Modern OGC API response shape (GeoJSON FeatureCollection)
// ---------------------------------------------------------------------------

export interface OgcFeature {
  /** Present on bbox queries; the by-site path never reads it. */
  id?: string;
  /**
   * latest-continuous returns the site's point geometry. The by-site path
   * ignores it (coordinates come from gauge_stations), but national ingest
   * uses it as a coordinate fallback when monitoring-locations is missing a
   * site — which happens, and dropping the gauge would be the worse answer.
   */
  geometry?: { type?: string; coordinates?: number[] } | null;
  properties?: {
    monitoring_location_id?: string;
    parameter_code?: string;
    time?: string;
    value?: number | string | null;
    unit_of_measure?: string;
    approval_status?: string;
    qualifier?: string | string[] | null;
  } | null;
}

interface OgcFeatureCollection {
  features?: OgcFeature[];
}

export function parseOgcValue(raw: number | string | null | undefined): number {
  if (raw === null || raw === undefined) return NaN;
  return typeof raw === 'number' ? raw : parseFloat(raw);
}

/** 'USGS-07019000' or '07019000' → 'USGS-07019000'. Shared with the historical path. */
export function toMonitoringLocationId(siteId: string): string {
  return toLocationId(siteId);
}

/**
 * Normalizes modern-API qualifier metadata to legacy USGS qualifier codes so
 * classifyQualifiers() works identically for both API generations.
 */
function ogcQualifiers(props: NonNullable<OgcFeature['properties']>): string[] {
  const codes: string[] = [];
  const raw = props.qualifier;
  if (Array.isArray(raw)) {
    for (const q of raw) if (q) codes.push(String(q));
  } else if (raw) {
    codes.push(String(raw));
  }
  if (props.approval_status && /provisional/i.test(props.approval_status) && !codes.includes('P')) {
    codes.push('P');
  }
  return codes;
}

function mergeQualifierCodes(target: string[], source: string[]): void {
  for (const q of source) {
    if (q && !target.includes(q)) target.push(q);
  }
}

/**
 * Folds OGC features (one per site × parameter) into per-site readings.
 *
 * Exported because national-sites.ts folds the SAME collection fetched by bbox
 * instead of by site id. The sentinel rejection (-999999), the qualifier
 * normalization and the "stage wins the timestamp" rule all have to be
 * identical on both paths, and the only way to guarantee that is one function.
 */
export function foldOgcFeatures(features: OgcFeature[]): Map<string, GaugeReading> {
  const readings = new Map<string, GaugeReading>();

  for (const feature of features) {
    const props = feature.properties;
    if (!props?.monitoring_location_id || !props.time) continue;

    const siteId = fromLocationId(props.monitoring_location_id);
    if (!readings.has(siteId)) {
      readings.set(siteId, {
        siteId,
        // The modern items response carries no site name; display code uses
        // gauge_stations.name from the DB.
        siteName: siteId,
        gaugeHeightFt: null,
        dischargeCfs: null,
        readingTimestamp: null,
        qualifiers: [],
      });
    }
    const reading = readings.get(siteId)!;
    const value = parseOgcValue(props.value);

    if (props.parameter_code === PARAM_GAGE_HEIGHT) {
      if (validHeight(value)) {
        reading.gaugeHeightFt = value;
        reading.readingTimestamp = props.time;
        mergeQualifierCodes(reading.qualifiers, ogcQualifiers(props));
      } else if (!isNaN(value)) {
        console.warn(`[USGS] Invalid gauge height ${value} for site ${siteId}, treating as unavailable`);
      }
    } else if (props.parameter_code === PARAM_DISCHARGE) {
      if (validDischarge(value)) {
        reading.dischargeCfs = value;
        if (!reading.readingTimestamp) reading.readingTimestamp = props.time;
        mergeQualifierCodes(reading.qualifiers, ogcQualifiers(props));
      } else if (!isNaN(value)) {
        console.warn(`[USGS] Invalid discharge ${value} for site ${siteId}, treating as unavailable`);
      }
    }
  }

  return readings;
}

async function fetchLatestModern(
  siteIds: string[],
  options?: { skipCache?: boolean }
): Promise<GaugeReading[]> {
  const url = new URL(`${MODERN_BASE}/latest-continuous/items`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('monitoring_location_id', siteIds.map(toLocationId).join(','));
  url.searchParams.set('parameter_code', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  // One latest value per site × parameter
  url.searchParams.set('limit', String(Math.max(siteIds.length * 2, 10)));

  const fetchOptions: RequestInit = options?.skipCache
    ? { cache: 'no-store', headers: modernHeaders() }
    : { next: { revalidate: 3600 }, headers: modernHeaders() };

  const response = await fetch(url.toString(), fetchOptions);
  if (!response.ok) {
    throw new Error(`USGS modern API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OgcFeatureCollection;
  return Array.from(foldOgcFeatures(data.features ?? []).values());
}

async function fetchHistoryModern(siteId: string, days: number): Promise<HistoricalData | null> {
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL(`${MODERN_BASE}/continuous/items`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('monitoring_location_id', toLocationId(siteId));
  url.searchParams.set('parameter_code', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  url.searchParams.set('datetime', `${start}/..`);
  // ~15-min data × 2 parameters: 96 × 2 × days, padded
  url.searchParams.set('limit', String(Math.min(days * 220, 10000)));

  const response = await fetch(url.toString(), {
    next: { revalidate: 3600 },
    headers: modernHeaders(),
  });
  if (!response.ok) {
    throw new Error(`USGS modern history error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OgcFeatureCollection;
  const features = data.features ?? [];
  if (features.length === 0) return null;

  const readingsMap = new Map<string, HistoricalReading>();
  for (const feature of features) {
    const props = feature.properties;
    if (!props?.time) continue;
    const value = parseOgcValue(props.value);

    if (!readingsMap.has(props.time)) {
      readingsMap.set(props.time, { timestamp: props.time, gaugeHeightFt: null, dischargeCfs: null, qualifiers: [] });
    }
    const reading = readingsMap.get(props.time)!;
    mergeQualifierCodes((reading.qualifiers ??= []), ogcQualifiers(props));
    if (props.parameter_code === PARAM_GAGE_HEIGHT && validHeight(value)) {
      reading.gaugeHeightFt = value;
    } else if (props.parameter_code === PARAM_DISCHARGE && validDischarge(value)) {
      reading.dischargeCfs = value;
    }
  }

  return assembleHistory(siteId, siteId, readingsMap);
}

// ---------------------------------------------------------------------------
// Legacy waterservices.usgs.gov response shape
// ---------------------------------------------------------------------------

interface LegacyValue {
  value: string;
  qualifiers: string[];
  dateTime: string;
}

interface LegacyTimeSeries {
  sourceInfo: {
    siteName: string;
    siteCode: Array<{ value: string; network: string; agencyCode: string }>;
  };
  variable: {
    variableCode: Array<{ value: string; network: string }>;
  };
  values: Array<{ value: Array<LegacyValue> }>;
}

interface LegacyResponse {
  value?: {
    timeSeries?: LegacyTimeSeries[];
  };
}

async function fetchLatestLegacy(
  siteIds: string[],
  options?: { skipCache?: boolean }
): Promise<GaugeReading[]> {
  const url = new URL(LEGACY_IV_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteIds.join(','));
  url.searchParams.set('parameterCd', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  url.searchParams.set('siteStatus', 'all');

  const fetchOptions: RequestInit = options?.skipCache
    ? { cache: 'no-store' }
    : { next: { revalidate: 3600 } };

  const response = await fetch(url.toString(), fetchOptions);
  if (!response.ok) {
    throw new Error(`USGS legacy API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as LegacyResponse;
  if (!data.value?.timeSeries) return [];

  const readings = new Map<string, GaugeReading>();
  for (const series of data.value.timeSeries) {
    const siteId = series.sourceInfo.siteCode[0]?.value;
    if (!siteId) continue;

    if (!readings.has(siteId)) {
      readings.set(siteId, {
        siteId,
        siteName: series.sourceInfo.siteName,
        gaugeHeightFt: null,
        dischargeCfs: null,
        readingTimestamp: null,
        qualifiers: [],
      });
    }
    const reading = readings.get(siteId)!;
    const variableCode = series.variable.variableCode[0]?.value;
    const latestValue = series.values[0]?.value?.[0];
    if (!latestValue) continue;

    const num = parseFloat(latestValue.value);
    if (variableCode === PARAM_GAGE_HEIGHT) {
      if (validHeight(num)) {
        reading.gaugeHeightFt = num;
        reading.readingTimestamp = latestValue.dateTime;
        mergeQualifierCodes(reading.qualifiers, latestValue.qualifiers ?? []);
      } else if (!isNaN(num)) {
        console.warn(`[USGS] Invalid gauge height ${num} for site ${siteId}, treating as unavailable`);
      }
    } else if (variableCode === PARAM_DISCHARGE) {
      if (validDischarge(num)) {
        reading.dischargeCfs = num;
        if (!reading.readingTimestamp) reading.readingTimestamp = latestValue.dateTime;
        mergeQualifierCodes(reading.qualifiers, latestValue.qualifiers ?? []);
      } else if (!isNaN(num)) {
        console.warn(`[USGS] Invalid discharge ${num} for site ${siteId}, treating as unavailable`);
      }
    }
  }

  return Array.from(readings.values());
}

async function fetchHistoryLegacy(siteId: string, days: number): Promise<HistoricalData | null> {
  const url = new URL(LEGACY_IV_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('parameterCd', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  url.searchParams.set('period', `P${days}D`);
  url.searchParams.set('siteStatus', 'all');

  const response = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(`USGS legacy history error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as LegacyResponse;
  if (!data.value?.timeSeries || data.value.timeSeries.length === 0) return null;

  const readingsMap = new Map<string, HistoricalReading>();
  let siteName = '';
  for (const series of data.value.timeSeries) {
    siteName = series.sourceInfo.siteName;
    const variableCode = series.variable.variableCode[0]?.value;
    for (const val of series.values[0]?.value || []) {
      const numValue = parseFloat(val.value);
      if (!readingsMap.has(val.dateTime)) {
        readingsMap.set(val.dateTime, { timestamp: val.dateTime, gaugeHeightFt: null, dischargeCfs: null, qualifiers: [] });
      }
      const reading = readingsMap.get(val.dateTime)!;
      mergeQualifierCodes((reading.qualifiers ??= []), val.qualifiers ?? []);
      if (variableCode === PARAM_GAGE_HEIGHT && validHeight(numValue)) {
        reading.gaugeHeightFt = numValue;
      } else if (variableCode === PARAM_DISCHARGE && validDischarge(numValue)) {
        reading.dischargeCfs = numValue;
      }
    }
  }

  return assembleHistory(siteId, siteName, readingsMap);
}

function assembleHistory(
  siteId: string,
  siteName: string,
  readingsMap: Map<string, HistoricalReading>
): HistoricalData | null {
  const readings = Array.from(readingsMap.values())
    .filter((r) => r.gaugeHeightFt !== null || r.dischargeCfs !== null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (readings.length === 0) return null;

  const dischargeValues = readings.map((r) => r.dischargeCfs).filter((v): v is number => v !== null);
  const heightValues = readings.map((r) => r.gaugeHeightFt).filter((v): v is number => v !== null);

  return {
    siteId,
    siteName,
    readings,
    minDischarge: dischargeValues.length > 0 ? Math.min(...dischargeValues) : null,
    maxDischarge: dischargeValues.length > 0 ? Math.max(...dischargeValues) : null,
    minHeight: heightValues.length > 0 ? Math.min(...heightValues) : null,
    maxHeight: heightValues.length > 0 ? Math.max(...heightValues) : null,
  };
}

// ---------------------------------------------------------------------------
// Legacy statistics service (no modern equivalent confirmed yet)
// ---------------------------------------------------------------------------
//
// Two hard-won facts about this endpoint:
//
// 1. It does NOT support format=json — that returns HTTP 400 with an HTML
//    error page. Only format=rdb (tab-delimited) works. An earlier JSON
//    implementation here silently returned null on every call.
//
// 2. As of 2026 it publishes p05/p10/p20/p25/p50/p75/p80/p95 but leaves
//    p90_va EMPTY for every site/day checked. Consumers must not require p90
//    (see calculateDischargePercentile in src/lib/usgs/gauges.ts).
//
// One request returns the whole year for a site, which is also what the
// percentile snapshot (src/lib/usgs/percentile-snapshot.ts) captures against
// the service's scheduled decommission.

/** Every percentile the service publishes, plus the mean. */
const STAT_TYPES = 'p05,p10,p20,p25,p50,p75,p80,p90,p95,mean';

// The row shape moved to ./types when the modern Statistics API became a second
// producer of it. Re-exported so existing importers keep working.
export type { DailyStatisticsRow };

/** USGS uses -999999 as a no-data sentinel; treat it as null, not a flow. */
function parseStatVal(val?: string): number | null {
  if (val === undefined || val === null || val.trim() === '' || val.trim() === '-999999') return null;
  const num = parseFloat(val);
  return Number.isFinite(num) ? num : null;
}

function parseStatInt(val?: string): number | null {
  const num = parseStatVal(val);
  return num === null ? null : Math.round(num);
}

/**
 * Parses an RDB (tab-delimited) payload into records keyed by column name.
 * RDB = '#'-prefixed comments, a header row, a format-spec row, then data.
 */
export function parseRdb(text: string): Array<Record<string, string>> {
  const lines = text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t');
  // lines[1] is the format spec ('5s', '15s', …) — skip it.
  return lines.slice(2).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

/** Parses a daily-statistics RDB payload into day-of-year rows. */
export function parseDailyStatisticsRdb(text: string): DailyStatisticsRow[] {
  const rows: DailyStatisticsRow[] = [];

  for (const record of parseRdb(text)) {
    if (record.parameter_cd && record.parameter_cd !== PARAM_DISCHARGE) continue;

    const month = parseStatInt(record.month_nu);
    const day = parseStatInt(record.day_nu);
    if (month === null || day === null) continue;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    rows.push({
      month,
      day,
      p05: parseStatVal(record.p05_va),
      p10: parseStatVal(record.p10_va),
      p20: parseStatVal(record.p20_va),
      p25: parseStatVal(record.p25_va),
      p50: parseStatVal(record.p50_va),
      p75: parseStatVal(record.p75_va),
      p80: parseStatVal(record.p80_va),
      p90: parseStatVal(record.p90_va),
      p95: parseStatVal(record.p95_va),
      mean: parseStatVal(record.mean_va),
      countYears: parseStatInt(record.count_nu),
      beginYear: parseStatInt(record.begin_yr),
      endYear: parseStatInt(record.end_yr),
    });
  }

  return rows;
}

/** Fetches the full year of daily statistics for one site. */
export async function fetchAllDailyStatistics(siteId: string): Promise<DailyStatisticsRow[]> {
  const url = new URL(LEGACY_STAT_URL);
  url.searchParams.set('format', 'rdb');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('statReportType', 'daily');
  url.searchParams.set('statTypeCd', STAT_TYPES);
  url.searchParams.set('parameterCd', PARAM_DISCHARGE);

  const response = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!response.ok) {
    throw new Error(
      `USGS statistics API error for ${siteId}: ${response.status} ${response.statusText}`
    );
  }

  return parseDailyStatisticsRdb(await response.text());
}

/** Converts a row to the app-wide DailyStatistics shape. */
export function toDailyStatistics(siteId: string, row: DailyStatisticsRow): DailyStatistics {
  return {
    siteId,
    month: row.month,
    day: row.day,
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
    yearsOfRecord: row.countYears,
  };
}

function pickDay(
  siteId: string,
  rows: DailyStatisticsRow[],
  date?: Date
): DailyStatistics | null {
  const targetDate = date || new Date();
  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();

  const dayStats = rows.find((row) => row.month === month && row.day === day);
  if (!dayStats) {
    console.warn(`No statistics for ${month}/${day} at site ${siteId}`);
    return null;
  }

  return toDailyStatistics(siteId, dayStats);
}

async function fetchDailyStatisticsLegacy(siteId: string, date?: Date): Promise<DailyStatistics | null> {
  return pickDay(siteId, await fetchAllDailyStatistics(siteId), date);
}

async function fetchDailyStatisticsModern(siteId: string, date?: Date): Promise<DailyStatistics | null> {
  return pickDay(siteId, await fetchDailyStatisticsRows(siteId, PARAM_DISCHARGE), date);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class UsgsProvider implements FlowProvider {
  readonly id = 'usgs';

  async fetchLatest(
    rawSiteIds: string[],
    options?: { skipCache?: boolean }
  ): Promise<GaugeReading[]> {
    const siteIds = usgsSiteIds(rawSiteIds);
    if (siteIds.length === 0) return [];
    const mode = apiMode();

    if (mode === 'legacy') {
      return fetchLatestLegacy(siteIds, options);
    }
    try {
      const readings = await fetchLatestModern(siteIds, options);
      // An empty result for known-active sites usually means a query problem,
      // not dry gauges — let the fallback double-check while we bed this in.
      if (readings.length > 0 || mode === 'modern-only') return readings;
      console.warn('[USGS] Modern API returned no readings; falling back to legacy');
    } catch (error) {
      if (mode === 'modern-only') throw error;
      console.warn('[USGS] Modern API failed; falling back to legacy:', error);
    }
    return fetchLatestLegacy(siteIds, options);
  }

  async fetchHistory(siteId: string, days: number = 7): Promise<HistoricalData | null> {
    const mode = apiMode();
    if (mode === 'legacy') {
      return safeHistory(() => fetchHistoryLegacy(siteId, days), siteId);
    }
    try {
      const history = await fetchHistoryModern(siteId, days);
      if (history || mode === 'modern-only') return history;
      console.warn(`[USGS] Modern history empty for ${siteId}; falling back to legacy`);
    } catch (error) {
      if (mode === 'modern-only') {
        console.error(`Error fetching USGS historical data for site ${siteId}:`, error);
        return null;
      }
      console.warn(`[USGS] Modern history failed for ${siteId}; falling back to legacy:`, error);
    }
    return safeHistory(() => fetchHistoryLegacy(siteId, days), siteId);
  }

  async fetchDailyStatistics(siteId: string, date?: Date): Promise<DailyStatistics | null> {
    const mode = apiMode();
    if (mode === 'legacy') {
      return safeStatistics(() => fetchDailyStatisticsLegacy(siteId, date), siteId);
    }
    try {
      const stats = await fetchDailyStatisticsModern(siteId, date);
      // A site with no published normals is normal (too short a record), so an
      // empty result is NOT a reason to re-ask the legacy service — unlike
      // fetchLatest, where empty usually means a malformed query.
      if (stats || mode === 'modern-only') return stats;
      return null;
    } catch (error) {
      if (mode === 'modern-only') {
        console.error(`Error fetching USGS statistics for site ${siteId}:`, error);
        return null;
      }
      console.warn(`[USGS] Modern statistics failed for ${siteId}; falling back to legacy:`, error);
    }
    return safeStatistics(() => fetchDailyStatisticsLegacy(siteId, date), siteId);
  }

  publicUrl(siteId: string): string {
    return `https://waterdata.usgs.gov/monitoring-location/${siteId}/`;
  }
}

async function safeHistory(
  fn: () => Promise<HistoricalData | null>,
  siteId: string
): Promise<HistoricalData | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Error fetching USGS historical data for site ${siteId}:`, error);
    return null;
  }
}

async function safeStatistics(
  fn: () => Promise<DailyStatistics | null>,
  siteId: string
): Promise<DailyStatistics | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Error fetching USGS statistics for site ${siteId}:`, error);
    return null;
  }
}
