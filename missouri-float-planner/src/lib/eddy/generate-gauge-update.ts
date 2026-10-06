// src/lib/eddy/generate-gauge-update.ts
// Per-gauge AI commentary using Haiku 4.5. Targeted at secondary gauges on
// active rivers (the primary gauge is covered by the Sonnet-powered
// river-level update in generate-update.ts).
//
// A "secondary" gauge sits up- or down-stream of the primary on the same
// river. Its update is narrower in scope: what does THIS gauge's reading
// tell a paddler about the segment of river around it?

import { fetchNWSAlerts, filterAlertsForRiver, type NWSAlert } from '@/lib/nws/alerts';
import { trackedAnthropic } from '@/lib/telemetry/upstream';
import Anthropic from '@anthropic-ai/sdk';
import type { ConditionCode } from '@/types/api';
import { getRiverContext, DEFAULT_TIMEZONE } from '@/lib/rivers/context';
import { getLocalDateStrings } from '@/lib/social/local-time';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConditionThresholds } from '@/lib/conditions';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { buildGaugeTrajectoryForSite, type GaugeTrajectory } from '@/lib/eddy/gauge-trajectory';
import { extractUsage, type UsageStats } from '@/lib/eddy/generate-update';
import { stripEddyMarkers } from '@/lib/eddy/parse-response';
import { toNum } from '@/lib/utils/num';
import { getCoordinates } from '@/lib/api-utils';
import { fetchForecast, getWeatherPointForRiver, type ForecastData } from '@/lib/weather/openweather';
import type { RiverContext } from '@/lib/rivers/context';
import { buildReportFacts, reportFactsPrompt, prepareGeneratedReport, preflightReportFallback, activeReportFloodAlerts, type ReportFacts } from './report-facts';
import type { ResolvedModel } from '@/lib/ai/resolve-models';

// The model is resolved once per pass from llm_config and threaded in, so a
// switch cannot split one run across two models. See src/lib/ai/resolve-models.ts.
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
  // No `modelUsed` here. It was set but never persisted — both insert sites
  // spread usageColumns(update.usage), which sources model_used from
  // usage.modelUsed. One field, one writer.
  /** Token usage + model for this generation (null if the response had none). */
  usage: UsageStats | null;
}

/**
 * Looks up every non-primary river_gauges row whose river is active and
 * whose gauge_station is active. Each returned target carries enough data
 * to drive `generateGaugeUpdate`.
 */
export async function getSecondaryGaugeTargets(): Promise<SecondaryGaugeTarget[]> {
  const supabase = createAdminClient();

  // Pull only non-primary gauges on active rivers and active stations.
  const { data, error } = await supabase
    .from('river_gauges')
    .select(`
      is_primary,
      distance_from_section_miles,
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit, flood_stage_ft,
      rivers!inner (id, slug, name, active),
      gauge_stations!inner (id, name, usgs_site_id, provider, location, active)
    `)
    .or('is_primary.eq.false,is_primary.is.null')
    .eq('rivers.active', true)
    .eq('gauge_stations.active', true)
    // USGS-provided stations only. A USACE dam row has a null usgs_site_id and
    // would reach the Haiku prompt with no site id; more importantly, the
    // prompt is written to interpret a river gauge, and a dam release is an
    // operator's decision rather than something the watershed is doing.
    // Revisit when dam context is deliberately added to the prompt.
    .eq('gauge_stations.provider', 'usgs');

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
    flood_stage_ft: number | null;
    rivers: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[];
    gauge_stations: { id: string; name: string; usgs_site_id: string; location: unknown } | { id: string; name: string; usgs_site_id: string; location: unknown }[];
  };

  const rows = data as unknown as Row[];

  const targets: SecondaryGaugeTarget[] = [];

  for (const row of rows) {
    const river = Array.isArray(row.rivers) ? row.rivers[0] : row.rivers;
    const station = Array.isArray(row.gauge_stations) ? row.gauge_stations[0] : row.gauge_stations;
    if (!river || !station?.usgs_site_id) continue;

    const thresholds: ConditionThresholds = {
      levelTooLow: toNum(row.level_too_low),
      levelLow: toNum(row.level_low),
      levelOptimalMin: toNum(row.level_optimal_min),
      levelOptimalMax: toNum(row.level_optimal_max),
      levelHigh: toNum(row.level_high),
      levelDangerous: toNum(row.level_dangerous),
      thresholdUnit: row.threshold_unit ?? 'ft',
      floodStageFt: toNum(row.flood_stage_ft),
    };

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
    });
  }

  return targets;
}

/**
 * Generates a single per-gauge Eddy update.
 * Returns null if a fatal error occurs (caller should treat as skip).
 *
 * `model` is resolved once per pass by the caller rather than looked up here,
 * so every row a pass writes provably shares one model.
 */
export async function generateGaugeUpdate(
  target: SecondaryGaugeTarget,
  model: ResolvedModel,
): Promise<GeneratedGaugeUpdate | null> {
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

  // Alerts must survive both unavailable-gauge and post-validation fallbacks.
  const riverCtx = await getRiverContext(target.riverSlug);
  let alerts: NWSAlert[] = [];
  try {
    alerts = activeReportFloodAlerts(filterAlertsForRiver(
      await fetchNWSAlerts(riverCtx?.state ?? 'MO'), target.riverSlug, riverCtx?.alertSearchTerms,
    ));
    if (alerts.length) sourcesUsed.push('NWS alerts');
  } catch (e) {
    console.warn('[GaugeUpdates] NWS alert fetch failed:', e);
  }

  // 2. Compute condition.
  const facts = buildReportFacts({ gaugeName: target.gaugeName, gaugeHeightFt, dischargeCfs, thresholds: target.thresholds, floodAlerts: alerts });
  const conditionCode = facts.conditionCode;

  const fallback = preflightReportFallback(facts);
  if (fallback) return {
    gaugeStationId: target.gaugeStationId,
    usgsSiteId: target.usgsSiteId,
    riverSlug: target.riverSlug,
    conditionCode,
    gaugeHeightFt,
    dischargeCfs,
    ...fallback,
    sourcesUsed,
    usage: null,
  };

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
  const prompt = buildGaugePrompt(target, facts, readingTimestamp, trajectory, forecast, riverCtx);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('[GaugeUpdates] ANTHROPIC_API_KEY not configured');
    return null;
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await trackedAnthropic('gauge_update', model.id, () => client.messages.create({
      model: model.id,
      max_tokens: model.maxTokens,
      // Omitted entirely unless the model needs it. Sonnet 5 thinks by default
      // and would spend max_tokens doing it; Haiku 4.5 and Sonnet 4.6 do not.
      ...(model.thinking ? { thinking: model.thinking } : {}),
      messages: [{ role: 'user', content: prompt }],
      system: GAUGE_SYSTEM_PROMPT,
    }));

    const textBlock = message.content.find((b) => b.type === 'text');
    const rawText = textBlock?.text?.trim().replace(/—/g, ',') ?? null;
    if (!rawText) {
      console.error(`[GaugeUpdates] Empty ${model.id} response for ${target.usgsSiteId}`);
      return null;
    }

    const { report, usedFallback } = prepareGeneratedReport(rawText, facts);
    const { summaryText, eddyRead, quoteText } = report;
    const publishedSources = !usedFallback ? sourcesUsed
      : sourcesUsed.filter(source => ['USGS gauge', 'NWS alerts'].includes(source));

    return {
      gaugeStationId: target.gaugeStationId,
      usgsSiteId: target.usgsSiteId,
      riverSlug: target.riverSlug,
      conditionCode,
      gaugeHeightFt,
      dischargeCfs,
      quoteText: stripEddyMarkers(quoteText),
      summaryText: summaryText ? stripEddyMarkers(summaryText) : null,
      eddyRead: eddyRead ? stripEddyMarkers(eddyRead) : null,
      sourcesUsed: publishedSources,
      usage: extractUsage(model.id, message.usage),
    };
  } catch (e) {
    console.error(`[GaugeUpdates] ${model.id} call failed for ${target.usgsSiteId}:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

const GAUGE_SYSTEM_PROMPT = `You are Eddy, an AI otter mascot for a float trip planning app. You write short, useful updates for SECONDARY river gauges, the ones up- or down-stream of the river's primary gauge.

VOICE: Friendly, local-outfitter tone. Tight, no fluff. Use river terminology naturally: put-in, take-out, gauge, riffle, gravel bar.

SCOPE: You are commenting on ONE gauge, not the whole river. Name that station and limit current condition claims to its supported location. Local river knowledge is background, not evidence of today's scraping, depth or floatability at other places. Never compare raw heights across stations or infer relative trends from snapshots.

OUTPUT FORMAT (strict):
Your response MUST begin with the exact [CLAIMS] line supplied in the authoritative facts, followed by exactly three labeled blocks. Use the markers [SUMMARY], [EDDY_READ], and [FULL] on their own lines, each followed by the text for that section. No other formatting, labels, or wrapping. Do NOT repeat the markers anywhere else.

[SUMMARY]
A single sentence, under 120 characters. For chips and share cards.

[EDDY_READ]
One or two concise sentences, under 240 characters total. Explain the useful local meaning of this gauge's condition, trajectory, river behavior, and forecast. Add interpretation beyond the displayed values. Do not repeat exact readings, temperatures, or precipitation percentages. Never invent a future river level.

[FULL]
3-5 sentences. Pick the 2-3 most important points. Do not exceed 5 sentences.

RULES:
- State this gauge's condition in the summary, using the computed condition and band comparison exactly.
- Cite only the readings supplied. Never invent numbers or predict gauge heights.
- Every statement about later days must be conditional (if, should, likely). Never state that conditions will stay, remain or be a certain way, and do not call conditions predictable or reliable.
- Describe percentile context in plain words such as "lower than usual for early October". Never print a percentile number or the word percentile.
- In prose, call the optimal range the optimal range, never a band.
- For "low": floatable, expect scraping. For "too_low": recommend waiting. For "high": use caution. For "dangerous": stay off the water.
- AUTHORITATIVE GAUGE FACTS control the condition and optimal-band comparison. Good is not Flowing. Do not reclassify, mix feet with cfs, or make current condition claims at other locations.
- Do NOT recommend a different river as an alternative.
- Do NOT use em dashes, emojis, hashtags, or exclamation marks.
- Do NOT greet, sign off, or refer to yourself.
- Output ONLY the supplied [CLAIMS] line and the [SUMMARY], [EDDY_READ], and [FULL] blocks.`;

function buildGaugePrompt(
  target: SecondaryGaugeTarget,
  facts: ReportFacts,
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
  lines.push(reportFactsPrompt(facts));
  if (readingTimestamp) {
    const ageHours = (Date.now() - new Date(readingTimestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 6) {
      lines.push(`WARNING: Reading is ${Math.round(ageHours)} hours old, data may be stale.`);
    }
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
