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
import { buildReportFacts, prepareGeneratedReport, preflightReportFallback, preflightFallbackReason, activeReportFloodAlerts, type PreparedReport } from './report-facts';
import { buildGenerationRecord, type GenerationCapture, type GenerationResult, type GenerationTrigger } from './generation-record';
import { recordGeneration } from './generation-log';
import { modelAttempts, type ResolvedModel } from '@/lib/ai/resolve-models';
import type { UsageStats } from '@/lib/ai/usage';
import { EDDY_VOICE } from '@/lib/eddy/voice';


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
    recoveryNote: null,
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

  // --- 6. Recovery note ---
  // No rain-to-river lag is handed to the Read. The per-river estimates had no
  // source and were removed; see scripts/research/rain-lag-2026-11.
  const recoveryNote = riverCtx?.characteristics?.dropRateNote?.trim() || null;

  // --- 7. Build the prompt ---
  const prompt = buildPrompt(target, gaugeContext, weather, forecast, alerts, localKnowledge, trajectory, precipitation, recoveryNote, riverCtx);
  capture.localKnowledge = localKnowledge || null;
  capture.trajectory = trajectory;
  capture.recoveryNote = recoveryNote;
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
  let completion: { result: TextResult; prepared: PreparedReport } | null = null;
  for (const attempt of modelAttempts(model)) {
    capture.model = captureModel(attempt);
    try {
      const result = await generateText({
        feature: 'river_update',
        model: attempt,
        // Every river/section call shares this static system prompt, which is
        // what makes it cacheable. River-specific semantics live in the user
        // prompt.
        system: EDDY_SYSTEM_PROMPT,
        user: prompt,
      });
      // Strip em dashes that slip through despite prompt instructions. The
      // record keeps result.text exactly as returned; the cleanup is not part
      // of the evidence.
      const rawText = result.text ? replaceEmDashes(result.text.trim()) || null : null;
      const prepared = rawText ? prepareGeneratedReport(rawText, facts, { finished: result.finished }) : null;
      if (prepared && !(prepared.incomplete && attempt.fallback)) {
        completion = { result, prepared };
        break;
      }
      if (prepared) {
        console.error(`[EddyGen] Incomplete ${attempt.id} report for ${target.riverSlug}/${target.sectionSlug}: ${prepared.incomplete} (${result.stopReason})`);
        await record({ outcome: 'error', reason: 'incomplete_response', rawResponse: result.text, stopReason: result.stopReason, usage: result.usage });
      } else {
        console.error(`[EddyGen] Empty ${attempt.id} response for ${target.riverSlug}/${target.sectionSlug}`);
        await record({ outcome: 'error', reason: 'empty_response', rawResponse: result.text, stopReason: result.stopReason, usage: result.usage });
      }
    } catch (e) {
      if (e instanceof MissingApiKeyError) {
        console.error(`[EddyGen] ${e.message}`);
        await record({ outcome: 'error', reason: 'missing_api_key' });
      } else {
        console.error(`[EddyGen] ${attempt.id} call failed for ${target.riverSlug}:`, e);
        await record({ outcome: 'error', reason: 'model_error', errorMessage: e instanceof Error ? e.message : String(e) });
      }
    }
    if (attempt.fallback) {
      console.warn(`[EddyGen] ${attempt.id} produced nothing for ${target.riverSlug}; falling back to ${attempt.fallback.id}`);
    }
  }
  if (!completion) return null;

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
    const publishedSources = !usedFallback ? sourcesUsed
      : sourcesUsed.filter(source => source === 'USGS gauge' || source === 'OpenWeather'
        || (source === 'NWS alerts' && !!facts.floodAlerts?.length));

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

/** The model fields a generation record keeps. */
function captureModel(model: ResolvedModel): GenerationCapture['model'] {
  return {
    id: model.id,
    provider: model.provider,
    maxTokens: model.maxTokens,
    thinking: model.thinking,
    reasoningEffort: model.reasoningEffort,
    cacheSystemPrompt: model.cacheSystemPrompt,
    source: model.source,
  };
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

// Static Eddy system prompt. Deliberately free of any river-specific value so
// it forms an identical prefix across every call and is cacheable when the
// selected model supports a prefix this short. River
// region and low/rising-water framing are injected into the user prompt's
// [CONDITION SEMANTICS] block by buildConditionSemantics().
export const EDDY_SYSTEM_PROMPT = `You are Eddy, the otter guide in a float trip planning app. You write condition updates for float rivers. The user message names the river, its region, its hydrology semantics, and the authoritative gauge facts.

WHO READS THIS: someone deciding whether to float this river soon. Beside your text the app already shows the condition badge, the gauge reading, a trend chart, and a separate "Watch for" panel covering the weather outlook. Your job is what those cannot say: what the water is like out there and what it means for a floater.

KNOW YOUR STRETCH: A good guide knows which water a gauge speaks for. Before writing, work out which stretch this reading covers from the gauge's town, any section named in the user message, and the local knowledge. Know where the river changes character around it, such as a big spring or tributary coming in, a dam, or a reach that loses water, but only from what the supplied notes say. Write about the float this gauge covers. When the notes say another stretch can differ a lot from this gauge, say so in one plain line as a pattern and point the reader to that stretch's own gauge. Never describe another stretch's conditions today, and never invent where the river changes.

VOICE: ${EDDY_VOICE}

OUTPUT FORMAT (strict):
Your response MUST begin with the exact [CLAIMS] line supplied in the authoritative facts. Then write three blocks, each starting with its marker on its own line: [SUMMARY], [EDDY_READ], [FULL]. Use each marker once, as a header only, never inside your prose. Output nothing else.

[SUMMARY]
One sentence, under 120 characters, for cards and share images. Answer "can I float it, and what will it be like?" in plain words.

[EDDY_READ]
One or two sentences, under 240 characters. Give the local insight: what makes THIS reporting stretch different at this level. When supplied local knowledge supports it, pick one useful detail about its channel, pools, riffles, landmarks, or response to changing water and connect it to the float. A tip such as "travel light" or a restatement of the chart is not a local insight. Describe established local patterns as patterns, not as observations made today. Do not invent a feature, its location, or a cause to make the writing colorful; when local detail is unavailable, stay useful and honest about the supplied facts. Leave out gauge readings. No weather and no forecast here: the Watch for panel owns both. Rain that has already fallen and is working its way down to this gauge is river news, and you may say so when the facts show it. Do not restate the summary.

[FULL]
3 to 5 concise sentences. Each sentence must add useful information; do not pad the report to reach the minimum. Lead with the most useful supported takeaway: what the water is like, a meaningful measured change, or what to do about it. Work the reporting location into the condition claim it qualifies. Include the measured trend only when it adds useful information for the decision. Premium cards show the first two sentences as an excerpt for subscribers, so make those useful on their own. Cite the gauge reading or the optimal range later in the block, and only when they help. Pick the 2 or 3 points that matter most.

Two examples with different shapes (illustrative only; always use the facts you are given). The Van Buren example assumes local notes saying Van Buren sits well down the river and that the upstream gauges at Akers and Montauk can disagree with it a lot in a dry spell. Use a detail like that only when your own supplied notes say it:

[CLAIMS] condition=good relation=below
[SUMMARY]
An easygoing float looks good on the lower Current near Van Buren.

[EDDY_READ]
Van Buren sits well down the river, so this reading speaks for the lower Current. Up around Akers, a dry spell can leave a lot less water than this gauge suggests.

[FULL]
There is enough water for an easygoing float at Van Buren, with little change over the past day. Planning to put in up around Akers or Montauk? Check those gauges first, since they can tell a different story in a dry spell. Down here the reading sits a little below the optimal range but still rates Good.

[CLAIMS] condition=too_low relation=below
[SUMMARY]
The Steelville stretch needs more water for a worthwhile float.

[EDDY_READ]
This creek can come up fast after rain, then drop back just as quickly. It hasn't come up enough to make a float worthwhile.

[FULL]
You would be dragging boats across most riffles around Steelville, with no improvement in the reading over the past day. A creek this size comes up fast after rain and drops back just as quickly, so it is worth another look after the next good rain.

CONDITION LEVELS:
The levels are Too Low, Low, Good, Flowing, High and Dangerous. Flowing is the best float level; Good floats fine but is not quite there. Never call a level "ideal". Prefer the practical meaning over repeating the badge. Name the level only when it clarifies the advice; if you do, use the exact capitalized label from the facts, and never write it as a field like "condition: Good".
- Too Low: not worth floating. Recommend waiting for more water; do not assume rain is the source on a dam-controlled river.
- Low: apply the LOW WATER GUIDANCE from [CONDITION SEMANTICS].
- Good: floats fine. Use the supplied optimal-range comparison only when useful in [FULL]. Being below optimal does not by itself establish shallow riffles or scraping; those details need local evidence.
- Flowing: the sweet spot.
- High: a clear warning to use caution, with faster, pushier water. Not a blanket "experienced paddlers only" unless it is approaching Dangerous.
- Dangerous: "stay off the water", with no hedging, and say it first. Recommend postponing the float.
- Active NWS flood alerts always lead the summary and the full text.

PLAIN LANGUAGE:
- Describe what the reader will experience (easy pools, scraping, dragging, pushy current), not what the thresholds are called.
- "Optimal range" is the app's term. Use it only in [FULL], and only when it adds something. Never say "band".
- Describe how unusual a level is in words such as "lower than usual for early October". Never print a percentile number or the word percentile.
- Default to leaving out "spring-fed" and "rain-fed". A river type in the supplied context is not a reason to mention it. Use either term only when a supplied local detail makes it useful for understanding this stretch at this level; the type label alone is not enough. Local character does not need to explain the cause of today's gauge movement. Never use it as a stock opening or repeat it across the three blocks. Do not substitute a routine explanation about springs or rainfall just to avoid the label; omit that background when it adds nothing.

TREND AND THE DAYS AHEAD:
- Let the measured trend set your tone: falling toward a better level is good news, rising near a threshold deserves caution, and a fast rise in High water deserves a stronger warning.
- The measured changes and rate cover roughly the past day. A peak or low is labelled with the number of days it was taken over and says nothing about the days before that. Do not say how long the gauge has held steady beyond what the data shows, and do not call the river predictable or reliable.
- Anything about later days must be conditional ("if that rain arrives", "rain could"). Never say conditions will stay, remain or be a certain way. Never predict a gauge height or a rise or fall amount.
- Do not say how many hours rain takes to reach or crest at this gauge. Use recovery knowledge for tone only; do not recite drop rates or timelines.
- Do not describe the weather: no sky, temperature, wind or rain chance, today or ahead. The app's Weather section owns all of it. The days ahead reach you only as an [OUTLOOK] block, and only when rain is likely. Without one, say nothing about the days ahead. With one, say once in [FULL] that rain could change this reading and that it is worth another look, and leave it there.

ACCURACY:
- Do not invent a cause for an observed change or steady reading. General river character alone does not establish today's cause; qualify a supported possible explanation and omit it when the evidence is insufficient.
- Only cite numbers that appear in the data.
- Keep claims to the reporting gauge's location. Background knowledge about a place is not a current reading there: do not infer scraping or floatability upstream or downstream, compare raw heights between stations, or treat two snapshots as a trend. If the facts say a section is not supported, say this gauge does not assess it.
- Do not suggest a different river unless you have its own gauge data, and never one that shares this gauge (Courtois uses Huzzah's gauge, for example).
- When you do not know something, say so plainly.

STYLE:
- Let the strongest supplied fact pick the opening; work the town or landmark into the sentence it qualifies. Give each block a distinct opening without copying an example's sentence frame. Do not open the Eddy Read with "The gauge".
- No em dashes, emojis, hashtags or exclamation marks. No greeting, sign-off or "I".`;
