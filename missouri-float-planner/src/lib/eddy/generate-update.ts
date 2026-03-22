// src/lib/eddy/generate-update.ts
// Orchestrates data gathering and calls Claude Haiku to generate Eddy updates.
// Used by the cron job to produce per-river (or per-section) condition quotes.

import Anthropic from '@anthropic-ai/sdk';
import type { ConditionCode } from '@/types/api';
import { RIVER_NOTES } from '@/data/eddy-quotes';
import type { UpdateTarget } from '@/data/river-sections';
import { fetchNWSAlerts, filterAlertsForRiver, type NWSAlert } from '@/lib/nws/alerts';
import { fetchWeather, fetchForecast, getCityForRiver, type WeatherData, type ForecastData } from '@/lib/weather/openweather';
import { fetchPrecipitationFromWeather, type PrecipitationSummary } from '@/lib/weather/openweather';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeForTarget } from '@/lib/eddy/knowledge';
import { buildGaugeTrajectory, type GaugeTrajectory } from '@/lib/eddy/gauge-trajectory';


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

export interface GeneratedUpdate {
  riverSlug: string;
  sectionSlug: string | null;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  quoteText: string;
  summaryText: string | null;
  sourcesUsed: string[];
}

/**
 * Gathers all context data for a river/section and generates an Eddy quote via Haiku.
 */
export async function generateEddyUpdate(
  target: UpdateTarget,
): Promise<GeneratedUpdate | null> {
  const sourcesUsed: string[] = [];

  // --- 1. Fetch gauge data ---
  const gaugeContext = await fetchGaugeContext(target.riverSlug);
  if (gaugeContext) sourcesUsed.push('USGS gauge');

  // --- 2. Fetch weather (current + 3-day forecast) ---
  let weather: WeatherData | null = null;
  let forecast: ForecastData | null = null;
  let precipitation: PrecipitationSummary | null = null;
  const cityInfo = getCityForRiver(target.riverSlug);
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

  // --- 3. Fetch NWS alerts ---
  let alerts: NWSAlert[] = [];
  try {
    const allAlerts = await fetchNWSAlerts();
    alerts = filterAlertsForRiver(allAlerts, target.riverSlug);
    if (alerts.length > 0) sourcesUsed.push('NWS alerts');
  } catch (e) {
    console.warn('[EddyGen] NWS alert fetch failed:', e);
  }

  // --- 4. Load local knowledge ---
  const localKnowledge = getKnowledgeForTarget(target.riverSlug, target.sectionSlug);
  if (localKnowledge) sourcesUsed.push('local knowledge');

  // --- 5. Fetch gauge trajectory (48h history + percentiles) ---
  let trajectory: GaugeTrajectory | null = null;
  if (gaugeContext) {
    trajectory = await buildGaugeTrajectory(target.riverSlug);
    if (trajectory) sourcesUsed.push('gauge trajectory');
  }

  // --- 6. Build the prompt ---
  const prompt = buildPrompt(target, gaugeContext, weather, forecast, alerts, localKnowledge, trajectory, precipitation);

  // --- 7. Call Claude Haiku ---
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('[EddyGen] ANTHROPIC_API_KEY not configured');
    return null;
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
      system: EDDY_SYSTEM_PROMPT,
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    // Strip em dashes that slip through despite prompt instructions
    const rawText = textBlock?.text?.trim().replace(/\u2014/g, ',') || null;

    if (!rawText) {
      console.error(`[EddyGen] Empty response for ${target.riverSlug}/${target.sectionSlug}`);
      return null;
    }

    // Parse summary and full text from the model output
    const { summaryText, quoteText } = parseEddyResponse(rawText);

    // Strip any stray [FULL] / [SUMMARY] markers that leaked into parsed text
    const cleanMarkers = (t: string) => t.replace(/\[(?:FULL|SUMMARY)\]/gi, '').trim();

    return {
      riverSlug: target.riverSlug,
      sectionSlug: target.sectionSlug,
      conditionCode: gaugeContext?.conditionCode ?? 'unknown',
      gaugeHeightFt: gaugeContext?.gaugeHeightFt ?? null,
      dischargeCfs: gaugeContext?.dischargeCfs ?? null,
      quoteText: cleanMarkers(quoteText),
      summaryText: summaryText ? cleanMarkers(summaryText) : null,
      sourcesUsed,
    };
  } catch (e) {
    console.error(`[EddyGen] Haiku call failed for ${target.riverSlug}:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Response parser — extracts summary + full text from Haiku output
// ---------------------------------------------------------------------------

/**
 * Parses the raw model response into summary and full report text.
 * Tries multiple strategies in order of specificity:
 *  1. [SUMMARY] / [FULL] block markers (preferred, unambiguous)
 *  2. Legacy --- delimiter (backward compat with cached/in-flight responses)
 *  3. Fallback: first sentence as summary, full text as quote
 */
export function parseEddyResponse(rawText: string): {
  summaryText: string | null;
  quoteText: string;
} {
  // Strategy 1: [SUMMARY] and [FULL] block markers
  const summaryMatch = rawText.match(/\[SUMMARY\]\s*\n?([\s\S]*?)(?=\[FULL\])/i);
  const fullMatch = rawText.match(/\[FULL\]\s*\n?([\s\S]*?)$/i);

  if (summaryMatch && fullMatch) {
    const summary = summaryMatch[1].trim();
    const full = fullMatch[1].trim();
    if (summary && full) {
      return { summaryText: summary, quoteText: full };
    }
  }

  // Strategy 2: Legacy --- delimiter (single occurrence on its own line)
  // Only match --- that appears as a line separator, not inside text
  const legacyMatch = rawText.match(/^([\s\S]+?)\n\s*---\s*\n([\s\S]+)$/);
  if (legacyMatch) {
    const summary = legacyMatch[1].trim();
    const full = legacyMatch[2].trim();
    if (summary && full) {
      console.warn('[EddyGen] Parsed using legacy --- delimiter; model may not be following new format');
      return { summaryText: summary, quoteText: full };
    }
  }

  // Strategy 3: Fallback — extract first sentence as summary
  // This ensures we always populate both fields even if the model ignores the format
  const firstSentenceEnd = rawText.match(/[.!?](?:\s|$)/);
  if (firstSentenceEnd && firstSentenceEnd.index !== undefined) {
    const cutoff = firstSentenceEnd.index + 1;
    const candidate = rawText.slice(0, cutoff).trim();
    const remainder = rawText.slice(cutoff).trim();
    // Only split if the remainder is meaningfully longer (not just a fragment)
    if (remainder.length > 40 && candidate.length <= 140) {
      console.warn('[EddyGen] Model did not use expected format; falling back to first-sentence extraction');
      return { summaryText: candidate, quoteText: rawText };
    }
  }

  // Last resort: no summary, entire text as quote
  console.warn('[EddyGen] Could not extract summary from model output; storing as quote_text only');
  return { summaryText: null, quoteText: rawText };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const EDDY_SYSTEM_PROMPT = `You are Eddy, an AI otter mascot for a Missouri Ozarks float trip planning app. You provide condition updates for Missouri rivers.

VOICE: Friendly, knowledgeable, concise. Like a local outfitter who checks gauges every morning. Not overly casual, not corporate. Use river terminology naturally: put-in, take-out, gauge, riffle, gravel bar.

OUTPUT FORMAT (strict):
Your response MUST contain exactly two labeled blocks. Use the markers [SUMMARY] and [FULL] on their own lines, each followed by the text for that section. No other formatting, labels, or wrapping.
IMPORTANT: [SUMMARY] and [FULL] are one-time section headers, not tags. Use each exactly once at the start of its section. Do NOT repeat them, use them as closing markers, or include the literal text "[FULL]" or "[SUMMARY]" anywhere in your prose.

[SUMMARY]
A single sentence, under 120 characters. This is for share cards and compact views.

[FULL]
4-6 sentences with details, trends, and context. Do not exceed 6 sentences. Pick the 2-3 most important points, not everything.

Example response:

[SUMMARY]
Gauge reads 2.5 ft, right in the sweet spot. Great day to float.

[FULL]
Reading 2.5 ft at Akers, right in the optimal range of 2.0 to 3.0 ft. The gauge has held steady over the past 24 hours and the trend is flat, so expect consistent conditions through the weekend. Water clarity is excellent with good depth over the riffles. No significant rain in the forecast through Friday, so the river should hold right where it is. Pack the sunscreen, it is 85 and clear out there.

CONDITION ASSESSMENT:
- Match your language to the condition code provided. If the code is "high", say it IS high water, not "approaching high." If "dangerous", say "stay off the water" with zero hedging.
- State the condition clearly in the first sentence of both the summary and the full text.
- If there are active NWS flood alerts, lead with safety first.
- Cite the actual gauge reading and what it means for floating.
- For high water: use "use caution" language rather than "experienced paddlers only." High water deserves a clear warning but not a blanket restriction unless conditions are solidly high or approaching dangerous.
- For "low" conditions: The river IS floatable. Low water means scraping on gravel bars, dragging over shallow spots, and picking your line through riffles. Frame this as practical information, not a reason to stay home. Mention that lighter craft (kayaks, canoes) handle low water better than rafts. Do NOT say "too low to run," "wait for rain," or recommend against floating when the condition code is "low." That language is reserved for "too_low" only.
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
- If rising: explain what rising water means for hazards — stronger current, more debris, undercut banks, strainers harder to avoid. Rising water after dry conditions could mean incoming flooding upstream.
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
- Your entire output must be ONLY the [SUMMARY] and [FULL] blocks. Nothing else.`;

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
): string {
  const riverNotes = RIVER_NOTES[target.riverSlug];
  const lines: string[] = [];

  // Date context so the model can reference day of week, season, etc.
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
  lines.push(`Date: ${dayOfWeek}, ${dateStr}`);
  lines.push('');

  lines.push(`Generate an Eddy condition update for: ${target.riverName}`);
  if (target.sectionName) {
    lines.push(`Section: ${target.sectionName}`);
  }
  if (target.sectionDescription) {
    lines.push(`Section context: ${target.sectionDescription}`);
  }

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

// ---------------------------------------------------------------------------
// Gauge context fetcher
// ---------------------------------------------------------------------------

/**
 * Fetches the latest gauge reading and computes condition for a river.
 */
async function fetchGaugeContext(riverSlug: string): Promise<GaugeContext | null> {
  const supabase = createAdminClient();

  // Get primary gauge for river
  const { data: riverData, error: riverError } = await supabase
    .from('rivers')
    .select('id')
    .eq('slug', riverSlug)
    .single();

  if (!riverData) {
    console.warn(`[EddyGen] River not found for slug "${riverSlug}":`, riverError?.message);
    return null;
  }

  const { data: gaugeLink, error: gaugeLinkError } = await supabase
    .from('river_gauges')
    .select(`
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit,
      gauge_stations (id, name, usgs_site_id)
    `)
    .eq('river_id', riverData.id)
    .eq('is_primary', true)
    .single();

  if (!gaugeLink) {
    console.warn(`[EddyGen] No primary gauge for river "${riverSlug}" (river_id: ${riverData.id}):`, gaugeLinkError?.message);
    return null;
  }

  const station = Array.isArray(gaugeLink.gauge_stations)
    ? gaugeLink.gauge_stations[0]
    : gaugeLink.gauge_stations;

  if (!station?.usgs_site_id) {
    console.warn(`[EddyGen] Gauge station missing usgs_site_id for river "${riverSlug}"`);
    return null;
  }

  // Try DB reading first, fall back to live USGS
  const { data: dbReading } = await supabase
    .from('gauge_readings')
    .select('gauge_height_ft, discharge_cfs, reading_timestamp')
    .eq('gauge_station_id', station.id)
    .order('reading_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  let gaugeHeightFt = dbReading?.gauge_height_ft ?? null;
  let dischargeCfs = dbReading?.discharge_cfs ?? null;
  let readingTimestamp = dbReading?.reading_timestamp ?? null;

  // If DB reading is stale (>2 hours), try live USGS
  const ageMs = readingTimestamp ? Date.now() - new Date(readingTimestamp).getTime() : Infinity;
  if (ageMs > 2 * 60 * 60 * 1000) {
    try {
      const liveReadings = await fetchGaugeReadings([station.usgs_site_id], { skipCache: true });
      const live = liveReadings[0];
      if (live) {
        // Accept any available data from USGS (height, discharge, or both)
        if (live.gaugeHeightFt !== null && live.gaugeHeightFt !== undefined) {
          gaugeHeightFt = live.gaugeHeightFt;
        }
        if (live.dischargeCfs !== null && live.dischargeCfs !== undefined) {
          dischargeCfs = live.dischargeCfs;
        }
        if (live.readingTimestamp) {
          readingTimestamp = live.readingTimestamp;
        }
      }
    } catch (e) {
      console.warn(`[EddyGen] Live USGS fetch failed for ${station.usgs_site_id}:`, e);
    }
  }

  // Compute condition code — pass both height and discharge for threshold_unit awareness
  const thresholds: ConditionThresholds = {
    levelTooLow: gaugeLink.level_too_low,
    levelLow: gaugeLink.level_low,
    levelOptimalMin: gaugeLink.level_optimal_min,
    levelOptimalMax: gaugeLink.level_optimal_max,
    levelHigh: gaugeLink.level_high,
    levelDangerous: gaugeLink.level_dangerous,
    thresholdUnit: (gaugeLink as Record<string, unknown>).threshold_unit as 'ft' | 'cfs' | undefined,
  };

  const condition = computeCondition(gaugeHeightFt, thresholds, dischargeCfs);

  // Build optimal range from actual DB thresholds, not hardcoded values
  const unit = gaugeLink.threshold_unit === 'cfs' ? 'cfs' : 'ft';
  const optMin = gaugeLink.level_optimal_min;
  const optMax = gaugeLink.level_optimal_max;
  const optimalRange = (optMin != null && optMax != null)
    ? `${optMin}–${optMax} ${unit}`
    : 'unknown';

  return {
    gaugeName: station.name || 'Unknown gauge',
    gaugeHeightFt,
    dischargeCfs,
    conditionCode: condition.code as ConditionCode,
    conditionLabel: condition.label,
    readingTimestamp,
    optimalRange,
    closureLevel: gaugeLink.level_dangerous ?? null,
    notes: RIVER_NOTES[riverSlug] ?? null,
  };
}
