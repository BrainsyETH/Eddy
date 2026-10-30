// src/lib/embed/river-data.ts
// Server-side assembly for the river embed family.
//
// The old widgets each fetched /api/rivers (every river) and /api/gauges
// (every curated station) from inside the iframe, then one history request
// per gauge, then weather — a six-request waterfall and a skeleton on every
// host-page load. This reads what ONE river needs, once, server-side, and the
// page ships finished HTML. Cached for two minutes per (river, chart window),
// the same budget the public river pages run on.
//
// Readings come through loadCurrentReadings (gauge_latest merged with curated
// history, newest wins), the ladder from river_gauges, the condition from the
// shared classifier, the trend from computeTrend over the stored history —
// every number the widget prints is the number the river page prints.

import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { pageRivers } from '@/lib/data/public-pages';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { getCoordinates } from '@/lib/api-utils';
import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import { computeTrend, type TrendDirection } from '@shared/gauge-trend';
import { sampleChartReadings } from '@shared/chart-model';
import { loadLatestEddyUpdate } from '@/lib/eddy/latest-update';
import { fetchForecast, fetchWeather, getWeatherPointForRiver } from '@/lib/weather/openweather';
import { getEmbedBranding, type EmbedBrandingRecord } from '@/lib/embed/cards';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import { toNum } from '@/lib/utils/num';
import type { ConditionCode } from '@/types/api';
import { formatRange, type EmbedChartDays, type ReadingUnit } from './options';

export interface EmbedLadder {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  unit: ReadingUnit;
}

export interface EmbedGauge {
  id: string;
  siteId: string;
  name: string;
  isPrimary: boolean;
  /** The unit this gauge's ladder for the river is graded in. */
  unit: ReadingUnit;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingSuspect: boolean;
  qualifierNote: string | null;
  conditionCode: ConditionCode;
  conditionLabel: string;
  ladder: EmbedLadder;
  optimalRange: string | null;
  trend: TrendDirection | null;
  coordinates: { lat: number; lng: number } | null;
}

export interface EmbedTake {
  text: string;
  /** ISO; null for the static fallback line. */
  generatedAt: string | null;
  /** The condition the prose was written for; the badge always shows live. */
  conditionCode: string | null;
}

export interface EmbedWeather {
  tempF: number | null;
  condition: string | null;
  highF: number | null;
  lowF: number | null;
  /** Chance of precipitation today, 0–100, when the forecast loaded. */
  precipitation: number | null;
}

export interface EmbedChart {
  readings: { timestamp: string; value: number }[];
  unit: ReadingUnit;
  thresholds: EmbedLadder | null;
  days: EmbedChartDays;
}

export interface RiverEmbedData {
  river: {
    id: string;
    slug: string;
    name: string;
    path: string;
    state: string;
    lengthMiles: number | null;
    accessPointCount: number;
    conditionCode: ConditionCode;
    conditionLabel: string;
    thresholdUnit: ReadingUnit | null;
  };
  primary: EmbedGauge | null;
  secondary: EmbedGauge[];
  take: EmbedTake | null;
  weather: EmbedWeather | null;
  chart: EmbedChart | null;
  /** Epoch ms the assembly ran; ages are computed against the request clock. */
  assembledAt: number;
}

const CHART_MAX_POINTS = 240;

interface StationRow {
  id: string;
  usgs_site_id: string | null;
  site_id_external: string | null;
  provider: string | null;
  name: string | null;
  location: unknown;
  curated: boolean | null;
}

interface LadderRow {
  gauge_station_id: string;
  is_primary: boolean | null;
  threshold_unit: string | null;
  level_too_low: unknown;
  level_low: unknown;
  level_optimal_min: unknown;
  level_optimal_max: unknown;
  level_high: unknown;
  level_dangerous: unknown;
  gauge_stations: StationRow | StationRow[] | null;
}

async function loadGauges(
  supabase: ReturnType<typeof createAdminClient>,
  riverId: string,
): Promise<EmbedGauge[]> {
  const { data, error } = await supabase
    .from('river_gauges')
    .select(`
      gauge_station_id, is_primary, threshold_unit,
      level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous,
      gauge_stations!inner ( id, usgs_site_id, site_id_external, provider, name, location, curated, active )
    `)
    .eq('river_id', riverId);
  if (error || !data) {
    if (error) console.error('[embed/river] ladder lookup failed:', error);
    return [];
  }

  const rows = (data as unknown as LadderRow[]).filter((row) => {
    const station = Array.isArray(row.gauge_stations) ? row.gauge_stations[0] : row.gauge_stations;
    return station && (station as StationRow & { active?: boolean | null }).active !== false;
  });
  if (rows.length === 0) return [];

  const stations = rows.map((row) => (Array.isArray(row.gauge_stations) ? row.gauge_stations[0] : row.gauge_stations) as StationRow);
  const readings = await loadCurrentReadings(
    supabase,
    stations.map((s) => s.id),
    { stations: stations.map((s) => ({ id: s.id, provider: s.provider, curated: s.curated === true })) },
  );

  const gauges: EmbedGauge[] = rows.map((row, index) => {
    const station = stations[index];
    const reading = readings.get(station.id);
    const unit: ReadingUnit = row.threshold_unit === 'cfs' ? 'cfs' : 'ft';
    const ladder: EmbedLadder = {
      levelTooLow: toNum(row.level_too_low),
      levelLow: toNum(row.level_low),
      levelOptimalMin: toNum(row.level_optimal_min),
      levelOptimalMax: toNum(row.level_optimal_max),
      levelHigh: toNum(row.level_high),
      levelDangerous: toNum(row.level_dangerous),
      unit,
    };
    const thresholds: ConditionThresholds = { ...ladder, thresholdUnit: unit };
    const gaugeHeightFt = reading?.gauge_height_ft ?? null;
    const dischargeCfs = reading?.discharge_cfs ?? null;
    const result = computeCondition(gaugeHeightFt, thresholds, dischargeCfs);
    const qualifiers = classifyQualifiers(reading?.qualifiers ?? null, station.provider);
    return {
      id: station.id,
      siteId: station.usgs_site_id || station.site_id_external || station.id,
      name: station.name || 'Gauge',
      isPrimary: row.is_primary === true,
      unit,
      gaugeHeightFt,
      dischargeCfs,
      readingTimestamp: reading?.reading_at ?? null,
      readingSuspect: qualifiers.suspect,
      qualifierNote: qualifiers.note,
      conditionCode: result.code,
      conditionLabel: getConditionShortLabel(result.code),
      ladder,
      optimalRange: formatRange(ladder.levelOptimalMin, ladder.levelOptimalMax, unit),
      trend: null,
      coordinates: getCoordinates(station.location),
    };
  });

  gauges.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return gauges;
}

interface HistoryRow {
  reading_timestamp: string;
  gauge_height_ft: unknown;
  discharge_cfs: unknown;
}

async function loadHistory(
  supabase: ReturnType<typeof createAdminClient>,
  stationId: string,
  days: number,
  now: number,
) {
  const { data, error } = await supabase
    .from('gauge_readings')
    .select('reading_timestamp, gauge_height_ft, discharge_cfs')
    .eq('gauge_station_id', stationId)
    .gte('reading_timestamp', new Date(now - days * 86_400_000).toISOString())
    .order('reading_timestamp', { ascending: true });
  if (error || !data) return [];
  return (data as HistoryRow[])
    .map((r) => ({
      timestamp: r.reading_timestamp,
      gaugeHeightFt: toNum(r.gauge_height_ft),
      dischargeCfs: toNum(r.discharge_cfs),
    }))
    .filter((r) => r.gaugeHeightFt !== null || r.dischargeCfs !== null);
}

async function loadWeather(slug: string): Promise<EmbedWeather | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;
  try {
    const point = await getWeatherPointForRiver(slug);
    if (!point) return null;
    const [current, forecast] = await Promise.allSettled([
      fetchWeather(point.lat, point.lon, apiKey),
      fetchForecast(point.lat, point.lon, apiKey),
    ]);
    const now = current.status === 'fulfilled' ? current.value : null;
    const today = forecast.status === 'fulfilled' ? forecast.value.days?.[0] ?? null : null;
    if (!now && !today) return null;
    return {
      tempF: now ? Math.round(now.temp) : null,
      condition: now?.condition ?? today?.condition ?? null,
      highF: today ? Math.round(today.tempHigh) : null,
      lowF: today ? Math.round(today.tempLow) : null,
      precipitation: today ? Math.round(today.precipitation) : null,
    };
  } catch (error) {
    console.warn(`[embed/river] weather unavailable for ${slug}:`, error);
    return null;
  }
}

async function assembleRiverEmbed(slug: string, days: EmbedChartDays): Promise<RiverEmbedData | null> {
  const now = Date.now();
  const rivers = await pageRivers();
  const river = rivers.find((r) => r.slug === slug);
  if (!river) return null;

  const supabase = createAdminClient();
  const [gauges, update, weather] = await Promise.all([
    loadGauges(supabase, river.id),
    loadLatestEddyUpdate(supabase, slug).catch(() => ({ state: 'error' as const })),
    loadWeather(slug),
  ]);

  const primary = gauges[0] ?? null;
  const secondary = gauges.slice(1);
  let chart: EmbedChart | null = null;

  if (primary) {
    // One stored-history read serves both the chart and the six-hour trend —
    // the widget used to issue a separate ?days=1 request per gauge for the
    // arrow alone.
    const history = await loadHistory(supabase, primary.id, days, now);
    const trend = computeTrend(history, primary.unit, 6);
    primary.trend = trend?.direction ?? null;
    const sampled = sampleChartReadings(history, CHART_MAX_POINTS);
    const readings = sampled
      .map((r) => ({ timestamp: r.timestamp, value: primary.unit === 'cfs' ? r.dischargeCfs : r.gaugeHeightFt }))
      .filter((r): r is { timestamp: string; value: number } => r.value !== null);
    if (readings.length >= 2) chart = { readings, unit: primary.unit, thresholds: primary.ladder, days };
  }

  const liveCode = river.currentCondition?.code ?? primary?.conditionCode ?? 'unknown';
  let take: EmbedTake | null = null;
  if (update.state === 'ok' && update.update?.summaryText) {
    take = {
      text: update.update.summaryText,
      generatedAt: update.update.generatedAt,
      conditionCode: update.update.conditionCode,
    };
  } else {
    // Static fallback: the canonical blurb for the live bucket plus the range.
    const blurb = CONDITION_CARD_BLURBS[liveCode as ConditionCode] || CONDITION_CARD_BLURBS.unknown;
    const parts = [blurb];
    if (primary?.optimalRange) parts.push(`Optimal range is ${primary.optimalRange}.`);
    take = { text: parts.join(' '), generatedAt: null, conditionCode: null };
  }

  return {
    river: {
      id: river.id,
      slug: river.slug,
      name: river.name,
      path: river.path || `/rivers/${river.slug}`,
      state: river.state,
      lengthMiles: river.lengthMiles ?? null,
      accessPointCount: river.accessPointCount,
      conditionCode: liveCode,
      conditionLabel: getConditionShortLabel(liveCode),
      thresholdUnit: river.currentCondition?.thresholdUnit ?? primary?.unit ?? null,
    },
    primary,
    secondary,
    take,
    weather,
    chart,
    assembledAt: now,
  };
}

const cachedRiverEmbed = unstable_cache(
  (slug: string, days: EmbedChartDays) => assembleRiverEmbed(slug, days),
  ['embed-river-v1'],
  { revalidate: 120 },
);

export async function loadRiverEmbed(slug: string, days: EmbedChartDays = 14): Promise<RiverEmbedData | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  return cachedRiverEmbed(slug, days);
}

/** Several rivers for the stacked strip, in the order asked for. */
export async function loadRiverEmbeds(slugs: string[], max = 8): Promise<RiverEmbedData[]> {
  const wanted = slugs.filter((s) => /^[a-z0-9-]{1,60}$/.test(s)).slice(0, max);
  const list = wanted.length > 0 ? wanted : (await pageRivers()).map((r) => r.slug).slice(0, max);
  const results = await Promise.all(list.map((slug) => loadRiverEmbed(slug, 7).catch(() => null)));
  return results.filter((r): r is RiverEmbedData => r !== null);
}

const cachedBranding = unstable_cache(
  (embedId: string) => getEmbedBranding(embedId),
  ['embed-branding-v1'],
  { revalidate: 300 },
);

export async function loadEmbedBranding(embedId: string | null): Promise<EmbedBrandingRecord | null> {
  if (!embedId) return null;
  try {
    return await cachedBranding(embedId);
  } catch {
    return null; // co-branding is progressive enhancement — never break the widget
  }
}

export { headlineReading } from './options';
