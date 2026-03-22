// Reel generator — orchestrates data gathering and Remotion Lambda rendering
// Reuses existing Eddy data pipeline functions for gauge, weather, and quote data

import { renderVideo, hasRenderConfig } from './render-client';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  GaugeAnimationProps,
  ConditionAlertProps,
  DailyDigestProps,
  ConditionCode,
  TrendDirection,
  RiverDigestEntry,
} from '@/remotion/lib/types';

interface GaugeContext {
  riverName: string;
  gaugeHeight: number;
  discharge: number | null;
  conditionCode: ConditionCode;
  trendDirection: TrendDirection;
  optimalMin: number;
  optimalMax: number;
  dangerousLevel: number;
}

/**
 * Fetch gauge context for a river from the database.
 */
async function fetchGaugeContextForReel(riverSlug: string): Promise<GaugeContext | null> {
  const supabase = createAdminClient();

  // Get river + primary gauge + thresholds
  const { data: river } = await supabase
    .from('rivers')
    .select('id, name, slug')
    .eq('slug', riverSlug)
    .single();

  if (!river) return null;

  const { data: riverGauge } = await supabase
    .from('river_gauges')
    .select(`
      is_primary, last_condition_code,
      level_optimal_min, level_optimal_max, level_dangerous, level_high,
      threshold_unit,
      gauge_stations (
        gauge_height_ft, discharge_cfs, name
      )
    `)
    .eq('river_id', river.id)
    .eq('is_primary', true)
    .single();

  if (!riverGauge?.gauge_stations) return null;

  // gauge_stations comes back as a single joined object (is_primary=true guarantees one)
  const station = riverGauge.gauge_stations as unknown as { gauge_height_ft: number; discharge_cfs: number; name: string };
  const gaugeHeight = station.gauge_height_ft || 0;
  const discharge = station.discharge_cfs || null;

  // Determine trend from recent readings
  const { data: recentReadings } = await supabase
    .from('gauge_readings')
    .select('gauge_height_ft, reading_timestamp')
    .eq('gauge_station_id', river.id)
    .order('reading_timestamp', { ascending: false })
    .limit(3);

  let trendDirection: TrendDirection = 'stable';
  if (recentReadings && recentReadings.length >= 2) {
    const diff = recentReadings[0].gauge_height_ft - recentReadings[1].gauge_height_ft;
    if (diff > 0.1) trendDirection = 'rising';
    else if (diff < -0.1) trendDirection = 'falling';
  }

  return {
    riverName: river.name,
    gaugeHeight,
    discharge,
    conditionCode: (riverGauge.last_condition_code as ConditionCode) || 'unknown',
    trendDirection,
    optimalMin: riverGauge.level_optimal_min || 2.0,
    optimalMax: riverGauge.level_optimal_max || 4.0,
    dangerousLevel: riverGauge.level_dangerous || riverGauge.level_high || 8.0,
  };
}

/**
 * Get the latest Eddy quote for a river.
 */
async function getLatestEddyQuote(riverSlug: string): Promise<string> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('eddy_updates')
    .select('quote_text, summary_text')
    .eq('river_slug', riverSlug)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  return data?.quote_text || data?.summary_text || 'Check conditions at eddy.guide before you head out.';
}

/**
 * Generate a gauge animation reel for a single river.
 * Returns the Vercel Blob URL of the rendered MP4, or null if rendering is not configured.
 */
export async function generateGaugeReel(riverSlug: string): Promise<string | null> {
  if (!hasRenderConfig()) {
    console.log('[ReelGenerator] Remotion Lambda not configured, skipping reel generation');
    return null;
  }

  const gauge = await fetchGaugeContextForReel(riverSlug);
  if (!gauge) {
    console.error(`[ReelGenerator] No gauge data found for river: ${riverSlug}`);
    return null;
  }

  const quote = await getLatestEddyQuote(riverSlug);

  const inputProps: GaugeAnimationProps = {
    riverName: gauge.riverName,
    gaugeHeight: gauge.gaugeHeight,
    discharge: gauge.discharge,
    conditionCode: gauge.conditionCode,
    eddyQuote: quote,
    trendDirection: gauge.trendDirection,
    optimalMin: gauge.optimalMin,
    optimalMax: gauge.optimalMax,
    dangerousLevel: gauge.dangerousLevel,
    unit: 'ft',
  };

  try {
    const videoUrl = await renderVideo({
      compositionId: 'GaugeAnimation',
      inputProps: inputProps as unknown as Record<string, unknown>,
    });
    console.log(`[ReelGenerator] Gauge reel rendered for ${riverSlug}: ${videoUrl}`);
    return videoUrl;
  } catch (err) {
    console.error(`[ReelGenerator] Failed to render gauge reel for ${riverSlug}:`, err);
    return null;
  }
}

/**
 * Generate a condition alert reel when a river crosses a threshold.
 */
export async function generateConditionAlertReel(
  riverSlug: string,
  previousCondition: ConditionCode,
  newCondition: ConditionCode
): Promise<string | null> {
  if (!hasRenderConfig()) {
    console.log('[ReelGenerator] Remotion Lambda not configured, skipping reel generation');
    return null;
  }

  const gauge = await fetchGaugeContextForReel(riverSlug);
  if (!gauge) {
    console.error(`[ReelGenerator] No gauge data found for river: ${riverSlug}`);
    return null;
  }

  const quote = await getLatestEddyQuote(riverSlug);

  const inputProps: ConditionAlertProps = {
    riverName: gauge.riverName,
    previousCondition,
    newCondition,
    gaugeHeight: gauge.gaugeHeight,
    discharge: gauge.discharge,
    eddyQuote: quote,
  };

  try {
    const videoUrl = await renderVideo({
      compositionId: 'ConditionAlert',
      inputProps: inputProps as unknown as Record<string, unknown>,
    });
    console.log(`[ReelGenerator] Condition alert reel rendered for ${riverSlug}: ${videoUrl}`);
    return videoUrl;
  } catch (err) {
    console.error(`[ReelGenerator] Failed to render condition alert reel for ${riverSlug}:`, err);
    return null;
  }
}

/**
 * Generate a daily digest reel summarizing all rivers.
 */
export async function generateDailyDigestReel(): Promise<string | null> {
  if (!hasRenderConfig()) {
    console.log('[ReelGenerator] Remotion Lambda not configured, skipping reel generation');
    return null;
  }

  const supabase = createAdminClient();

  // Get all active rivers with their gauge data
  const { data: rivers } = await supabase
    .from('rivers')
    .select('id, name, slug, active')
    .eq('active', true)
    .order('name');

  if (!rivers || rivers.length === 0) {
    console.error('[ReelGenerator] No active rivers found for digest reel');
    return null;
  }

  const riverEntries: RiverDigestEntry[] = [];
  let bestRiver: { name: string; condition: ConditionCode } | null = null;

  for (const river of rivers) {
    const gauge = await fetchGaugeContextForReel(river.slug);
    if (!gauge) continue;

    riverEntries.push({
      name: gauge.riverName,
      conditionCode: gauge.conditionCode,
      gaugeHeight: gauge.gaugeHeight,
      trendDirection: gauge.trendDirection,
    });

    // Track "best" river (prefer optimal, then okay)
    if (
      gauge.conditionCode === 'optimal' &&
      (!bestRiver || bestRiver.condition !== 'optimal')
    ) {
      bestRiver = { name: gauge.riverName, condition: gauge.conditionCode };
    } else if (
      gauge.conditionCode === 'okay' &&
      !bestRiver
    ) {
      bestRiver = { name: gauge.riverName, condition: gauge.conditionCode };
    }
  }

  if (riverEntries.length === 0) {
    console.error('[ReelGenerator] No river gauge data available for digest reel');
    return null;
  }

  // Get global Eddy quote
  const globalQuote = await getLatestEddyQuote('global');

  const topPick = bestRiver || { name: riverEntries[0].name, condition: riverEntries[0].conditionCode };

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const inputProps: DailyDigestProps = {
    rivers: riverEntries,
    weatherSummary: 'Check eddy.guide for latest weather',
    topPickRiver: topPick.name,
    topPickCondition: topPick.condition,
    globalQuote,
    date: today,
  };

  try {
    const videoUrl = await renderVideo({
      compositionId: 'DailyDigest',
      inputProps: inputProps as unknown as Record<string, unknown>,
    });
    console.log(`[ReelGenerator] Daily digest reel rendered: ${videoUrl}`);
    return videoUrl;
  } catch (err) {
    console.error('[ReelGenerator] Failed to render daily digest reel:', err);
    return null;
  }
}
