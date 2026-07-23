// src/lib/eddy/generate-gauge-update.ts
// Per-gauge AI commentary using Haiku 4.5. Targeted at secondary gauges on
// active rivers (the primary gauge is covered by the Sonnet-powered
// river-level update in generate-update.ts).
//
// A "secondary" gauge sits up- or down-stream of the primary on the same
// river. Its update is narrower in scope: what does THIS gauge's reading
// tell a paddler about the segment of river around it, and how does it
// compare to the primary reading?

import Anthropic from '@anthropic-ai/sdk';
import type { ConditionCode } from '@/types/api';
import { getRiverContext, DEFAULT_TIMEZONE } from '@/lib/rivers/context';
import { getLocalDateStrings } from '@/lib/social/local-time';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { buildGaugeTrajectoryForSite, type GaugeTrajectory } from '@/lib/eddy/gauge-trajectory';
import { parseEddyResponse, extractUsage, type UsageStats } from '@/lib/eddy/generate-update';
import { toNum } from '@/lib/utils/num';
import { getCoordinates } from '@/lib/api-utils';
import { fetchForecast, getWeatherPointForRiver, type ForecastData } from '@/lib/weather/openweather';
import type { RiverContext } from '@/lib/rivers/context';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const STALE_READING_MS = 2 * 60 * 60 * 1000;

export interface SecondaryGaugeTarget {
  gaugeStationId: string;
  usgsSiteId: string;
  gaugeName: string;
  riverSlug: string;
  riverName: string;
  coordinates: { lat: number; lon: number } | null;
  /** Optional river-mile position for spatial context in the prompt. */
  distanceFromSectionMiles: number | null;
  thresholds: ConditionThresholds;
  /** Snapshot of the river's primary gauge for comparison framing. */
  primary: {
    usgsSiteId: string;
    gaugeName: string;
    gaugeHeightFt: number | null;
    dischargeCfs: number | null;
    conditionCode: ConditionCode;
  } | null;
}

export interface GeneratedGaugeUpdate {
  gaugeStationId: string;
  usgsSiteId: string;
  riverSlug: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  quoteText: string;
  summaryText: string | null;
  eddyRead: string | null;
  sourcesUsed: string[];
  modelUsed: string;
  /** Token usage for this generation (null if the response had none). */
  usage: UsageStats | null;
}

/**
 * Looks up every non-primary river_gauges row whose river is active and
 * whose gauge_station is active. Each returned target carries enough data
 * to drive `generateGaugeUpdate`.
 */
export async function getSecondaryGaugeTargets(): Promise<SecondaryGaugeTarget[]> {
  const supabase = createAdminClient();

  // Pull every river_gauges row on active rivers + active stations.
  // We fetch primaries too so each secondary can be paired with its river's
  // primary for comparison context, then filter primaries out of the result.
  const { data, error } = await supabase
    .from('river_gauges')
    .select(`
      is_primary,
      distance_from_section_miles,
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit,
      rivers!inner (id, slug, name, active),
      gauge_stations!inner (id, name, usgs_site_id, location, active)
    `)
    .eq('rivers.active', true)
    .eq('gauge_stations.active', true);

  if (error || !data) {
    console.error('[GaugeUpdates] Failed to fetch river_gauges:', error);
    return [];
  }

  type Row = {
    is_primary: boolean | null;
    distance_from_section_miles: number | null;
    level_too_low: number | null;
    level_low: number | null;
    level_optimal_min: number | null;
    level_optimal_max: number | null;
    level_high: number | null;
    level_dangerous: number | null;
    threshold_unit: 'ft' | 'cfs' | null;
    rivers: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[];
    gauge_stations: { id: string; name: string; usgs_site_id: string; location: unknown } | { id: string; name: string; usgs_site_id: string; location: unknown }[];
  };

  const rows = data as unknown as Row[];

  // Index primaries by river slug so each secondary can find its sibling.
  const primaryBySlug = new Map<string, { row: Row; reading: { gaugeHeightFt: number | null; dischargeCfs: number | null } | null }>();
  for (const row of rows) {
    if (!row.is_primary) continue;
    const river = Array.isArray(row.rivers) ? row.rivers[0] : row.rivers;
    if (river?.slug) primaryBySlug.set(river.slug, { row, reading: null });
  }

  // Hydrate primary readings in a single batch (DB-first, no live fallback
  // here — the post-cron USGS sync runs hourly).
  const primaryEntries = Array.from(primaryBySlug.entries());
  const primaryStationIds = primaryEntries
    .map(([, entry]) => {
      const s = Array.isArray(entry.row.gauge_stations) ? entry.row.gauge_stations[0] : entry.row.gauge_stations;
      return s?.id;
    })
    .filter((id): id is string => Boolean(id));

  if (primaryStationIds.length > 0) {
    const { data: readings } = await supabase
      .from('gauge_readings')
      .select('gauge_station_id, gauge_height_ft, discharge_cfs, reading_timestamp')
      .in('gauge_station_id', primaryStationIds)
      .order('reading_timestamp', { ascending: false });

    if (readings) {
      const latestByStation = new Map<string, { gauge_height_ft: number | null; discharge_cfs: number | null }>();
      for (const r of readings) {
        if (!latestByStation.has(r.gauge_station_id)) {
          latestByStation.set(r.gauge_station_id, {
            gauge_height_ft: r.gauge_height_ft,
            discharge_cfs: r.discharge_cfs,
          });
        }
      }
      for (const [slug, entry] of primaryEntries) {
        const station = Array.isArray(entry.row.gauge_stations) ? entry.row.gauge_stations[0] : entry.row.gauge_stations;
        const latest = latestByStation.get(station.id);
        if (latest) {
          primaryBySlug.set(slug, {
            row: entry.row,
            reading: { gaugeHeightFt: toNum(latest.gauge_height_ft), dischargeCfs: toNum(latest.discharge_cfs) },
          });
        }
      }
    }
  }

  const targets: SecondaryGaugeTarget[] = [];

  for (const row of rows) {
    if (row.is_primary) continue;

    const river = Array.isArray(row.rivers) ? row.rivers[0] : row.rivers;
    const station = Array.isArray(row.gauge_stations) ? row.gauge_stations[0] : row.gauge_stations;
    if (!river || !station?.usgs_site_id) continue;

    const thresholds: ConditionThresholds = {
      levelTooLow: row.level_too_low,
      levelLow: row.level_low,
      levelOptimalMin: row.level_optimal_min,
      levelOptimalMax: row.level_optimal_max,
      levelHigh: row.level_high,
      levelDangerous: row.level_dangerous,
      thresholdUnit: row.threshold_unit ?? 'ft',
    };

    // Build primary snapshot if available.
    let primary: SecondaryGaugeTarget['primary'] = null;
    const primaryEntry = primaryBySlug.get(river.slug);
    if (primaryEntry) {
      const primaryStation = Array.isArray(primaryEntry.row.gauge_stations) ? primaryEntry.row.gauge_stations[0] : primaryEntry.row.gauge_stations;
      const primaryThresholds: ConditionThresholds = {
        levelTooLow: primaryEntry.row.level_too_low,
        levelLow: primaryEntry.row.level_low,
        levelOptimalMin: primaryEntry.row.level_optimal_min,
        levelOptimalMax: primaryEntry.row.level_optimal_max,
        levelHigh: primaryEntry.row.level_high,
        levelDangerous: primaryEntry.row.level_dangerous,
        thresholdUnit: primaryEntry.row.threshold_unit ?? 'ft',
      };
      const primaryCondition = computeCondition(
        primaryEntry.reading?.gaugeHeightFt ?? null,
        primaryThresholds,
        primaryEntry.reading?.dischargeCfs ?? null,
      );
      primary = {
        usgsSiteId: primaryStation.usgs_site_id,
        gaugeName: primaryStation.name,
        gaugeHeightFt: primaryEntry.reading?.gaugeHeightFt ?? null,
        dischargeCfs: primaryEntry.reading?.dischargeCfs ?? null,
        conditionCode: primaryCondition.code as ConditionCode,
      };
    }

    targets.push({
      gaugeStationId: station.id,
      usgsSiteId: station.usgs_site_id,
      gaugeName: station.name,
      riverSlug: river.slug,
      riverName: river.name,
      coordinates: (() => {
        const point = getCoordinates(station.location);
        return point ? { lat: point.lat, lon: point.lng } : null;
      })(),
      distanceFromSectionMiles: toNum(row.distance_from_section_miles),
      thresholds,
      primary,
    });
  }

  return targets;
}

/**
 * Generates a single per-gauge Eddy update via Haiku.
 * Returns null if a fatal error occurs (caller should treat as skip).
 */
export async function generateGaugeUpdate(target: SecondaryGaugeTarget): Promise<GeneratedGaugeUpdate | null> {
  const sourcesUsed: string[] = [];
  const supabase = createAdminClient();

  // 1. Fetch this gauge's latest reading (DB first, live fallback if stale).
  const { data: dbReading } = await supabase
    .from('gauge_readings')
    .select('gauge_height_ft, discharge_cfs, reading_timestamp')
    .eq('gauge_station_id', target.gaugeStationId)
    .order('reading_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  let gaugeHeightFt = toNum(dbReading?.gauge_height_ft);
  let dischargeCfs = toNum(dbReading?.discharge_cfs);
  let readingTimestamp = dbReading?.reading_timestamp ?? null;

  const ageMs = readingTimestamp ? Date.now() - new Date(readingTimestamp).getTime() : Infinity;
  if (ageMs > STALE_READING_MS) {
    try {
      const live = (await fetchGaugeReadings([target.usgsSiteId], { skipCache: true }))[0];
      if (live) {
        if (live.gaugeHeightFt != null) gaugeHeightFt = live.gaugeHeightFt;
        if (live.dischargeCfs != null) dischargeCfs = live.dischargeCfs;
        if (live.readingTimestamp) readingTimestamp = live.readingTimestamp;
      }
    } catch (e) {
      console.warn(`[GaugeUpdates] Live USGS fetch failed for ${target.usgsSiteId}:`, e);
    }
  }
  if (gaugeHeightFt != null || dischargeCfs != null) sourcesUsed.push('USGS gauge');

  // 2. Compute condition.
  const condition = computeCondition(gaugeHeightFt, target.thresholds, dischargeCfs);
  const conditionCode = condition.code as ConditionCode;

  // 3. Trajectory (10d + percentile).
  let trajectory: GaugeTrajectory | null = null;
  try {
    trajectory = await buildGaugeTrajectoryForSite(target.usgsSiteId);
    if (trajectory) sourcesUsed.push('gauge trajectory');
  } catch (e) {
    console.warn(`[GaugeUpdates] Trajectory failed for ${target.usgsSiteId}:`, e);
  }

  // 4. Add local weather and hydrology context, then call Haiku. This uses
  // the selected gauge point when available and the river weather point as a
  // fallback. Next's fetch cache prevents duplicate upstream weather calls.
  const riverCtx = await getRiverContext(target.riverSlug);
  let forecast: ForecastData | null = null;
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (apiKey) {
    try {
      const fallbackPoint = target.coordinates ? null : await getWeatherPointForRiver(target.riverSlug);
      const lat = target.coordinates?.lat ?? fallbackPoint?.lat;
      const lon = target.coordinates?.lon ?? fallbackPoint?.lon;
      if (lat != null && lon != null) {
        forecast = await fetchForecast(lat, lon, apiKey);
        sourcesUsed.push('OpenWeather forecast');
      }
    } catch (e) {
      console.warn(`[GaugeUpdates] Forecast failed for ${target.usgsSiteId}:`, e);
    }
  }
  const prompt = buildGaugePrompt(target, gaugeHeightFt, dischargeCfs, conditionCode, readingTimestamp, trajectory, forecast, riverCtx);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('[GaugeUpdates] ANTHROPIC_API_KEY not configured');
    return null;
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
      system: GAUGE_SYSTEM_PROMPT,
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const rawText = textBlock?.text?.trim().replace(/—/g, ',') ?? null;
    if (!rawText) {
      console.error(`[GaugeUpdates] Empty Haiku response for ${target.usgsSiteId}`);
      return null;
    }

    const { summaryText, eddyRead, quoteText } = parseEddyResponse(rawText);
    const cleanMarkers = (t: string) => t.replace(/\[(?:FULL|SUMMARY|EDDY_READ)\]/gi, '').trim();

    return {
      gaugeStationId: target.gaugeStationId,
      usgsSiteId: target.usgsSiteId,
      riverSlug: target.riverSlug,
      conditionCode,
      gaugeHeightFt,
      dischargeCfs,
      quoteText: cleanMarkers(quoteText),
      summaryText: summaryText ? cleanMarkers(summaryText) : null,
      eddyRead: eddyRead ? cleanMarkers(eddyRead) : null,
      sourcesUsed,
      modelUsed: HAIKU_MODEL,
      usage: extractUsage(HAIKU_MODEL, message.usage),
    };
  } catch (e) {
    console.error(`[GaugeUpdates] Haiku call failed for ${target.usgsSiteId}:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

const GAUGE_SYSTEM_PROMPT = `You are Eddy, an AI otter mascot for a float trip planning app. You write short, useful updates for SECONDARY river gauges, the ones up- or down-stream of the river's primary gauge.

VOICE: Friendly, local-outfitter tone. Tight, no fluff. Use river terminology naturally: put-in, take-out, gauge, riffle, gravel bar.

SCOPE: You are commenting on ONE gauge, not the whole river. Focus on what this specific reading means for the segment of river around it. When a primary-gauge snapshot is provided, frame this gauge in comparison: "running slightly higher than the primary," "tracking with the main gauge," "lagging behind upstream," etc. The primary gauge is the canonical reading for the river; your job is to add segment-level color, not contradict it.

OUTPUT FORMAT (strict):
Your response MUST contain exactly three labeled blocks. Use the markers [SUMMARY], [EDDY_READ], and [FULL] on their own lines, each followed by the text for that section. No other formatting, labels, or wrapping. Do NOT repeat the markers anywhere else.

[SUMMARY]
A single sentence, under 120 characters. For chips and share cards.

[EDDY_READ]
One or two concise sentences, under 240 characters total. Explain the useful local meaning of this gauge's condition, trajectory, river behavior, and forecast. Add interpretation beyond the displayed values. Do not repeat exact readings, temperatures, or precipitation percentages. Never invent a future river level.

[FULL]
3-5 sentences. Pick the 2-3 most important points. Do not exceed 5 sentences.

RULES:
- State the condition clearly in the first sentence.
- Cite the actual reading; never invent numbers or predict gauge heights.
- For "low": floatable, expect scraping. For "too_low": recommend waiting. For "high": use caution. For "dangerous": stay off the water.
- When a primary-gauge snapshot is provided, draw a clean comparison in one sentence. Don't lecture, just place this gauge in context.
- Do NOT recommend a different river as an alternative.
- Do NOT use em dashes, emojis, hashtags, or exclamation marks.
- Do NOT greet, sign off, or refer to yourself.
- Output ONLY the [SUMMARY], [EDDY_READ], and [FULL] blocks.`;

function buildGaugePrompt(
  target: SecondaryGaugeTarget,
  gaugeHeightFt: number | null,
  dischargeCfs: number | null,
  conditionCode: ConditionCode,
  readingTimestamp: string | null,
  trajectory: GaugeTrajectory | null,
  forecast: ForecastData | null,
  riverCtx: RiverContext | null,
): string {
  const lines: string[] = [];

  const { dayOfWeek, dateStr } = getLocalDateStrings(riverCtx?.timezone ?? DEFAULT_TIMEZONE);
  lines.push(`Date: ${dayOfWeek}, ${dateStr}`);
  lines.push('');
  lines.push(`Generate a secondary-gauge update for: ${target.gaugeName} on the ${target.riverName}.`);
  if (target.distanceFromSectionMiles != null) {
    lines.push(`Position: river mile ${target.distanceFromSectionMiles.toFixed(1)} downstream.`);
  }

  lines.push('');
  lines.push('[THIS GAUGE]');
  lines.push(`Height: ${gaugeHeightFt != null ? gaugeHeightFt.toFixed(1) + ' ft' : 'unavailable'}`);
  if (dischargeCfs != null) lines.push(`Discharge: ${dischargeCfs.toLocaleString()} cfs`);
  lines.push(`Condition: ${conditionCode}`);
  const t = target.thresholds;
  if (t.levelOptimalMin != null && t.levelOptimalMax != null) {
    lines.push(`Optimal: ${t.levelOptimalMin}-${t.levelOptimalMax} ${t.thresholdUnit ?? 'ft'}`);
  }
  if (readingTimestamp) {
    const ageHours = (Date.now() - new Date(readingTimestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 6) {
      lines.push(`WARNING: Reading is ${Math.round(ageHours)} hours old, data may be stale.`);
    }
  }

  if (target.primary && target.primary.usgsSiteId !== target.usgsSiteId) {
    lines.push('');
    lines.push('[PRIMARY GAUGE on the same river, for comparison]');
    lines.push(`Name: ${target.primary.gaugeName}`);
    if (target.primary.gaugeHeightFt != null) lines.push(`Height: ${target.primary.gaugeHeightFt.toFixed(1)} ft`);
    if (target.primary.dischargeCfs != null) lines.push(`Discharge: ${target.primary.dischargeCfs.toLocaleString()} cfs`);
    lines.push(`Condition: ${target.primary.conditionCode}`);
  }

  if (trajectory) {
    lines.push('');
    lines.push('[TRAJECTORY]');
    if (trajectory.change24h != null) {
      const sign = trajectory.change24h >= 0 ? '+' : '';
      lines.push(`24h change: ${sign}${trajectory.change24h.toFixed(1)} ft`);
    }
    if (trajectory.change6h != null) {
      const sign = trajectory.change6h >= 0 ? '+' : '';
      lines.push(`6h change: ${sign}${trajectory.change6h.toFixed(1)} ft`);
    }
    if (trajectory.rateFtPerHour != null && trajectory.acceleration) {
      lines.push(`Rate: ${trajectory.acceleration} at ${Math.abs(trajectory.rateFtPerHour).toFixed(2)} ft/hr`);
    }
    if (trajectory.narrative) lines.push(`Summary: ${trajectory.narrative}`);
    if (trajectory.percentileContext) lines.push(`Context: ${trajectory.percentileContext}`);
  }

  if (forecast?.days?.length) {
    lines.push('');
    lines.push('[3-DAY WEATHER OUTLOOK]');
    for (const day of forecast.days.slice(0, 3)) {
      lines.push(`${day.dayOfWeek}: ${day.condition}, ${day.tempLow}-${day.tempHigh}°F, ${day.precipitation}% rain`);
    }
  }

  const characteristics = riverCtx?.characteristics;
  if (characteristics) {
    const behavior = [
      characteristics.riverNote,
      characteristics.lowWaterMeaning,
      characteristics.risingWaterHazards,
      characteristics.rainLagNote,
    ].filter((value): value is string => Boolean(value));
    if (behavior.length > 0) {
      lines.push('');
      lines.push('[LOCAL RIVER BEHAVIOR — use for interpretation, do not recite]');
      lines.push(...behavior);
    }
  }

  return lines.join('\n');
}
