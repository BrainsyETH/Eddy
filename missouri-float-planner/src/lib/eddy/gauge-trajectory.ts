// src/lib/eddy/gauge-trajectory.ts
// Builds a rich gauge trajectory summary from 10 days of USGS data + historical percentiles.
// Replaces the old 2-reading trend comparison with real trajectory analysis.

import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchHistoricalReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
  type HistoricalReading,
  type DailyStatistics,
} from '@/lib/usgs/gauges';

export interface GaugeTrajectory {
  /** Change in gauge height over last 24 hours (ft) */
  change24h: number | null;
  /** Change in gauge height over last 6 hours (ft) */
  change6h: number | null;
  /** Rate of change over last 3 hours (ft/hr) */
  rateFtPerHour: number | null;
  /** Acceleration descriptor */
  acceleration: 'rising and accelerating' | 'rising but slowing' | 'falling and accelerating' | 'falling but slowing' | 'steady' | null;
  /** Highest reading in 10-day window */
  peak48h: { heightFt: number; timestamp: string } | null;
  /** Lowest reading in 10-day window */
  trough48h: { heightFt: number; timestamp: string } | null;
  /** Current gauge height */
  currentHeightFt: number | null;
  /** One-sentence trajectory narrative for the prompt */
  narrative: string;
  /** Percentile context for current discharge */
  percentileContext: string | null;
  /** Raw percentile value */
  percentile: number | null;
  /** Daily statistics for reference */
  stats: DailyStatistics | null;
}

/**
 * Builds a rich trajectory summary for a river's primary gauge.
 * Fetches 10 days of USGS history + daily statistics, then computes
 * trend direction, rate, acceleration, and a narrative summary.
 */
export async function buildGaugeTrajectory(riverSlug: string): Promise<GaugeTrajectory | null> {
  try {
    const supabase = createAdminClient();

    // Look up primary gauge station for this river
    const { data: riverData } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', riverSlug)
      .single();

    if (!riverData) return null;

    const { data: gaugeLink } = await supabase
      .from('river_gauges')
      .select('gauge_stations (id, usgs_site_id)')
      .eq('river_id', riverData.id)
      .eq('is_primary', true)
      .single();

    if (!gaugeLink) return null;

    const station = Array.isArray(gaugeLink.gauge_stations)
      ? gaugeLink.gauge_stations[0]
      : gaugeLink.gauge_stations;

    if (!station?.usgs_site_id) return null;

    // Fetch 48h of historical data (reuses existing USGS function)
    const historical = await fetchHistoricalReadings(station.usgs_site_id, 10);
    if (!historical || historical.readings.length < 4) {
      return null; // Not enough data points
    }

    // Fetch daily statistics for percentile context
    const stats = await fetchDailyStatistics(station.usgs_site_id).catch(() => null);

    // Downsample to hourly: pick the reading closest to each hour mark
    const hourly = downsampleToHourly(historical.readings);

    if (hourly.length < 2) return null;

    const now = Date.now();
    const current = hourly[hourly.length - 1];
    const currentHeight = current.gaugeHeightFt;

    if (currentHeight === null) return null;

    // Find readings at approximate time offsets
    const reading6hAgo = findReadingAtOffset(hourly, now, 6);
    const reading24hAgo = findReadingAtOffset(hourly, now, 24);

    // Compute changes
    const change6h = reading6hAgo?.gaugeHeightFt != null
      ? currentHeight - reading6hAgo.gaugeHeightFt
      : null;
    const change24h = reading24hAgo?.gaugeHeightFt != null
      ? currentHeight - reading24hAgo.gaugeHeightFt
      : null;

    // Rate of change: average slope over last 3 hours
    const rateLast3h = computeRate(hourly, now, 3);
    const ratePrior3h = computeRate(hourly, now - 3 * 3600 * 1000, 3);

    // Acceleration: compare recent rate to prior rate
    const acceleration = computeAcceleration(rateLast3h, ratePrior3h);

    // Peak and trough in the 48h window
    const peak48h = findExtreme(historical.readings, 'max');
    const trough48h = findExtreme(historical.readings, 'min');

    // Percentile context
    let percentile: number | null = null;
    let percentileContext: string | null = null;
    const currentDischarge = current.dischargeCfs;

    if (stats && currentDischarge != null) {
      percentile = calculateDischargePercentile(currentDischarge, stats);
      if (percentile != null && stats.p50 != null) {
        const yearsNote = stats.yearsOfRecord ? ` (${Math.round(stats.yearsOfRecord)} years of record)` : '';
        percentileContext =
          `Current discharge of ${currentDischarge.toLocaleString()} cfs is at the ` +
          `${ordinal(percentile)} percentile for this date. ` +
          `Median: ${stats.p50.toLocaleString()} cfs${yearsNote}.`;
      }
    }

    // Build narrative
    const narrative = buildNarrative(currentHeight, change24h, change6h, rateLast3h, acceleration, peak48h, trough48h);

    return {
      change24h,
      change6h,
      rateFtPerHour: rateLast3h,
      acceleration,
      peak48h,
      trough48h,
      currentHeightFt: currentHeight,
      narrative,
      percentileContext,
      percentile,
      stats,
    };
  } catch (e) {
    console.warn(`[GaugeTrajectory] Failed for ${riverSlug}:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function downsampleToHourly(readings: HistoricalReading[]): HistoricalReading[] {
  if (readings.length === 0) return [];

  const hourBuckets = new Map<string, HistoricalReading>();

  for (const r of readings) {
    const ts = new Date(r.timestamp);
    // Round to nearest hour
    const hourKey = new Date(
      ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours()
    ).toISOString();

    // Keep the reading closest to the hour mark
    const existing = hourBuckets.get(hourKey);
    if (!existing) {
      hourBuckets.set(hourKey, r);
    } else {
      const hourTs = new Date(hourKey).getTime();
      const existingDist = Math.abs(new Date(existing.timestamp).getTime() - hourTs);
      const newDist = Math.abs(ts.getTime() - hourTs);
      if (newDist < existingDist) {
        hourBuckets.set(hourKey, r);
      }
    }
  }

  return Array.from(hourBuckets.values())
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function findReadingAtOffset(
  hourly: HistoricalReading[],
  fromMs: number,
  hoursAgo: number
): HistoricalReading | null {
  const targetMs = fromMs - hoursAgo * 3600 * 1000;
  let closest: HistoricalReading | null = null;
  let closestDist = Infinity;

  for (const r of hourly) {
    const dist = Math.abs(new Date(r.timestamp).getTime() - targetMs);
    // Only consider readings within 1.5 hours of the target
    if (dist < 1.5 * 3600 * 1000 && dist < closestDist) {
      closest = r;
      closestDist = dist;
    }
  }

  return closest;
}

function computeRate(
  hourly: HistoricalReading[],
  endMs: number,
  windowHours: number
): number | null {
  const startMs = endMs - windowHours * 3600 * 1000;

  // Find readings within the window
  const windowReadings = hourly.filter((r) => {
    const ts = new Date(r.timestamp).getTime();
    return ts >= startMs - 0.5 * 3600 * 1000 &&
           ts <= endMs + 0.5 * 3600 * 1000 &&
           r.gaugeHeightFt != null;
  });

  if (windowReadings.length < 2) return null;

  const first = windowReadings[0];
  const last = windowReadings[windowReadings.length - 1];

  if (first.gaugeHeightFt == null || last.gaugeHeightFt == null) return null;

  const hoursElapsed =
    (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / (3600 * 1000);

  if (hoursElapsed < 0.5) return null;

  return (last.gaugeHeightFt - first.gaugeHeightFt) / hoursElapsed;
}

function computeAcceleration(
  recentRate: number | null,
  priorRate: number | null
): GaugeTrajectory['acceleration'] {
  if (recentRate == null) return null;

  const absRate = Math.abs(recentRate);
  if (absRate < 0.05) return 'steady';

  if (priorRate == null) {
    return recentRate > 0 ? 'rising but slowing' : 'falling but slowing';
  }

  const absRecentRate = Math.abs(recentRate);
  const absPriorRate = Math.abs(priorRate);

  if (recentRate > 0.05) {
    return absRecentRate > absPriorRate + 0.03 ? 'rising and accelerating' : 'rising but slowing';
  } else {
    return absRecentRate > absPriorRate + 0.03 ? 'falling and accelerating' : 'falling but slowing';
  }
}

function findExtreme(
  readings: HistoricalReading[],
  type: 'max' | 'min'
): { heightFt: number; timestamp: string } | null {
  let best: { heightFt: number; timestamp: string } | null = null;

  for (const r of readings) {
    if (r.gaugeHeightFt == null) continue;
    if (
      best === null ||
      (type === 'max' && r.gaugeHeightFt > best.heightFt) ||
      (type === 'min' && r.gaugeHeightFt < best.heightFt)
    ) {
      best = { heightFt: r.gaugeHeightFt, timestamp: r.timestamp };
    }
  }

  return best;
}

function buildNarrative(
  currentHeight: number,
  change24h: number | null,
  change6h: number | null,
  rate: number | null,
  acceleration: GaugeTrajectory['acceleration'],
  peak: { heightFt: number; timestamp: string } | null,
  trough: { heightFt: number; timestamp: string } | null,
): string {
  const parts: string[] = [];

  // Describe the 24h trajectory
  if (change24h != null && Math.abs(change24h) >= 0.1) {
    const startHeight = currentHeight - change24h;
    const direction = change24h > 0 ? 'rose' : 'fell';
    parts.push(
      `Gauge ${direction} from ${startHeight.toFixed(1)} to ${currentHeight.toFixed(1)} ft over the past 24 hours`
    );
  } else if (change24h != null) {
    parts.push(`Gauge has held steady near ${currentHeight.toFixed(1)} ft over the past 24 hours`);
  } else {
    parts.push(`Currently reading ${currentHeight.toFixed(1)} ft`);
  }

  // Describe current rate and acceleration
  if (rate != null && Math.abs(rate) >= 0.05 && acceleration && acceleration !== 'steady') {
    parts.push(`${acceleration} at ${Math.abs(rate).toFixed(2)} ft/hr`);
  } else if (rate != null && Math.abs(rate) < 0.05) {
    parts.push('now holding steady');
  }

  // Note significant peak if different from current
  if (peak && Math.abs(peak.heightFt - currentHeight) >= 0.3) {
    const peakTime = formatTimeAgo(peak.timestamp);
    parts.push(`peaked at ${peak.heightFt.toFixed(1)} ft ${peakTime}`);
  }

  // Note significant trough if different from current and not the same event as peak
  if (trough && Math.abs(trough.heightFt - currentHeight) >= 0.3 && (!peak || trough.timestamp !== peak.timestamp)) {
    const troughTime = formatTimeAgo(trough.timestamp);
    parts.push(`low point of ${trough.heightFt.toFixed(1)} ft ${troughTime}`);
  }

  return parts.join(', ') + '.';
}

function formatTimeAgo(timestamp: string): string {
  const hoursAgo = (Date.now() - new Date(timestamp).getTime()) / (3600 * 1000);

  if (hoursAgo < 1) return 'less than an hour ago';
  if (hoursAgo < 2) return 'about an hour ago';
  if (hoursAgo < 24) return `about ${Math.round(hoursAgo)} hours ago`;
  if (hoursAgo < 48) return 'yesterday';
  return `${Math.round(hoursAgo / 24)} days ago`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
