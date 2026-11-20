// src/lib/eddy/generate-gauge-update.ts
// Per-gauge AI commentary, on the model selected for secondary gauge updates
// (Haiku 4.5 unless changed). Targeted at secondary gauges on active rivers
// (the primary gauge is covered by the river-level update in
// generate-update.ts).
//
// A "secondary" gauge sits up- or down-stream of the primary on the same
// river. Its update is narrower in scope: what does THIS gauge's reading
// tell a paddler about the segment of river around it?

import { fetchNWSAlerts, filterAlertsForRiver, type NWSAlert } from '@/lib/nws/alerts';
import { generateText, MissingApiKeyError, type TextResult } from '@/lib/ai/generate-text';
import { tryModels } from '@/lib/ai/attempts';
import type { ConditionCode } from '@/types/api';
import { getRiverContext } from '@/lib/rivers/context';
import { getRiverKnowledgeForGauge } from '@/lib/eddy/knowledge';
import { createAdminClient } from '@/lib/supabase/admin';
import { linkFloodStageFt } from '@/lib/gauges/flood-stages';
import type { ConditionThresholds } from '@/lib/conditions';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { buildGaugeTrajectoryForSite, type GaugeTrajectory } from '@/lib/eddy/gauge-trajectory';
import type { UsageStats } from '@/lib/ai/usage';
import { stripEddyMarkers, replaceEmDashes } from '@/lib/eddy/parse-response';
import { toNum } from '@/lib/utils/num';
import { getCoordinates } from '@/lib/api-utils';
import { fetchForecast, getWeatherPointForRiver, type ForecastData } from '@/lib/weather/openweather';
import { buildReportFacts, factualReportFallback, prepareGeneratedReport, preflightReportFallback, preflightFallbackReason, activeReportFloodAlerts } from './report-facts';
import { buildGaugeGenerationRecord, captureModel, type GaugeGenerationCapture, type GenerationResult, type GenerationTrigger } from './generation-record';
import { recordGeneration } from './generation-log';
import type { ResolvedModel } from '@/lib/ai/resolve-models';
import { GAUGE_READ_BRIEF } from './read-brief';
import { buildGaugePrompt } from './build-gauge-prompt';

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
      gauge_stations!inner (id, name, usgs_site_id, provider, location, active, nwps_flood_stage_ft)
    `)
    .or('is_primary.eq.false,is_primary.is.null')
    .eq('rivers.active', true)
    .eq('gauge_stations.active', true)
    // USGS-provided stations only. A USACE dam row has a null usgs_site_id and
    // would reach the Haiku prompt with no site id; more importantly, the
    // prompt is written to interpret a river gauge, and a dam release is an
    // operator's decision rather than something the watershed is doing.
    // Dams have their own Read, written in code from the turbine record;
    // see generate-dam-update.ts and ADR 0017.
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
      floodStageFt: linkFloodStageFt(row),
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
 *
 * Every way out of this function writes one generation record first, including
 * the ones that return null: see generation-record.ts. `trigger` is required
 * so a new caller has to say what started it.
 */
export async function generateGaugeUpdate(
  target: SecondaryGaugeTarget,
  model: ResolvedModel,
  options: { trigger: GenerationTrigger },
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

  // What this attempt was handed. Later steps fill in the rest, so an early
  // exit records what it had reached.
  const capture: GaugeGenerationCapture = {
    target: {
      riverSlug: target.riverSlug,
      riverName: target.riverName,
      usgsSiteId: target.usgsSiteId,
      gaugeName: target.gaugeName,
      coordinates: target.coordinates,
    },
    trigger: options.trigger,
    model: captureModel(model),
    facts,
    readingTimestamp,
    alerts,
    forecast: null,
    trajectory: null,
    riverBehaviorApplies: null,
    riverKnowledge: null,
    systemPrompt: GAUGE_SYSTEM_PROMPT,
    userPrompt: null,
  };
  const record = (result: GenerationResult) =>
    recordGeneration(buildGaugeGenerationRecord(capture, result, { gitSha: process.env.VERCEL_GIT_COMMIT_SHA }));

  const fallback = preflightReportFallback(facts);
  if (fallback) await record({
    outcome: 'fallback',
    reason: preflightFallbackReason(facts),
    published: { ...fallback, sourcesUsed },
  });
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
  // A station is not resolved to a reach here. If any reach overrides the
  // river type (e.g. the Black below Clearwater), omit ALL river-wide behavior.
  // Failed or unavailable section checks must also use neutral guidance.
  let riverBehaviorApplies = false;
  if (riverCtx) {
    try {
      const { data: overrides, error } = await supabase
        .from('river_sections')
        .select('id')
        .eq('river_id', riverCtx.id)
        .not('river_type', 'is', null)
        .limit(1);
      riverBehaviorApplies = !error && overrides != null && overrides.length === 0;
      if (error) console.warn('[GaugeUpdates] Section hydrology check failed:', error);
    } catch (e) {
      console.warn('[GaugeUpdates] Section hydrology check failed:', e);
    }
  }
  // Selected once, so the text recorded is the text sent.
  const riverKnowledge = getRiverKnowledgeForGauge(target.riverSlug, target.gaugeName, target.usgsSiteId);
  const prompt = buildGaugePrompt({ target, facts, readingTimestamp, trajectory, forecast, riverCtx, riverBehaviorApplies, riverKnowledge });
  capture.trajectory = trajectory;
  capture.forecast = forecast;
  capture.riverBehaviorApplies = riverBehaviorApplies;
  capture.riverKnowledge = riverKnowledge || null;
  capture.userPrompt = prompt;

  // The resolved model, then its fallback when it has one (see
  // src/lib/ai/attempts.ts). Each attempt that publishes nothing writes its
  // own record under the model that was asked.
  //
  // This workload does not require all three blocks (see PrepareOptions in
  // report-facts.ts for why). What it does refuse is a response that did not
  // finish: text cut off at the output cap can end anywhere. While another
  // model is still waiting it is a failed attempt; from the last model the
  // guard replaces it with the code-written report.
  const completion = await tryModels<{ result: TextResult; rawText: string }>(
    model,
    async ({ model: attempt, hasNext }) => {
      capture.model = captureModel(attempt);
      const result = await generateText({
        feature: 'gauge_update',
        model: attempt,
        system: GAUGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });
      // The record keeps result.text exactly as returned; the cleanup is not
      // part of the evidence.
      const rawText = result.text ? replaceEmDashes(result.text.trim()) || null : null;
      if (rawText && (result.finished || !hasNext)) return { result, rawText };

      if (rawText) {
        console.error(`[GaugeUpdates] Unfinished ${attempt.id} response for ${target.usgsSiteId} (${result.stopReason})`);
        await record({ outcome: 'error', reason: 'incomplete_response', rawResponse: result.text, stopReason: result.stopReason, usage: result.usage });
      } else {
        console.error(`[GaugeUpdates] Empty ${attempt.id} response for ${target.usgsSiteId}`);
        await record({ outcome: 'error', reason: 'empty_response', rawResponse: result.text, stopReason: result.stopReason, usage: result.usage });
      }
      return null;
    },
    async (attempt, e) => {
      if (e instanceof MissingApiKeyError) {
        console.error(`[GaugeUpdates] ${e.message}`);
        await record({ outcome: 'error', reason: 'missing_api_key' });
      } else {
        console.error(`[GaugeUpdates] ${attempt.id} call failed for ${target.usgsSiteId}:`, e);
        await record({ outcome: 'error', reason: 'model_error', errorMessage: e instanceof Error ? e.message : String(e) });
      }
    },
  );
  if (!completion) {
    // Every model was asked and none answered (each attempt above wrote its
    // own error row). Publish the code-written report from the facts already
    // gathered, so an outage leaves this gauge a factual Read rather than
    // none once its previous row expires.
    const report = factualReportFallback(facts);
    const update: GeneratedGaugeUpdate = {
      gaugeStationId: target.gaugeStationId,
      usgsSiteId: target.usgsSiteId,
      riverSlug: target.riverSlug,
      conditionCode,
      gaugeHeightFt,
      dischargeCfs,
      ...report,
      sourcesUsed: sourcesUsed.filter(source => ['USGS gauge', 'NWS alerts'].includes(source)),
      usage: null,
    };
    await record({
      outcome: 'fallback',
      reason: 'no_model_response',
      published: { summaryText: update.summaryText, eddyRead: update.eddyRead, quoteText: update.quoteText, sourcesUsed: update.sourcesUsed },
    });
    return update;
  }

  const { rawText } = completion;
  const modelText = completion.result.text;
  // usage.modelUsed is the model that answered, which after a fallback is not
  // the one that was selected.
  const usage = completion.result.usage;
  const stopReason = completion.result.stopReason;

  try {
    const { report, usedFallback, fallbackReason, contradictions } = prepareGeneratedReport(rawText, facts, { finished: completion.result.finished, requireAllBlocks: false });
    const { summaryText, eddyRead, quoteText } = report;
    const publishedSources = !usedFallback ? sourcesUsed
      : sourcesUsed.filter(source => ['USGS gauge', 'NWS alerts'].includes(source));

    const update: GeneratedGaugeUpdate = {
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
      usage,
    };
    await record({
      outcome: usedFallback ? 'fallback' : 'model',
      reason: fallbackReason,
      contradictions,
      rawResponse: modelText,
      stopReason,
      usage,
      published: {
        summaryText: update.summaryText,
        eddyRead: update.eddyRead,
        quoteText: update.quoteText,
        sourcesUsed: update.sourcesUsed,
      },
    });
    return update;
  } catch (e) {
    console.error(`[GaugeUpdates] Preparing the ${usage.modelUsed} report failed for ${target.usgsSiteId}:`, e);
    await record({ outcome: 'error', reason: 'model_error', rawResponse: modelText, stopReason, usage, errorMessage: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

// The shared Read brief, in its secondary-gauge form: see read-brief.ts. The
// user message is assembled in build-gauge-prompt.ts, which is pure so the
// admin test panel can rebuild a recorded morning's message with it.
const GAUGE_SYSTEM_PROMPT = GAUGE_READ_BRIEF;

/** The gauge Read's system prompt, for the test panel's replay. */
export { GAUGE_SYSTEM_PROMPT };
