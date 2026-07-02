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
// Daily statistics (day-of-year percentiles) have no confirmed modern
// equivalent yet and remain on the legacy statistics service; swap the
// implementation of fetchDailyStatistics here when USGS ships one.

import type {
  DailyStatistics,
  FlowProvider,
  GaugeReading,
  HistoricalData,
  HistoricalReading,
} from './types';

const MODERN_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v0/collections';
const LEGACY_IV_URL = 'https://waterservices.usgs.gov/nwis/iv/';
const LEGACY_STAT_URL = 'https://waterservices.usgs.gov/nwis/stat/';

// USGS parameter codes: 00065 = gage height (ft), 00060 = discharge (cfs)
const PARAM_GAGE_HEIGHT = '00065';
const PARAM_DISCHARGE = '00060';

type UsgsApiMode = 'modern' | 'modern-only' | 'legacy';

function apiMode(): UsgsApiMode {
  const mode = process.env.USGS_FLOW_API;
  if (mode === 'legacy' || mode === 'modern-only') return mode;
  return 'modern';
}

/** Optional API key raises the modern API's rate limit. */
function modernHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/geo+json' };
  const key = process.env.USGS_API_KEY;
  if (key) headers['X-Api-Key'] = key;
  return headers;
}

/** Sanity filters shared by both API generations (USGS uses -999999 for errors). */
function validHeight(v: number): boolean {
  return !isNaN(v) && v > -100 && v < 500;
}
function validDischarge(v: number): boolean {
  return !isNaN(v) && v >= 0 && v < 1000000;
}

/** '07019000' → 'USGS-07019000' (modern monitoring location id format). */
function toLocationId(siteId: string): string {
  return siteId.startsWith('USGS-') ? siteId : `USGS-${siteId}`;
}
function fromLocationId(locationId: string): string {
  return locationId.replace(/^USGS-/, '');
}

// ---------------------------------------------------------------------------
// Modern OGC API response shape (GeoJSON FeatureCollection)
// ---------------------------------------------------------------------------

interface OgcFeature {
  properties?: {
    monitoring_location_id?: string;
    parameter_code?: string;
    time?: string;
    value?: number | string | null;
    unit_of_measure?: string;
    approval_status?: string;
    qualifier?: string | string[] | null;
  };
}

interface OgcFeatureCollection {
  features?: OgcFeature[];
}

function parseOgcValue(raw: number | string | null | undefined): number {
  if (raw === null || raw === undefined) return NaN;
  return typeof raw === 'number' ? raw : parseFloat(raw);
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

/** Folds OGC features (one per site × parameter) into per-site readings. */
function foldOgcFeatures(features: OgcFeature[]): Map<string, GaugeReading> {
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
    ? { cache: 'no-store', headers: modernHeaders(), signal: AbortSignal.timeout(15_000) }
    : { next: { revalidate: 3600 }, headers: modernHeaders(), signal: AbortSignal.timeout(15_000) };

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
    signal: AbortSignal.timeout(15_000),
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
      readingsMap.set(props.time, { timestamp: props.time, gaugeHeightFt: null, dischargeCfs: null });
    }
    const reading = readingsMap.get(props.time)!;
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
    ? { cache: 'no-store', signal: AbortSignal.timeout(15_000) }
    : { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15_000) };

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

  const response = await fetch(url.toString(), { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15_000) });
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
        readingsMap.set(val.dateTime, { timestamp: val.dateTime, gaugeHeightFt: null, dischargeCfs: null });
      }
      const reading = readingsMap.get(val.dateTime)!;
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

interface LegacyStatValue {
  month_nu: string;
  day_nu: string;
  p10_va?: string;
  p25_va?: string;
  p50_va?: string;
  p75_va?: string;
  p90_va?: string;
  mean_va?: string;
  count_nu?: string;
}

async function fetchDailyStatisticsLegacy(siteId: string, date?: Date): Promise<DailyStatistics | null> {
  const targetDate = date || new Date();
  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();

  const url = new URL(LEGACY_STAT_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('statReportType', 'daily');
  url.searchParams.set('statTypeCd', 'p10,p25,p50,p75,p90,mean');
  url.searchParams.set('parameterCd', PARAM_DISCHARGE);

  const response = await fetch(url.toString(), {
    next: { revalidate: 86400 }, // Stats change rarely
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error(`USGS Statistics API error: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = await response.json();
  const timeSeries = data?.value?.timeSeries;
  if (!timeSeries || timeSeries.length === 0) {
    console.warn(`No statistics available for site ${siteId}`);
    return null;
  }

  const dischargeSeries = timeSeries.find(
    (ts: { variable?: { variableCode?: Array<{ value: string }> } }) =>
      ts.variable?.variableCode?.[0]?.value === PARAM_DISCHARGE
  );
  if (!dischargeSeries?.values?.[0]?.value) {
    console.warn(`No discharge statistics for site ${siteId}`);
    return null;
  }

  const allStats = dischargeSeries.values[0].value as LegacyStatValue[];
  const dayStats = allStats.find(
    (stat) => parseInt(stat.month_nu) === month && parseInt(stat.day_nu) === day
  );
  if (!dayStats) {
    console.warn(`No statistics for ${month}/${day} at site ${siteId}`);
    return null;
  }

  const parseVal = (val?: string): number | null => {
    if (!val || val === '' || val === '-999999') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  };

  return {
    siteId,
    month,
    day,
    p10: parseVal(dayStats.p10_va),
    p25: parseVal(dayStats.p25_va),
    p50: parseVal(dayStats.p50_va),
    p75: parseVal(dayStats.p75_va),
    p90: parseVal(dayStats.p90_va),
    mean: parseVal(dayStats.mean_va),
    yearsOfRecord: parseVal(dayStats.count_nu),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class UsgsProvider implements FlowProvider {
  readonly id = 'usgs';

  async fetchLatest(
    siteIds: string[],
    options?: { skipCache?: boolean }
  ): Promise<GaugeReading[]> {
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
    try {
      return await fetchDailyStatisticsLegacy(siteId, date);
    } catch (error) {
      console.error(`Error fetching USGS statistics for site ${siteId}:`, error);
      return null;
    }
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
