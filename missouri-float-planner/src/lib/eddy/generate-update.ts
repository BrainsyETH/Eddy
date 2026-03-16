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

    // Parse summary and full text from the --- delimiter
    let summaryText: string | null = null;
    let quoteText = rawText;

    const delimiterIndex = rawText.indexOf('---');
    if (delimiterIndex !== -1) {
      summaryText = rawText.slice(0, delimiterIndex).trim();
      quoteText = rawText.slice(delimiterIndex + 3).trim();
    }

    return {
      riverSlug: target.riverSlug,
      sectionSlug: target.sectionSlug,
      conditionCode: gaugeContext?.conditionCode ?? 'unknown',
      gaugeHeightFt: gaugeContext?.gaugeHeightFt ?? null,
      dischargeCfs: gaugeContext?.dischargeCfs ?? null,
      quoteText,
      summaryText,
      sourcesUsed,
    };
  } catch (e) {
    console.error(`[EddyGen] Haiku call failed for ${target.riverSlug}:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const EDDY_SYSTEM_PROMPT = `You are Eddy, an AI otter mascot for a Missouri Ozarks float trip planning app. You provide condition updates for Missouri rivers.

VOICE: Friendly, knowledgeable, concise. Like a local outfitter who checks gauges every morning. Not overly casual, not corporate. Use river terminology naturally: put-in, take-out, gauge, riffle, gravel bar.

OUTPUT FORMAT:
You must output exactly two sections, separated by the delimiter "---". No other formatting.

SUMMARY: A single sentence (under 120 characters) giving the bottom line. This is used for share cards and compact views.
---
FULL: 4-6 sentences with details, trends, and context. Do not exceed 6 sentences. Pick the 2-3 most important points, not everything.

Example output:
Gauge reads 2.5 ft, right in the sweet spot. Great day to float.
---
Reading 2.5 ft at Akers, right in the optimal range of 2.0 to 3.0 ft. Water clarity is excellent with the steady flow and spring-fed base holding strong. The gauge has been steady over the past 24 hours with no significant rain in the forecast through Friday. Upper sections from Montauk to Cedar Grove are running clean with good depth over the riffles. Pack the sunscreen, it is 85 and clear out there.

CONDITION ASSESSMENT:
- Match your language to the condition code provided. If the code is "high", say it IS high water, not "approaching high." If "dangerous", say "stay off the water" with zero hedging.
- State the condition clearly in the first sentence of both the summary and the full text.
- If there are active NWS flood alerts, lead with safety first.
- Cite the actual gauge reading and what it means for floating.

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
- Output ONLY the summary and full text separated by ---. No labels, no quotes.`;

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
  lines.push('--- CURRENT GAUGE DATA ---');

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
  }

  // 48-hour gauge trajectory (replaces old 2-reading trend)
  if (trajectory) {
    lines.push('');
    lines.push('--- 48-HOUR GAUGE TRAJECTORY ---');
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
      lines.push(`48h peak: ${trajectory.peak48h.heightFt.toFixed(1)} ft`);
    }
    if (trajectory.trough48h) {
      lines.push(`48h low: ${trajectory.trough48h.heightFt.toFixed(1)} ft`);
    }
    lines.push(`Summary: ${trajectory.narrative}`);

    // Historical percentile context
    if (trajectory.percentileContext) {
      lines.push('');
      lines.push('--- HISTORICAL CONTEXT ---');
      lines.push(trajectory.percentileContext);
    }
  }

  // Recent precipitation
  if (precipitation && (precipitation.rain1h > 0 || precipitation.rain3h > 0 || precipitation.forecastRainToday > 0)) {
    lines.push('');
    lines.push('--- RECENT PRECIPITATION ---');
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
      lines.push('--- 3-DAY FORECAST ---');
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
    lines.push('--- ACTIVE NWS ALERTS ---');
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
    lines.push('--- LOCAL KNOWLEDGE (use to inform your update, not recite) ---');
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
