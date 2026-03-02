// src/lib/eddy/generate-update.ts
// Orchestrates data gathering and calls Claude Haiku to generate Eddy updates.
// Used by the cron job to produce per-river (or per-section) condition quotes.

import Anthropic from '@anthropic-ai/sdk';
import type { ConditionCode } from '@/types/api';
import { RIVER_KNOWLEDGE } from '@/data/eddy-quotes';
import type { UpdateTarget } from '@/data/river-sections';
import { fetchNWSAlerts, filterAlertsForRiver, type NWSAlert } from '@/lib/nws/alerts';
import { fetchWeather, fetchForecast, getCityForRiver, type WeatherData, type ForecastData } from '@/lib/weather/openweather';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeForTarget } from '@/lib/eddy/knowledge';

export interface GaugeContext {
  gaugeName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  conditionCode: ConditionCode;
  conditionLabel: string;
  readingTimestamp: string | null;
  optimalRange: string;
}

export interface GeneratedUpdate {
  riverSlug: string;
  sectionSlug: string | null;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  quoteText: string;
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
  const cityInfo = getCityForRiver(target.riverSlug);
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (cityInfo && apiKey) {
    try {
      [weather, forecast] = await Promise.all([
        fetchWeather(cityInfo.lat, cityInfo.lon, apiKey),
        fetchForecast(cityInfo.lat, cityInfo.lon, apiKey).catch(() => null),
      ]);
      sourcesUsed.push('OpenWeather');
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

  // --- 5. Fetch gauge trend (rising/falling/steady) ---
  let trendLabel: string | null = null;
  if (gaugeContext) {
    trendLabel = await fetchGaugeTrend(target.riverSlug);
  }

  // --- 6. Build the prompt ---
  const prompt = buildPrompt(target, gaugeContext, weather, forecast, alerts, localKnowledge, trendLabel);

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
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
      system: EDDY_SYSTEM_PROMPT,
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    // Strip em dashes that slip through despite prompt instructions
    const quoteText = textBlock?.text?.trim().replace(/\u2014/g, ',') || null;

    if (!quoteText) {
      console.error(`[EddyGen] Empty response for ${target.riverSlug}/${target.sectionSlug}`);
      return null;
    }

    return {
      riverSlug: target.riverSlug,
      sectionSlug: target.sectionSlug,
      conditionCode: gaugeContext?.conditionCode ?? 'unknown',
      gaugeHeightFt: gaugeContext?.gaugeHeightFt ?? null,
      dischargeCfs: gaugeContext?.dischargeCfs ?? null,
      quoteText,
      sourcesUsed,
    };
  } catch (e) {
    console.error(`[EddyGen] Haiku call failed for ${target.riverSlug}:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EDDY_SYSTEM_PROMPT = `You are Eddy, an AI otter mascot for a Missouri Ozarks float trip planning app. You provide condition updates for Missouri rivers.

VOICE: Friendly, knowledgeable, concise. Like a local outfitter who checks gauges every morning. Not overly casual, not corporate. Use river terminology naturally: put-in, take-out, gauge, riffle, gravel bar.

RULES:
- Write 4-6 sentences. Aim for a substantive update, not a blurb.
- Lead with the current condition assessment.
- Mention the gauge reading and what it means for floating.
- If a trend is provided (rising, falling, steady), weave it in — it changes the story.
- If weather is relevant (rain incoming, extreme heat, storms), mention it. If a 3-day forecast is provided, reference upcoming conditions that could affect floating (e.g. "rain expected Thursday could push the gauge up").
- If there are active NWS flood alerts, lead with safety first.
- If conditions are dangerous, be unambiguous: "Stay off the water."
- Cite actual numbers (gauge height, temp) — don't be vague.
- Incorporate local knowledge naturally — mention specific landmarks, springs, or sections when relevant.
- If section-specific context is provided, tailor your advice to that section.
- Vary your phrasing and structure from update to update. Do not start every update the same way.
- Do NOT use em dashes (—). Use commas, periods, or "and" instead.
- Do NOT use emojis, hashtags, or exclamation marks.
- Do NOT include a greeting or sign-off.
- Do NOT say "I" or refer to yourself. Speak in third person if needed ("Eddy recommends...") or just state facts.
- Output ONLY the quote text. No labels, no formatting, no quotes around it.`;

function buildPrompt(
  target: UpdateTarget,
  gauge: GaugeContext | null,
  weather: WeatherData | null,
  forecast: ForecastData | null,
  alerts: NWSAlert[],
  localKnowledge: string,
  trendLabel: string | null = null,
): string {
  const gaugeKnowledge = RIVER_KNOWLEDGE[target.riverSlug];
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
  lines.push('--- CURRENT DATA ---');

  // Gauge data
  if (gauge) {
    lines.push(`Gauge: ${gauge.gaugeName}`);
    lines.push(`Height: ${gauge.gaugeHeightFt !== null ? gauge.gaugeHeightFt.toFixed(1) + ' ft' : 'unavailable'}`);
    if (gauge.dischargeCfs !== null) {
      lines.push(`Discharge: ${gauge.dischargeCfs} cfs`);
    }
    lines.push(`Condition: ${gauge.conditionLabel} (${gauge.conditionCode})`);
    lines.push(`Optimal range: ${gauge.optimalRange}`);
    if (gauge.readingTimestamp) {
      const ageHours = (Date.now() - new Date(gauge.readingTimestamp).getTime()) / (1000 * 60 * 60);
      if (ageHours > 6) {
        lines.push(`WARNING: Reading is ${Math.round(ageHours)} hours old — data may be stale.`);
      }
    }
  } else {
    lines.push('Gauge data: unavailable');
  }

  // Gauge trend
  if (trendLabel) {
    lines.push(`Trend: ${trendLabel}`);
  }

  // Gauge threshold knowledge
  if (gaugeKnowledge) {
    lines.push(`Gauge notes: ${gaugeKnowledge.notes}`);
    if (gaugeKnowledge.closureLevel) {
      lines.push(`Closure level: ${gaugeKnowledge.closureLevel} ft`);
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
        const rainNote = day.precipitation >= 50
          ? ` (${day.precipitation}% chance of rain)`
          : day.precipitation >= 20
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

/**
 * Fetches the recent gauge trend (rising / falling / steady) by comparing
 * the two most recent readings for the river's primary gauge.
 */
async function fetchGaugeTrend(riverSlug: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    const { data: riverData } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', riverSlug)
      .single();

    if (!riverData) return null;

    const { data: gaugeLink } = await supabase
      .from('river_gauges')
      .select('gauge_stations (id)')
      .eq('river_id', riverData.id)
      .eq('is_primary', true)
      .single();

    if (!gaugeLink) return null;

    const station = Array.isArray(gaugeLink.gauge_stations)
      ? gaugeLink.gauge_stations[0]
      : gaugeLink.gauge_stations;

    if (!station?.id) return null;

    // Get the two most recent readings to determine trend
    const { data: readings } = await supabase
      .from('gauge_readings')
      .select('gauge_height_ft, reading_timestamp')
      .eq('gauge_station_id', station.id)
      .order('reading_timestamp', { ascending: false })
      .limit(2);

    if (!readings || readings.length < 2) return null;

    const newest = readings[0].gauge_height_ft;
    const previous = readings[1].gauge_height_ft;
    if (newest == null || previous == null) return null;

    const delta = newest - previous;
    const absDelta = Math.abs(delta);

    if (absDelta < 0.1) return 'steady (little change)';
    if (delta > 0.5) return `rising quickly (+${delta.toFixed(1)} ft since last reading)`;
    if (delta > 0) return `rising slowly (+${delta.toFixed(1)} ft since last reading)`;
    if (delta < -0.5) return `falling quickly (${delta.toFixed(1)} ft since last reading)`;
    return `falling slowly (${delta.toFixed(1)} ft since last reading)`;
  } catch (e) {
    console.warn(`[EddyGen] Trend fetch failed for ${riverSlug}:`, e);
    return null;
  }
}

/**
 * Fetches the latest gauge reading and computes condition for a river.
 */
async function fetchGaugeContext(riverSlug: string): Promise<GaugeContext | null> {
  const supabase = createAdminClient();
  const knowledge = RIVER_KNOWLEDGE[riverSlug];

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

  return {
    gaugeName: station.name || 'Unknown gauge',
    gaugeHeightFt,
    dischargeCfs,
    conditionCode: condition.code as ConditionCode,
    conditionLabel: condition.label,
    readingTimestamp,
    optimalRange: knowledge?.optimalRange ?? 'unknown',
  };
}
