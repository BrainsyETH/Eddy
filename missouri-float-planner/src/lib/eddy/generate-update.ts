// src/lib/eddy/generate-update.ts
// Orchestrates data gathering and calls the configured model to generate Eddy updates.
// Used by the cron job to produce per-river (or per-section) condition quotes.

import { generateText, MissingApiKeyError, type TextResult } from '@/lib/ai/generate-text';
import type { ConditionCode } from '@/types/api';
import { RIVER_NOTES } from '@/data/eddy-quotes';
import type { UpdateTarget } from '@/data/river-sections';
import { fetchNWSAlerts, filterAlertsForRiver, type NWSAlert } from '@/lib/nws/alerts';
import { fetchWeather, fetchForecast, getWeatherPointForRiver, type WeatherData, type ForecastData } from '@/lib/weather/openweather';
import { fetchPrecipitationFromWeather, buildWeatherSummary, type PrecipitationSummary, type WeatherSummary } from '@/lib/weather/openweather';
import { getKnowledgeForTarget } from '@/lib/eddy/knowledge';
import { buildGaugeTrajectoryForSite } from '@/lib/eddy/gauge-trajectory';
import { getGaugeConditions } from '@/lib/gauge/get-gauge-conditions';
import { getRiverContext } from '@/lib/rivers/context';
import { parseEddyResponse, stripEddyMarkers, replaceEmDashes } from '@/lib/eddy/parse-response';
import { RIVER_TYPE_GUIDANCE, buildConditionSemantics } from '@/lib/eddy/condition-semantics';
import { buildReportFacts, factualReportFallback, prepareGeneratedReport, preflightReportFallback, preflightFallbackReason, activeReportFloodAlerts, type PreparedReport, type ReportFacts } from './report-facts';
import { buildGenerationRecord, captureModel, type GenerationCapture, type GenerationResult, type GenerationTrigger } from './generation-record';
import { recordGeneration } from './generation-log';
import type { ResolvedModel } from '@/lib/ai/resolve-models';
import { tryModels } from '@/lib/ai/attempts';
import type { UsageStats } from '@/lib/ai/usage';
import { RIVER_READ_BRIEF } from '@/lib/eddy/read-brief';


import { buildPrompt, type GaugeContext } from './build-update-prompt';
export { buildPrompt, type GaugeContext } from './build-update-prompt';

// The model is no longer a constant here. It is resolved once per pass from
// llm_config and threaded in, so a switch cannot split one run across two
// models. See src/lib/ai/resolve-models.ts.

// UsageStats and its extractors live in src/lib/ai/usage.ts, which holds the
// one token convention every provider is normalised to. Re-exported because
// callers already import them from this path.
export { extractUsage, type UsageStats } from '@/lib/ai/usage';

/**
 * Maps a UsageStats onto the shared eddy_updates / gauge_updates token columns.
 * Spread into an `.insert({...})` so every generator records spend the same way.
 */
export function usageColumns(usage: UsageStats | null): {
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
} {
  return {
    model_used: usage?.modelUsed ?? null,
    input_tokens: usage?.inputTokens ?? null,
    output_tokens: usage?.outputTokens ?? null,
    cache_read_tokens: usage?.cacheReadTokens ?? null,
    cache_creation_tokens: usage?.cacheCreationTokens ?? null,
  };
}

export interface GeneratedUpdate {
  riverSlug: string;
  sectionSlug: string | null;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  quoteText: string;
  summaryText: string | null;
  eddyRead: string | null;
  sourcesUsed: string[];
  /** Compact weather snapshot persisted on the update (null if unavailable). */
  weather: WeatherSummary | null;
  /** Token usage + model for this generation (null if the response had none). */
  usage: UsageStats | null;
}

/**
 * Gathers all context data for a river/section and generates an Eddy quote.
 *
 * `model` is resolved once per pass by the caller rather than looked up here,
 * so every row a pass writes provably shares one model.
 *
 * Every way out of this function writes one generation record first, including
 * the ones that return null: see generation-record.ts. `trigger` is required
 * so a new caller has to say what started it.
 */
export async function generateEddyUpdate(
  target: UpdateTarget,
  model: ResolvedModel,
  options: { trigger: GenerationTrigger },
): Promise<GeneratedUpdate | null> {
  const sourcesUsed: string[] = [];

  // --- 0. Load river context (region, timezone, hydrology semantics) ---
  const riverCtx = await getRiverContext(target.riverSlug);

  // --- 1. Fetch gauge data ---
  // Per-reach where the reach names its own gauge; the river's primary
  // otherwise. Without the section, a tailwater update is built from the gauge
  // above its dam.
  const gaugeResult = await getGaugeConditions(target.riverSlug, target.sectionSlug);

  // --- 2. Fetch NWS alerts (state from river data; NWS is US-only) ---
  let alerts: NWSAlert[] = [];
  try {
    const allAlerts = await fetchNWSAlerts(riverCtx?.state ?? 'MO');
    alerts = filterAlertsForRiver(allAlerts, target.riverSlug, riverCtx?.alertSearchTerms);
  } catch (e) {
    console.warn('[EddyGen] NWS alert fetch failed:', e);
  }

  const floodAlerts = activeReportFloodAlerts(alerts);
  if (floodAlerts.length) sourcesUsed.push('NWS alerts');
  const facts = buildReportFacts({
    gaugeName: gaugeResult?.gaugeName ?? null,
    locationName: target.riverName,
    conditionCode: gaugeResult?.conditionCode ?? 'unknown',
    gaugeHeightFt: gaugeResult?.gaugeHeightFt ?? null,
    dischargeCfs: gaugeResult?.dischargeCfs ?? null,
    thresholds: gaugeResult?.thresholds ?? { levelTooLow: null, levelLow: null, levelOptimalMin: null, levelOptimalMax: null, levelHigh: null, levelDangerous: null },
    floodAlerts,
    requestedSection: target.sectionName,
    supportedSection: gaugeResult?.sectionGaugeMatched ? target.sectionName : null,
  });
  const fallback = preflightReportFallback(facts);

  const gaugeContext: GaugeContext = {
    facts,
    readingTimestamp: gaugeResult?.readingTimestamp ?? null,
    notes: riverCtx?.characteristics?.riverNote ?? RIVER_NOTES[target.riverSlug] ?? null,
  };
  if (facts.gaugeHeightFt != null || facts.dischargeCfs != null) sourcesUsed.push('USGS gauge');

  // What this attempt was handed, filled in as it is gathered, so an early
  // exit records what it had reached.
  const capture: GenerationCapture = {
    target,
    trigger: options.trigger,
    model: captureModel(model),
    facts,
    usgsSiteId: gaugeResult?.usgsSiteId ?? null,
    readingTimestamp: gaugeContext.readingTimestamp,
    gaugeNotes: gaugeContext.notes,
    riverCtx,
    alerts,
    weather: null,
    forecast: null,
    precipitation: null,
    trajectory: null,
    localKnowledge: null,
    systemPrompt: EDDY_SYSTEM_PROMPT,
    userPrompt: null,
  };
  const record = (result: GenerationResult) =>
    recordGeneration(buildGenerationRecord(capture, result, { gitSha: process.env.VERCEL_GIT_COMMIT_SHA }));

  // --- 3. Fetch weather (current + 3-day forecast) ---
  let weather: WeatherData | null = null;
  let forecast: ForecastData | null = null;
  let precipitation: PrecipitationSummary | null = null;
  const cityInfo = await getWeatherPointForRiver(target.riverSlug);
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (cityInfo && apiKey) {
    try {
      [weather, forecast] = await Promise.all([
        fetchWeather(cityInfo.lat, cityInfo.lon, apiKey),
        fetchForecast(cityInfo.lat, cityInfo.lon, apiKey).catch(() => null),
      ]);
      sourcesUsed.push('OpenWeather');
      // Only observed local amounts belong in the precipitation summary.
      if (!fallback) precipitation = fetchPrecipitationFromWeather(weather);
    } catch (e) {
      console.warn(`[EddyGen] Weather fetch failed for ${target.riverSlug}:`, e);
    }
  }

  capture.weather = weather;
  capture.forecast = forecast;
  capture.precipitation = precipitation;

  if (fallback) await record({
    outcome: 'fallback',
    reason: preflightFallbackReason(facts),
    published: { ...fallback, sourcesUsed },
  });
  if (fallback) return {
    riverSlug: target.riverSlug,
    sectionSlug: target.sectionSlug,
    conditionCode: facts.conditionCode,
    gaugeHeightFt: facts.gaugeHeightFt,
    dischargeCfs: facts.dischargeCfs,
    ...fallback,
    sourcesUsed,
    weather: buildWeatherSummary(weather, forecast),
    usage: null,
  };

  // Non-flood outlooks can inform model prose, but are not fallback sources.
  if (alerts.length && !facts.floodAlerts?.length) sourcesUsed.push('NWS alerts');

  // --- 4. Load local knowledge ---
  // The reporting gauge selects its own block and reach notes, and leaves the
  // river's other gauges to one "elsewhere" line each. See knowledge.ts.
  const localKnowledge = getKnowledgeForTarget(target.riverSlug, target.sectionSlug, gaugeResult?.usgsSiteId ?? null);
  if (localKnowledge) sourcesUsed.push('local knowledge');

  // --- 5. Fetch gauge trajectory (recent history + percentiles) ---
  // Addressed by site rather than by river, so the trend belongs to the SAME
  // gauge the readings above came from. Keyed off the river it would otherwise
  // report the tailwater's movement from the gauge above the dam — the reading
  // and the trend would describe two different rivers in one paragraph.
  const trajectory = gaugeResult ? await buildGaugeTrajectoryForSite(gaugeResult.usgsSiteId) : null;
  if (trajectory) sourcesUsed.push('gauge trajectory');

  // --- 7. Build the prompt ---
  const prompt = buildPrompt(target, gaugeContext, weather, forecast, alerts, localKnowledge, trajectory, precipitation, riverCtx);
  capture.localKnowledge = localKnowledge || null;
  capture.trajectory = trajectory;
  capture.userPrompt = prompt;

  // --- 8. Call the model ---
  // The resolved model first, then its fallback when it has one (an override
  // on another provider carries the code default; see resolve-models.ts). Each
  // attempt that publishes nothing writes its own record, under the model that
  // was actually asked, so a fallback is visible as two rows rather than as a
  // row whose model quietly changed.
  //
  // An attempt is accepted on a WHOLE report, not on any text: the response
  // must have finished and hold all three blocks. A model that spends its
  // output cap part-way through returns text that parses and reads as a report
  // until its last line, so "non-empty" is not the test. An incomplete answer
  // from a model with a fallback is a failed attempt; from the last model, the
  // guard replaces it with the code-written report.
  //
  // The loop itself, and when a failing provider is dropped for the rest of
  // the pass, live in src/lib/ai/attempts.ts.
  const completion = await tryModels<{ result: TextResult; prepared: PreparedReport }>(
    model,
    async ({ model: attempt, hasNext }) => {
      capture.model = captureModel(attempt);
      const result = await generateText({
        feature: 'river_update',
        model: attempt,
        // Every river/section call shares this static system prompt, which is
        // what makes it cacheable. River-specific semantics live in the user
        // prompt.
        system: EDDY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });
      // Strip em dashes that slip through despite prompt instructions. The
      // record keeps result.text exactly as returned; the cleanup is not part
      // of the evidence.
      const rawText = result.text ? replaceEmDashes(result.text.trim()) || null : null;
      const prepared = rawText ? prepareGeneratedReport(rawText, facts, { finished: result.finished }) : null;
      if (prepared && !(prepared.incomplete && hasNext)) return { result, prepared };

      if (prepared) {
        console.error(`[EddyGen] Incomplete ${attempt.id} report for ${target.riverSlug}/${target.sectionSlug}: ${prepared.incomplete} (${result.stopReason})`);
        await record({ outcome: 'error', reason: 'incomplete_response', rawResponse: result.text, stopReason: result.stopReason, usage: result.usage });
      } else {
        console.error(`[EddyGen] Empty ${attempt.id} response for ${target.riverSlug}/${target.sectionSlug}`);
        await record({ outcome: 'error', reason: 'empty_response', rawResponse: result.text, stopReason: result.stopReason, usage: result.usage });
      }
      return null;
    },
    async (attempt, e) => {
      if (e instanceof MissingApiKeyError) {
        console.error(`[EddyGen] ${e.message}`);
        await record({ outcome: 'error', reason: 'missing_api_key' });
      } else {
        console.error(`[EddyGen] ${attempt.id} call failed for ${target.riverSlug}:`, e);
        await record({ outcome: 'error', reason: 'model_error', errorMessage: e instanceof Error ? e.message : String(e) });
      }
    },
  );
  if (!completion) {
    // Every model was asked and none answered with a report (the attempts
    // above each wrote their own error row). Publish the code-written report
    // from the facts already gathered, so an outage leaves readers a factual
    // Read instead of nothing once yesterday's row expires. Its sources are
    // the fallback's: the gauge, and NWS only when a flood alert is in it.
    const report = factualReportFallback(facts);
    const update: GeneratedUpdate = {
      riverSlug: target.riverSlug,
      sectionSlug: target.sectionSlug,
      conditionCode: facts.conditionCode,
      gaugeHeightFt: facts.gaugeHeightFt,
      dischargeCfs: facts.dischargeCfs,
      ...report,
      sourcesUsed: fallbackSources(sourcesUsed, facts),
      weather: buildWeatherSummary(weather, forecast),
      usage: null,
    };
    await record({
      outcome: 'fallback',
      reason: 'no_model_response',
      published: { summaryText: update.summaryText, eddyRead: update.eddyRead, quoteText: update.quoteText, sourcesUsed: update.sourcesUsed },
    });
    return update;
  }

  const modelText = completion.result.text;
  // usage.modelUsed is the model that answered, which after a fallback is not
  // the one that was selected.
  const usage = completion.result.usage;
  const stopReason = completion.result.stopReason;

  try {
    // The guard has already run on this text, inside the attempt that
    // accepted it. What it decided is what is published.
    const { report, usedFallback, fallbackReason, contradictions } = completion.prepared;
    const { summaryText, eddyRead, quoteText } = report;
    const publishedSources = !usedFallback ? sourcesUsed : fallbackSources(sourcesUsed, facts);

    const update: GeneratedUpdate = {
      riverSlug: target.riverSlug,
      sectionSlug: target.sectionSlug,
      conditionCode: facts.conditionCode,
      gaugeHeightFt: facts.gaugeHeightFt,
      dischargeCfs: facts.dischargeCfs,
      quoteText: stripEddyMarkers(quoteText),
      summaryText: summaryText ? stripEddyMarkers(summaryText) : null,
      eddyRead: eddyRead ? stripEddyMarkers(eddyRead) : null,
      sourcesUsed: publishedSources,
      weather: buildWeatherSummary(weather, forecast),
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
    console.error(`[EddyGen] Preparing the ${usage.modelUsed} report failed for ${target.riverSlug}:`, e);
    await record({ outcome: 'error', reason: 'model_error', rawResponse: modelText, stopReason, usage, errorMessage: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** The sources a code-written report can claim: the gauge, the weather it
 * carries, and NWS only when a flood alert is part of it. */
function fallbackSources(sourcesUsed: string[], facts: ReportFacts): string[] {
  return sourcesUsed.filter(source => source === 'USGS gauge' || source === 'OpenWeather'
    || (source === 'NWS alerts' && !!facts.floodAlerts?.length));
}

// The parser lives in its own SDK-free module so it stays unit-testable.
// Re-exported here because callers already import it from this path.
export { parseEddyResponse, stripEddyMarkers };
// Same reason: the semantics builder lives in an SDK-free module so it can be
// unit-tested, but callers already import it from this path.
export { RIVER_TYPE_GUIDANCE, buildConditionSemantics };

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

// The river Read's system prompt is the shared Read brief (read-brief.ts),
// which the secondary-gauge Read uses too. Static and free of any
// river-specific value, so it forms an identical prefix across every call and
// is cacheable when the selected model supports a prefix this short. River
// region and low/rising-water framing are injected into the user prompt's
// [CONDITION SEMANTICS] block by buildConditionSemantics().
export const EDDY_SYSTEM_PROMPT = RIVER_READ_BRIEF;
