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
import { getRiverContext, DEFAULT_TIMEZONE } from '@/lib/rivers/context';
import { buildSecondaryGaugeSemantics } from '@/lib/eddy/condition-semantics';
import { getRiverKnowledgeForGauge } from '@/lib/eddy/knowledge';
import { getLocalDateStrings } from '@/lib/social/local-time';
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
import type { RiverContext } from '@/lib/rivers/context';
import { buildReportFacts, reportFactsPrompt, prepareGeneratedReport, preflightReportFallback, preflightFallbackReason, activeReportFloodAlerts, type ReportFacts } from './report-facts';
import { buildGaugeGenerationRecord, captureModel, type GaugeGenerationCapture, type GenerationResult, type GenerationTrigger } from './generation-record';
import { recordGeneration } from './generation-log';
import { materialOutlookLines } from './material-outlook';
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
  const prompt = buildGaugePrompt(target, facts, readingTimestamp, trajectory, forecast, riverCtx, riverBehaviorApplies);
  capture.trajectory = trajectory;
  capture.forecast = forecast;
  capture.riverBehaviorApplies = riverBehaviorApplies;
  // The same call buildGaugePrompt makes, so the hash is of the text it sent.
  capture.riverKnowledge = getRiverKnowledgeForGauge(target.riverSlug, target.gaugeName, target.usgsSiteId) || null;
  capture.userPrompt = prompt;

  // The resolved model, then its fallback when it has one (see
  // src/lib/ai/attempts.ts). Each attempt that publishes nothing writes its
  // own record under the model that was asked.
  //
  // This workload does not require all three blocks (see PrepareOptions in
  // report-facts.ts for why), so it has no completeness check to lean on. What
  // it does refuse is a response that did not finish, while another model is
  // still waiting to be asked: text cut off at the output cap can end anywhere.
  // From the last model it is published as before.
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
  if (!completion) return null;

  const { rawText } = completion;
  const modelText = completion.result.text;
  // usage.modelUsed is the model that answered, which after a fallback is not
  // the one that was selected.
  const usage = completion.result.usage;
  const stopReason = completion.result.stopReason;

  try {
    const { report, usedFallback, fallbackReason, contradictions } = prepareGeneratedReport(rawText, facts);
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
// Prompt assembly
// ---------------------------------------------------------------------------

const GAUGE_SYSTEM_PROMPT = `You are Eddy, the otter guide in a float trip planning app. You write short, useful updates for SECONDARY river gauges, the ones up- or down-stream of the river's primary gauge.

WHO READS THIS: a floater checking this stretch. The app already shows this gauge's condition badge and reading beside your text, so say what those cannot: what the water is like here and what it means for a floater.

VOICE: A local outfitter talking to a customer. Warm, lively, and a little playful when conditions allow, with the feel of someone who enjoys this river. Use concrete imagery and natural turns of phrase, not forced jokes, otter puns, or stock catchphrases. Keep warnings direct. Plain words, tight, no fluff. Use river terms naturally: put-in, take-out, riffle, gravel bar.

SCOPE: You are commenting on ONE gauge, not the whole river. Name its town once in the summary and once in the full text, weaving it into the condition claim it qualifies rather than making it a required opening. Keep current condition claims to that location. Local river knowledge is background, not evidence of today's scraping, depth or floatability at other places. Never compare raw heights across stations or infer relative trends from snapshots. When the supplied notes say the river changes character above or below this station (a big spring, tributary or dam), make clear this station speaks only for its own stretch. [RIVER KNOWLEDGE] covers the whole river: a detail about the upper river, another town or another section is not a detail about this station. Use what the knowledge says about this station's part of the river, and when it says nothing specific, describe only what the supplied facts support.

OUTPUT FORMAT (strict):
Your response MUST begin with the exact [CLAIMS] line supplied in the authoritative facts. Then write three blocks, each starting with its marker on its own line: [SUMMARY], [EDDY_READ], [FULL]. Use each marker once, as a header only. Output nothing else.

[SUMMARY]
One sentence, under 120 characters, for chips and share cards. Answer "can I float it here, and what will it be like?" in plain words.

[EDDY_READ]
One or two sentences, under 240 characters. Give the local insight: what makes THIS reporting stretch different at this level. When supplied local knowledge supports it, pick one useful detail about its channel, pools, riffles, landmarks, or response to changing water and connect it to the float. A tip such as "travel light" or a restatement of the chart is not a local insight. Describe established local patterns as patterns, not as observations made today. Do not invent a feature, its location, or a cause to make the writing colorful; when local detail is unavailable, stay useful and honest about the supplied facts. Leave out gauge readings. No weather and no forecast here: the app's Weather section owns both. Do not restate the summary. Never invent a future river level.

[FULL]
3 to 5 concise sentences. Each sentence must add useful information; do not pad the report to reach the minimum. Lead with the most useful supported takeaway: what the water is like, a meaningful measured change, or what to do about it. Work the reporting location into the condition claim it qualifies. Include the measured trend only when it adds useful information for the decision. Cite the reading or the optimal range later, only here, and only when it helps.

RULES:
- Prefer the practical meaning over repeating the badge. Name the condition level only when it clarifies the advice. If you do, use the exact capitalized label from the facts, never as a field like "condition: Good". Good is not Flowing; Flowing is the best float level.
- Too Low: not worth floating, recommend waiting for more water; do not assume rain is the source on a dam-controlled river. Low: apply the LOW WATER GUIDANCE from [CONDITION SEMANTICS], not a blanket scraping description. Good: floats fine; use the supplied optimal-range comparison only when useful in [FULL]. Being below optimal does not by itself establish shallow riffles or scraping; those details need local evidence. High: use caution. Dangerous: stay off the water, said first, and postpone the float.
- Describe what the reader will experience, not threshold names. Say "optimal range", never "band", and only in [FULL].
- Default to leaving out "spring-fed" and "rain-fed". A river type in the supplied context is not a reason to mention it. Use either term only when a supplied local detail makes it useful for understanding this stretch at this level; the type label alone is not enough. Local character does not need to explain the cause of today's gauge movement. Never use it as a stock opening or repeat it across the three blocks. Do not substitute a routine explanation about springs or rainfall just to avoid the label; omit that background when it adds nothing.
- Do not invent a cause for an observed change or steady reading. General river character alone does not establish today's cause; qualify a supported possible explanation and omit it when the evidence is insufficient.
- Cite only the readings supplied. Never invent numbers or predict gauge heights.
- Do not describe the weather: no sky, temperature, wind or rain chance, today or ahead. The app's Weather section owns all of it. The days ahead reach you only as an [OUTLOOK] block, and only when rain is likely. Without one, say nothing about the days ahead. With one, say once in [FULL] that rain could change this reading and that it is worth another look, and leave it there.
- Every statement about later days must be conditional (if, should, likely). Never say conditions will stay, remain or be a certain way, and do not call conditions predictable or reliable.
- Describe how unusual a level is in plain words such as "lower than usual for early October". Never print a percentile number or the word percentile.
- AUTHORITATIVE GAUGE FACTS control the condition and the optimal-range comparison. Do not reclassify, mix feet with cfs, or make current condition claims at other locations.
- Do NOT recommend a different river as an alternative.
- Let the strongest supplied fact pick the opening; work the town or landmark into the sentence it qualifies. Give each block a distinct opening without copying an example's sentence frame.
- No em dashes, emojis, hashtags or exclamation marks. No greeting, sign-off or "I".`;

function buildGaugePrompt(
  target: SecondaryGaugeTarget,
  facts: ReportFacts,
  readingTimestamp: string | null,
  trajectory: GaugeTrajectory | null,
  forecast: ForecastData | null,
  riverCtx: RiverContext | null,
  riverBehaviorApplies: boolean,
): string {
  const lines: string[] = [];

  const { dayOfWeek, dateStr } = getLocalDateStrings(riverCtx?.timezone ?? DEFAULT_TIMEZONE);
  lines.push(`Date: ${dayOfWeek}, ${dateStr}`);
  lines.push('');
  lines.push(`Generate a secondary-gauge update for: ${target.gaugeName} on the ${target.riverName}.`);
  // distanceFromSectionMiles is deliberately not in the prompt. It is the
  // gauge's distance from its assigned reach (accuracy warnings), not a river
  // mile, and labelled as one it had Eddy put Eureka "at river mile 5.0 this
  // close to the Missouri confluence".

  lines.push('');
  lines.push('[CONDITION SEMANTICS — how to interpret conditions on THIS river]');
  lines.push(buildSecondaryGaugeSemantics(riverCtx, riverBehaviorApplies));
  const riverKnowledge = getRiverKnowledgeForGauge(target.riverSlug, target.gaugeName, target.usgsSiteId);
  if (riverKnowledge) {
    lines.push('');
    lines.push('[RIVER KNOWLEDGE — about the whole river unless it says "This gauge"; use only what fits this station\'s stretch, do not recite]');
    lines.push(riverKnowledge);
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

  // No weather outlook. The days ahead reach the Read only when rain is likely:
  // see material-outlook.ts.
  const outlook = materialOutlookLines(forecast);
  if (outlook.length) {
    lines.push('');
    lines.push(...outlook);
  }

  return lines.join('\n');
}
