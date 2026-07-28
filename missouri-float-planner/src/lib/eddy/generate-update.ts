// src/lib/eddy/generate-update.ts
// Orchestrates data gathering and calls Claude Sonnet to generate Eddy updates.
// Used by the cron job to produce per-river (or per-section) condition quotes.

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
import { parseEddyResponse, stripEddyMarkers } from '@/lib/eddy/parse-response';
import { RIVER_TYPE_GUIDANCE, buildConditionSemantics } from '@/lib/eddy/condition-semantics';


export interface GaugeContext {
  gaugeName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  conditionCode: ConditionCode;
  conditionLabel: string;
  readingTimestamp: string | null;
  optimalRange: string;
  closureLevel: number | null;
  notes: string | null;
}

/** Sonnet model used for river-level + per-section updates. */
export const SONNET_MODEL = 'claude-sonnet-4-6';

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
 * Gathers all context data for a river/section and generates an Eddy quote via
 * Claude Sonnet.
 */
export async function generateEddyUpdate(
  target: UpdateTarget,
): Promise<GeneratedUpdate | null> {
  const sourcesUsed: string[] = [];

  // --- 0. Load river context (region, timezone, hydrology semantics) ---
  const riverCtx = await getRiverContext(target.riverSlug);

  // --- 1. Fetch gauge data ---
  // Per-reach where the reach names its own gauge; the river's primary
  // otherwise. Without the section, a tailwater update is built from the gauge
  // above its dam.
  const gaugeResult = await getGaugeConditions(target.riverSlug, target.sectionSlug);
  const gaugeContext: GaugeContext | null = gaugeResult ? {
    gaugeName: gaugeResult.gaugeName,
    gaugeHeightFt: gaugeResult.gaugeHeightFt,
    dischargeCfs: gaugeResult.dischargeCfs,
    conditionCode: gaugeResult.conditionCode,
    conditionLabel: gaugeResult.conditionLabel,
    readingTimestamp: gaugeResult.readingTimestamp,
    optimalRange: gaugeResult.optimalRange,
    closureLevel: gaugeResult.closureLevel,
    notes: riverCtx?.characteristics?.riverNote ?? RIVER_NOTES[target.riverSlug] ?? null,
  } : null;
  if (gaugeContext) sourcesUsed.push('USGS gauge');

  // --- 2. Fetch weather (current + 3-day forecast) ---
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
      precipitation = fetchPrecipitationFromWeather(weather, forecast);
    } catch (e) {
      console.warn(`[EddyGen] Weather fetch failed for ${target.riverSlug}:`, e);
    }
  }

  // --- 3. Fetch NWS alerts (state from river data; NWS is US-only) ---
  let alerts: NWSAlert[] = [];
  try {
    const allAlerts = await fetchNWSAlerts(riverCtx?.state ?? 'MO');
    alerts = filterAlertsForRiver(allAlerts, target.riverSlug, riverCtx?.alertSearchTerms);
    if (alerts.length > 0) sourcesUsed.push('NWS alerts');
  } catch (e) {
    console.warn('[EddyGen] NWS alert fetch failed:', e);
  }

  // --- 4. Load local knowledge ---
  const localKnowledge = getKnowledgeForTarget(target.riverSlug, target.sectionSlug);
  if (localKnowledge) sourcesUsed.push('local knowledge');

  // --- 5. Fetch gauge trajectory (48h history + percentiles) ---
  // Addressed by site rather than by river, so the trend belongs to the SAME
  // gauge the readings above came from. Keyed off the river it would otherwise
  // report the tailwater's movement from the gauge above the dam — the reading
  // and the trend would describe two different rivers in one paragraph.
  let trajectory: GaugeTrajectory | null = null;
  if (gaugeContext && gaugeResult) {
    trajectory = await buildGaugeTrajectoryForSite(gaugeResult.usgsSiteId);
    if (trajectory) sourcesUsed.push('gauge trajectory');
  }

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

  // --- 8. Call Claude Sonnet ---
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('[EddyGen] ANTHROPIC_API_KEY not configured');
    return null;
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
      // Static system prompt with a cache breakpoint: every river/section call
      // in a cron run shares this exact prefix, so only the first pays full
      // input price. River-specific semantics live in the user prompt.
      // NOTE: Sonnet 4.6's minimum cacheable prefix is 2048 tokens and this
      // prompt is ~1.9k, so caching is borderline — watch eddy_updates
      // .cache_read_tokens to confirm it actually fires (if it stays 0, the
      // prompt is under the floor and caching is a no-op, which is harmless).
      system: [
        { type: 'text', text: EDDY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    // Strip em dashes that slip through despite prompt instructions
    const rawText = textBlock?.text?.trim().replace(/\u2014/g, ',') || null;

    if (!rawText) {
      console.error(`[EddyGen] Empty response for ${target.riverSlug}/${target.sectionSlug}`);
      return null;
    }

    // Parse summary and full text from the model output
    const { summaryText, eddyRead, quoteText } = parseEddyResponse(rawText);

    return {
      riverSlug: target.riverSlug,
      sectionSlug: target.sectionSlug,
      conditionCode: gaugeContext?.conditionCode ?? 'unknown',
      gaugeHeightFt: gaugeContext?.gaugeHeightFt ?? null,
      dischargeCfs: gaugeContext?.dischargeCfs ?? null,
      quoteText: stripEddyMarkers(quoteText),
      summaryText: summaryText ? stripEddyMarkers(summaryText) : null,
      eddyRead: eddyRead ? stripEddyMarkers(eddyRead) : null,
      sourcesUsed,
      weather: buildWeatherSummary(weather, forecast),
      usage: extractUsage(SONNET_MODEL, message.usage),
    };
  } catch (e) {
    console.error(`[EddyGen] Sonnet call failed for ${target.riverSlug}:`, e);
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
// it forms an identical, cacheable prefix across every Sonnet call. River
// region and low/rising-water framing are injected into the user prompt's
// [CONDITION SEMANTICS] block by buildConditionSemantics().
const EDDY_SYSTEM_PROMPT = `You are Eddy, an AI otter mascot for a float trip planning app. You provide condition updates for float rivers. The user message names the river, its region, and its hydrology semantics.

VOICE: Friendly, knowledgeable, concise. Like a local outfitter who checks gauges every morning. Not overly casual, not corporate. Use river terminology naturally: put-in, take-out, gauge, riffle, gravel bar.

VOCABULARY: The condition levels are named Too Low, Low, Good, Flowing, High, and Flood. Never call a level "ideal" — the green level is "Flowing". Say "optimal range" when referring to the gauge's optimal_min/optimal_max band.

OUTPUT FORMAT (strict):
Your response MUST contain exactly three labeled blocks. Use the markers [SUMMARY], [EDDY_READ], and [FULL] on their own lines, each followed by the text for that section. No other formatting, labels, or wrapping.
IMPORTANT: The markers are one-time section headers, not tags. Use each exactly once at the start of its section. Do NOT repeat them, use them as closing markers, or include the literal marker text anywhere in your prose.

[SUMMARY]
A single sentence, under 120 characters. This is for share cards and compact views.

[EDDY_READ]
One or two concise sentences, under 240 characters total. Synthesize the river's behavior, measured trend, forecast implications, and useful local knowledge into an experienced outfitter's read. Add interpretation that is not obvious from the displayed numbers. Do not repeat exact gauge values, temperatures, or precipitation percentages. Do not claim a future river level unless an official river forecast is provided.

[FULL]
4-6 sentences with details, trends, and context. Do not exceed 6 sentences. Pick the 2-3 most important points, not everything.

Example response:

[SUMMARY]
Flowing at 2.5 ft with a steady gauge, making today a strong float window.

[EDDY_READ]
Spring inputs make this reach more predictable than most after a dry stretch, and the steady trend supports a straightforward float today.

[FULL]
The Akers gauge reads 2.5 ft, in the optimal range of 2.0 to 3.0 ft. It has held steady over the past 24 hours, which makes today's conditions more predictable. If the dry forecast holds, the river has no obvious weather-driven change signal through Friday, but exact future readings are uncertain. Recheck the gauge before launch.

CONDITION ASSESSMENT:
- Match your language to the condition code provided. If the code is "high", say it IS high water, not "approaching high." If "dangerous", say "stay off the water" with zero hedging.
- State the condition clearly in the first sentence of both the summary and the full text.
- If there are active NWS flood alerts, lead with safety first.
- Cite the actual gauge reading and what it means for floating.
- For high water: use "use caution" language rather than "experienced paddlers only." High water deserves a clear warning but not a blanket restriction unless conditions are solidly high or approaching dangerous.
- For "low" conditions: apply the LOW WATER GUIDANCE from the [CONDITION SEMANTICS] block of the user message.
- For "too_low" conditions: This is the only condition where you should actively recommend waiting or pivoting. The river is genuinely not floatable at this level.

ALTERNATIVES:
- Do NOT recommend pivoting to a different river as an alternative unless you have independent gauge data confirming that river is in better shape.
- Some rivers share gauge data (e.g., Courtois uses Huzzah's gauge). Recommending an alternative that relies on the same gauge reading is misleading.

TREND-AWARE TONE:
- When conditions are just above a threshold and the gauge is steadily falling, moderate your tone. A river at 4.1 ft falling toward a 4.0 ft optimal max is very different from one at 4.1 ft and rising.
- Falling gauge near a threshold boundary should get an optimistic but cautious framing: "running slightly above optimal but trending down" rather than alarming language.
- Rising gauge near a threshold boundary should get a more cautious framing: "climbing toward high water" or "use caution, water is still rising."
- A steady or slowly falling gauge in the high range warrants "use caution" and a note that conditions are improving.
- A rapidly rising gauge in the high range warrants stronger warnings.
- Let the trend shape your confidence and urgency, not just the snapshot reading.

WATER TRENDS:
- Lead with the water trend: is the river rising, falling, or stable? What does that mean for someone floating today vs this weekend?
- If rising: apply the RISING WATER GUIDANCE from the [CONDITION SEMANTICS] block of the user message.
- If falling: explain that conditions are improving. Note how quickly this river typically drops if rain-lag data is provided. Falling water after a flood event means things are getting better.
- If stable: note that conditions are predictable and reference how long the gauge has held steady.
- Do NOT classify the river as "spring-fed" or "rain-fed" in your output. Use behavioral descriptors instead (e.g., "this river responds quickly to rain" or "spring inputs keep the base flow steady").

ACCURACY:
- Only cite specific numbers that appear in the provided data. Do NOT invent gauge predictions, specific rise/fall amounts, or projected gauge heights.
- Do NOT predict how many feet a gauge will rise or fall. You do not have a hydrological model.
- Do NOT recommend specific days to float unless the data clearly supports it (e.g., dry forecast combined with a falling gauge means conditions are improving).
- When you do not know something, say so honestly. "Hard to say exactly how the gauge will respond" is better than a fabricated number.

FORWARD-LOOKING:
- When a 3-day forecast and gauge trajectory are both provided, use them to make qualified forward-looking statements about the trend direction. Users want to know what conditions will look like for their upcoming float.
- Frame predictions as trends, not specifics: "expect the gauge to keep dropping" not "the gauge will drop to 3.2 ft."
- Always qualify with forecast dependency: "if the forecast holds dry" or "assuming no additional rain."
- When rain is in the forecast and rain-to-river lag data is provided, explain what it means for this specific river.
- When conditions are volatile or uncertain, say so honestly rather than guessing.

WEATHER:
- When weather and forecast data are provided, use them to serve the forward-looking narrative, not just describe today.
- When rain is forecast, connect it to what the river will likely do using lag and recovery data if available.
- When the forecast is dry and the gauge is elevated, note that as good news for recovery.
- Temperature and wind matter for float comfort. Mention them when relevant but do not lead with them.

TRAJECTORY:
- When a gauge trajectory is provided, describe the trend direction and whether the change is accelerating or slowing.
- When percentile context is available, use it to note whether conditions are typical or unusual for the time of year.

SECTION-SPECIFIC:
- When writing about a specific section, describe what the current gauge reading means for that section specifically.
- Do NOT guess at section behavior you were not given knowledge about.

RECOVERY CONTEXT:
- Do not cite specific drop rates or recovery timelines in your output.
- Use recovery knowledge to inform your tone (optimistic about recovery vs cautious), not as numbers to recite.

STYLE:
- Incorporate local knowledge naturally when provided.
- Vary your phrasing and structure from update to update.
- Do NOT use em dashes. Use commas, periods, or "and" instead.
- Do NOT use emojis, hashtags, or exclamation marks.
- Do NOT include a greeting or sign-off.
- Do NOT say "I" or refer to yourself.
- Your entire output must be ONLY the [SUMMARY], [EDDY_READ], and [FULL] blocks. Nothing else.`;

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function buildPrompt(
  target: UpdateTarget,
  gauge: GaugeContext | null,
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

  // Gauge data
  if (gauge) {
    lines.push(`Gauge: ${gauge.gaugeName}`);
    lines.push(`Height: ${gauge.gaugeHeightFt !== null ? gauge.gaugeHeightFt.toFixed(1) + ' ft' : 'unavailable'}`);
    if (gauge.dischargeCfs !== null) {
      lines.push(`Discharge: ${gauge.dischargeCfs.toLocaleString()} cfs`);
    }
    lines.push(`Condition: ${gauge.conditionLabel} (${gauge.conditionCode})`);
    lines.push(`Optimal range: ${gauge.optimalRange}`);
    if (gauge.readingTimestamp) {
      const ageHours = (Date.now() - new Date(gauge.readingTimestamp).getTime()) / (1000 * 60 * 60);
      if (ageHours > 6) {
        lines.push(`WARNING: Reading is ${Math.round(ageHours)} hours old, data may be stale.`);
      }
    }
  } else {
    lines.push('Gauge data: unavailable');
  }

  // Gauge threshold knowledge
  if (gauge?.notes) {
    lines.push(`Gauge notes: ${gauge.notes}`);
  } else if (riverNotes) {
    lines.push(`Gauge notes: ${riverNotes}`);
  }
  if (gauge?.closureLevel != null) {
    lines.push(`Closure level: ${gauge.closureLevel} ft`);
    if (gauge.gaugeHeightFt != null) {
      const margin = gauge.closureLevel - gauge.gaugeHeightFt;
      if (margin > 0) {
        lines.push(`Margin to closure: ${margin.toFixed(1)} ft below closure`);
      } else if (margin === 0) {
        lines.push(`Margin to closure: AT closure level`);
      } else {
        lines.push(`Margin to closure: ${Math.abs(margin).toFixed(1)} ft ABOVE closure`);
      }
    }
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
    // Skip today (index 0) and show next 3 days
    const upcoming = forecast.days.slice(1, 4);
    if (upcoming.length > 0) {
      lines.push('');
      lines.push('[3-DAY FORECAST]');
      for (const day of upcoming) {
        const rainNote = day.precipitation >= 20
          ? ` (${day.precipitation}% chance of rain)`
          : '';
        lines.push(`${day.dayOfWeek}: ${day.condition}, ${day.tempLow}-${day.tempHigh}°F, wind ${day.windSpeed} mph${rainNote}`);
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
