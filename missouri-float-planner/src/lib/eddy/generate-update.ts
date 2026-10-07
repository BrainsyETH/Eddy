// src/lib/eddy/generate-update.ts
// Orchestrates data gathering and calls the configured Claude model to generate Eddy updates.
// Used by the cron job to produce per-river (or per-section) condition quotes.

import { trackedAnthropic } from '@/lib/telemetry/upstream';
import Anthropic from '@anthropic-ai/sdk';
import type { ConditionCode } from '@/types/api';
import { RIVER_NOTES } from '@/data/eddy-quotes';
import type { UpdateTarget } from '@/data/river-sections';
import { fetchNWSAlerts, filterAlertsForRiver, type NWSAlert } from '@/lib/nws/alerts';
import { fetchWeather, fetchForecast, getWeatherPointForRiver, type WeatherData, type ForecastData } from '@/lib/weather/openweather';
import { fetchPrecipitationFromWeather, buildWeatherSummary, type PrecipitationSummary, type WeatherSummary } from '@/lib/weather/openweather';
import { getKnowledgeForTarget } from '@/lib/eddy/knowledge';
import { buildGaugeTrajectoryForSite, type GaugeTrajectory } from '@/lib/eddy/gauge-trajectory';
import { RAIN_LAG, type RainLagInfo } from '@/lib/eddy/rain-lag';
import { getGaugeConditions } from '@/lib/gauge/get-gauge-conditions';
import { getRiverContext, DEFAULT_TIMEZONE, type RiverContext } from '@/lib/rivers/context';
import { getLocalDateStrings } from '@/lib/social/local-time';
import { parseEddyResponse, stripEddyMarkers, replaceEmDashes } from '@/lib/eddy/parse-response';
import { RIVER_TYPE_GUIDANCE, buildConditionSemantics } from '@/lib/eddy/condition-semantics';
import { buildReportFacts, reportFactsPrompt, prepareGeneratedReport, preflightReportFallback, activeReportFloodAlerts, type ReportFacts } from './report-facts';
import type { ResolvedModel } from '@/lib/ai/resolve-models';
import { getOutlookDates } from '@/lib/river-outlook';


export interface GaugeContext {
  facts: ReportFacts;
  readingTimestamp: string | null;
  notes: string | null;
}

// The model is no longer a constant here. It is resolved once per pass from
// llm_config and threaded in, so a switch cannot split one run across two
// models. See src/lib/ai/resolve-models.ts.

/**
 * Token/cost accounting for a single model call, persisted alongside the update
 * so spend and prompt-cache hit rates are queryable. Fields are nullable to
 * tolerate SDK responses that omit a usage block.
 */
export interface UsageStats {
  modelUsed: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
}

/** Extracts a UsageStats from a Claude message's `usage` block. */
export function extractUsage(
  modelUsed: string,
  usage:
    | {
        input_tokens?: number | null;
        output_tokens?: number | null;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      }
    | null
    | undefined,
): UsageStats {
  return {
    modelUsed,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    cacheReadTokens: usage?.cache_read_input_tokens ?? null,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? null,
  };
}

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
 */
export async function generateEddyUpdate(
  target: UpdateTarget,
  model: ResolvedModel,
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
      // Extract precipitation data from already-fetched responses
      if (!fallback) precipitation = fetchPrecipitationFromWeather(weather, forecast);
    } catch (e) {
      console.warn(`[EddyGen] Weather fetch failed for ${target.riverSlug}:`, e);
    }
  }

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
  const localKnowledge = getKnowledgeForTarget(target.riverSlug, target.sectionSlug);
  if (localKnowledge) sourcesUsed.push('local knowledge');

  // --- 5. Fetch gauge trajectory (48h history + percentiles) ---
  // Addressed by site rather than by river, so the trend belongs to the SAME
  // gauge the readings above came from. Keyed off the river it would otherwise
  // report the tailwater's movement from the gauge above the dam — the reading
  // and the trend would describe two different rivers in one paragraph.
  const trajectory = gaugeResult ? await buildGaugeTrajectoryForSite(gaugeResult.usgsSiteId) : null;
  if (trajectory) sourcesUsed.push('gauge trajectory');

  // --- 6. Load rain-lag info (river_characteristics first, legacy map fallback) ---
  const rc = riverCtx?.characteristics;
  const rainLag: RainLagInfo | null =
    rc?.rainLagHours != null
      ? {
          hours: rc.rainLagHours,
          note: rc.rainLagNote ?? '',
          dropRateFtPerDay: rc.dropRateNote ?? '',
        }
      : RAIN_LAG[target.riverSlug] ?? null;

  // --- 7. Build the prompt ---
  const prompt = buildPrompt(target, gaugeContext, weather, forecast, alerts, localKnowledge, trajectory, precipitation, rainLag, riverCtx);

  // --- 8. Call the model ---
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('[EddyGen] ANTHROPIC_API_KEY not configured');
    return null;
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await trackedAnthropic('river_update', model.id, () => client.messages.create({
      model: model.id,
      max_tokens: model.maxTokens,
      // Omitted entirely unless the model needs it. Sonnet 5 thinks by default
      // and would spend max_tokens doing it; Sonnet 4.6 does not.
      ...(model.thinking ? { thinking: model.thinking } : {}),
      messages: [{ role: 'user', content: prompt }],
      // Every river/section call shares this static system prompt. Sonnet can
      // cache its ~1.6k tokens; Haiku's 4096-token minimum is too high, so the
      // resolver omits the otherwise ineffective breakpoint for that pairing.
      // River-specific semantics live in the user prompt.
      system: model.cacheSystemPrompt
        ? [{ type: 'text', text: EDDY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
        : EDDY_SYSTEM_PROMPT,
    }));

    const textBlock = message.content.find((block) => block.type === 'text');
    // Strip em dashes that slip through despite prompt instructions
    const rawText = textBlock?.text ? replaceEmDashes(textBlock.text.trim()) || null : null;

    if (!rawText) {
      console.error(`[EddyGen] Empty response for ${target.riverSlug}/${target.sectionSlug}`);
      return null;
    }

    // Parse summary and full text from the model output
    const { report, usedFallback } = prepareGeneratedReport(rawText, facts);
    const { summaryText, eddyRead, quoteText } = report;
    const publishedSources = !usedFallback ? sourcesUsed
      : sourcesUsed.filter(source => source === 'USGS gauge' || source === 'OpenWeather'
        || (source === 'NWS alerts' && !!facts.floodAlerts?.length));

    return {
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
      usage: extractUsage(model.id, message.usage),
    };
  } catch (e) {
    console.error(`[EddyGen] ${model.id} call failed for ${target.riverSlug}:`, e);
    return null;
  }
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
const EDDY_SYSTEM_PROMPT = `You are Eddy, the otter guide in a float trip planning app. You write condition updates for float rivers. The user message names the river, its region, its hydrology semantics, and the authoritative gauge facts.

WHO READS THIS: someone deciding whether to float this river soon. Beside your text the app already shows the condition badge, the gauge reading, a trend chart, and a separate "Watch for" panel covering the weather outlook. Your job is what those cannot say: what the water is like out there, and why.

VOICE: A local outfitter who checks the gauges every morning and tells it straight, the way you would talk to a customer at the counter. Plain words, friendly, concise, not a report. Use river terms naturally: put-in, take-out, riffle, gravel bar, chute.

OUTPUT FORMAT (strict):
Your response MUST begin with the exact [CLAIMS] line supplied in the authoritative facts. Then write three blocks, each starting with its marker on its own line: [SUMMARY], [EDDY_READ], [FULL]. Use each marker once, as a header only, never inside your prose. Output nothing else.

[SUMMARY]
One sentence, under 120 characters, for cards and share images. Answer "can I float it, and what will it be like?" in plain words.

[EDDY_READ]
One or two sentences, under 240 characters. The local read: why the river is doing what it is doing and what that means on the water. Draw on river behavior and local knowledge. Leave out gauge readings, temperatures and rain percentages. Leave the forecast to the Watch for panel unless rain is already on its way to this gauge. Do not restate the summary.

[FULL]
3 to 5 sentences. The complete picture: where the reading is taken, what the water is like, the measured trend, and what the forecast could mean for the next few days. The app shows its first two sentences as a preview on cards, so open with what the water is like and what to do about it, in plain words. Cite the gauge reading or the optimal range later in the block, and only when they help. Pick the 2 or 3 points that matter most.

Two examples with different shapes (illustrative only; always use the facts you are given):

[CLAIMS] condition=good relation=below
[SUMMARY]
The Current floats fine near Van Buren, just on the thin side, so pick your line through the riffles.

[EDDY_READ]
Big springs upstream keep this stretch from dropping fast, which is why it has barely moved through a dry week.

[FULL]
Expect easy floating in the pools near Van Buren and a few shallow riffles where a loaded canoe may touch. The gauge reads Good, a little below the optimal range, and held level over the past day. If the dry forecast holds, nothing obvious should change that over the next couple of days. Check the gauge again the morning you launch.

[CLAIMS] condition=too_low relation=below
[SUMMARY]
Not worth floating near Steelville right now; the creek needs a good rain first.

[EDDY_READ]
A small, fast-draining watershed like this one gives back what it gets quickly, so a dry spell leaves long gravel bars and more walking than paddling.

[FULL]
Near Steelville you would be dragging boats across most riffles, and the gauge reads Too Low with no movement over the past day. Rain could bring it up fast on a creek this size, but nothing in the outlook points that way yet. Waiting for rain is the better plan.

CONDITION LEVELS:
The levels are Too Low, Low, Good, Flowing, High and Dangerous. Flowing is the best float level; Good floats fine but is not quite there. Never call a level "ideal". You do not have to name the level; if you do, use the exact capitalized label from the facts, and never write it as a field like "condition: Good".
- Too Low: not worth floating. The only level where you recommend waiting or another plan.
- Low: apply the LOW WATER GUIDANCE from [CONDITION SEMANTICS].
- Good: floats fine. Use the plain-words comparison in the facts to say whether it is on the thin or the full side.
- Flowing: the sweet spot.
- High: a clear warning to use caution, with faster, pushier water. Not a blanket "experienced paddlers only" unless it is approaching Dangerous.
- Dangerous: "stay off the water", with no hedging, and say it first.
- Active NWS flood alerts always lead the summary and the full text.

PLAIN LANGUAGE:
- Describe what the reader will experience (easy pools, scraping, dragging, pushy current), not what the thresholds are called.
- "Optimal range" is the app's term. Use it only in [FULL], and only when it adds something. Never say "band".
- Describe how unusual a level is in words such as "lower than usual for early October". Never print a percentile number or the word percentile.
- Describe river behavior ("spring inputs keep the base flow steady", "comes up fast after rain"). Never label the river "spring-fed" or "rain-fed".

TREND AND FORECAST:
- Let the measured trend set your tone: falling toward a better level is good news, rising near a threshold deserves caution, and a fast rise in High water deserves a stronger warning.
- The trend data covers roughly the past day. Do not say how long the gauge has held steady beyond what the data shows, and do not call the river predictable or reliable.
- Anything about later days must be conditional ("if the dry forecast holds", "rain could"). Never say conditions will stay, remain or be a certain way. Never predict a gauge height or a rise or fall amount.
- Use rain-to-river lag to explain when rain would reach this gauge. Use recovery knowledge for tone only; do not recite drop rates or timelines.
- Only describe weather for the days listed in [3-DAY FORECAST]. Mention temperature and wind only when they matter for comfort, and never first.

ACCURACY:
- Only cite numbers that appear in the data.
- Keep claims to the reporting gauge's location. Background knowledge about a place is not a current reading there: do not infer scraping or floatability upstream or downstream, compare raw heights between stations, or treat two snapshots as a trend. If the facts say a section is not supported, say this gauge does not assess it.
- Do not suggest a different river unless you have its own gauge data, and never one that shares this gauge (Courtois uses Huzzah's gauge, for example).
- When you do not know something, say so plainly.

STYLE:
- Vary openings and structure from update to update. Do not open the summary with "At Town," and do not open the Eddy Read with "The gauge".
- No em dashes, emojis, hashtags or exclamation marks. No greeting, sign-off or "I".`;

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function buildPrompt(
  target: UpdateTarget,
  gauge: GaugeContext,
  weather: WeatherData | null,
  forecast: ForecastData | null,
  alerts: NWSAlert[],
  localKnowledge: string,
  trajectory: GaugeTrajectory | null = null,
  precipitation: PrecipitationSummary | null = null,
  rainLag: RainLagInfo | null = null,
  riverCtx: RiverContext | null = null,
): string {
  const riverNotes = riverCtx?.characteristics?.riverNote ?? RIVER_NOTES[target.riverSlug];
  const lines: string[] = [];

  // Date context in the river's local timezone so day-of-week and "this
  // weekend" references are right for the river, not for Missouri.
  const { dayOfWeek, dateStr } = getLocalDateStrings(riverCtx?.timezone ?? DEFAULT_TIMEZONE);
  lines.push(`Date: ${dayOfWeek}, ${dateStr}`);
  lines.push('');

  lines.push(`Generate an Eddy condition update for: ${target.riverName}`);
  if (target.sectionName) {
    lines.push(`Section: ${target.sectionName}`);
  }
  if (target.sectionDescription) {
    lines.push(`Section context: ${target.sectionDescription}`);
  }

  // River character (from rivers.river_type + river_characteristics)
  if (riverCtx) {
    lines.push('');
    lines.push('[RIVER CHARACTER]');
    // Effective type, so this line agrees with the guidance below it rather
    // than announcing "spring fed float" above dam-tailwater semantics.
    const effectiveType = target.sectionRiverType ?? riverCtx.riverType;
    lines.push(`Type: ${effectiveType.replace(/_/g, ' ')}`);
    const hazards = riverCtx.characteristics?.primaryHazards;
    if (hazards && hazards.length > 0) {
      lines.push(`Primary hazards: ${hazards.map((h) => h.replace(/_/g, ' ')).join(', ')}`);
    }
  }

  // Condition semantics (region + low/rising-water framing) — moved out of the
  // system prompt so that prompt stays static and cacheable.
  lines.push('');
  lines.push('[CONDITION SEMANTICS — how to interpret conditions on THIS river]');
  lines.push(
    buildConditionSemantics(riverCtx, {
      riverType: target.sectionRiverType,
      lowWaterMeaning: target.sectionLowWaterMeaning,
      risingWaterHazards: target.sectionRisingWaterHazards,
    }),
  );

  lines.push('');
  lines.push('[CURRENT GAUGE DATA]');

  lines.push(reportFactsPrompt(gauge.facts));
  if (gauge.readingTimestamp) {
    const ageHours = (Date.now() - new Date(gauge.readingTimestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 6) lines.push(`WARNING: Reading is ${Math.round(ageHours)} hours old, data may be stale.`);
  }

  // Gauge threshold knowledge
  if (gauge.notes) {
    lines.push(`Gauge notes: ${gauge.notes}`);
  } else if (riverNotes) {
    lines.push(`Gauge notes: ${riverNotes}`);
  }
  // 5-day gauge trajectory
  if (trajectory) {
    lines.push('');
    lines.push('[10-DAY GAUGE TRAJECTORY]');
    if (trajectory.change24h != null) {
      const sign24 = trajectory.change24h >= 0 ? '+' : '';
      const startHeight = trajectory.currentHeightFt != null
        ? (trajectory.currentHeightFt - trajectory.change24h).toFixed(1)
        : '?';
      lines.push(`24h change: ${sign24}${trajectory.change24h.toFixed(1)} ft (was ${startHeight} ft yesterday)`);
    }
    if (trajectory.change6h != null) {
      const sign6 = trajectory.change6h >= 0 ? '+' : '';
      lines.push(`6h change: ${sign6}${trajectory.change6h.toFixed(1)} ft`);
    }
    if (trajectory.rateFtPerHour != null && trajectory.acceleration) {
      lines.push(`Rate: ${trajectory.acceleration} at ${Math.abs(trajectory.rateFtPerHour).toFixed(2)} ft/hr`);
    }
    if (trajectory.peak48h) {
      lines.push(`5-day peak: ${trajectory.peak48h.heightFt.toFixed(1)} ft`);
    }
    if (trajectory.trough48h) {
      lines.push(`5-day low: ${trajectory.trough48h.heightFt.toFixed(1)} ft`);
    }
    lines.push(`Summary: ${trajectory.narrative}`);

    // Historical percentile context
    if (trajectory.percentileContext) {
      lines.push('');
      lines.push('[HISTORICAL CONTEXT]');
      lines.push(trajectory.percentileContext);
    }
  }

  // Recent precipitation
  if (precipitation && (precipitation.rain1h > 0 || precipitation.rain3h > 0 || precipitation.forecastRainToday > 0)) {
    lines.push('');
    lines.push('[RECENT PRECIPITATION]');
    if (precipitation.rain1h > 0 || precipitation.rain3h > 0) {
      const parts: string[] = [];
      if (precipitation.rain1h > 0) parts.push(`Last 1h: ${precipitation.rain1h.toFixed(1)} in`);
      if (precipitation.rain3h > 0) parts.push(`Last 3h: ${precipitation.rain3h.toFixed(1)} in`);
      lines.push(parts.join(' | '));
    }
    if (precipitation.forecastRainToday > 0) {
      lines.push(`Today's forecast rain: ${precipitation.forecastRainToday.toFixed(1)} in`);
    }
  }

  // Rain-to-river lag info
  if (rainLag) {
    lines.push('');
    lines.push('[RAIN-TO-RIVER LAG]');
    lines.push(`Typical response time: ${rainLag.hours} hours from local rain to gauge response`);
    lines.push(`Note: ${rainLag.note}`);
    lines.push(`Recovery rate: ${rainLag.dropRateFtPerDay}`);
  }

  // Weather (current)
  if (weather) {
    lines.push('');
    lines.push(`Current weather: ${weather.condition}, ${weather.temp}°F, wind ${weather.windSpeed} mph, humidity ${weather.humidity}%`);
  }

  // 3-day forecast
  if (forecast && forecast.days.length > 0) {
    // The same local days the app's Weather section shows (today and the next
    // two), matched by date rather than sliced, so the Read cannot describe a
    // day the Weather section beside it does not.
    const [today, ...rest] = getOutlookDates();
    const outlookDates = new Set([today, ...rest]);
    const upcoming = forecast.days.filter((day) => outlookDates.has(day.date));
    if (upcoming.length > 0) {
      lines.push('');
      lines.push('[3-DAY FORECAST]');
      for (const day of upcoming) {
        const rainNote = day.precipitation >= 20
          ? ` (${day.precipitation}% chance of rain)`
          : '';
        const label = day.date === today ? `Today (${day.dayOfWeek})` : day.dayOfWeek;
        lines.push(`${label}: ${day.condition}, ${day.tempLow}-${day.tempHigh}°F, wind ${day.windSpeed} mph${rainNote}`);
      }
    }
  }

  // NWS alerts
  if (alerts.length > 0) {
    lines.push('');
    lines.push('[ACTIVE NWS ALERTS]');
    for (const alert of alerts.slice(0, 3)) {
      lines.push(`[${alert.severity}] ${alert.event}: ${alert.headline}`);
      if (alert.description) {
        lines.push(`  ${alert.description.slice(0, 300)}`);
      }
    }
  }

  // Local knowledge from EDDY_KNOWLEDGE.md
  if (localKnowledge) {
    lines.push('');
    lines.push('[LOCAL KNOWLEDGE — use to inform your update, not recite]');
    lines.push(localKnowledge);
  }

  return lines.join('\n');
}
