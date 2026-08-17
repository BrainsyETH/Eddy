// src/lib/gauge-trend.ts
// Plain-language context for a raw gauge reading. A bare number ("1.8 ft")
// doesn't tell a paddler whether the river is getting better or worse, or
// whether today is unusual — this turns it into an actionable signal:
//   "Rising fast · 6h"   and   "Below typical · 22nd percentile (14-day)".
// Shared by RiverCard, the gauge detail reading card, and anywhere else a
// reading is shown. Returns null whenever there isn't enough data to say
// something honestly (we never invent a trend from one point).

import type { HistoricalReading } from '@/hooks/useGaugeHistory';

export type GaugeUnit = 'ft' | 'cfs';
export type TrendDirection = 'rising' | 'falling' | 'steady';

export interface GaugeTrend {
  direction: TrendDirection;
  delta: number;
  windowHours: number;
  qualifier: 'fast' | 'slowly' | null;
  /** e.g. "Rising fast", "Falling slowly", "Holding steady". */
  label: string;
}

export interface GaugePercentile {
  percentile: number; // 1..99
  windowDays: number;
  /** e.g. "22nd percentile". */
  label: string;
  /** 1-2 word summary, e.g. "below typical". */
  short: string;
  /** Full sentence fragment, e.g. "below typical for the last 14 days". */
  descriptor: string;
}

function valueFor(r: HistoricalReading, unit: GaugeUnit): number | null {
  return unit === 'cfs' ? r.dischargeCfs : r.gaugeHeightFt;
}

/**
 * Percent-change bands separating a real move from gauge noise. Percent rather
 * than absolute so one rule covers both feet and cfs, whose magnitudes differ by
 * three orders.
 */
export const TREND_STEADY_PCT = 0.03;
export const TREND_FAST_PCT = 0.15;

/**
 * Classify a change as rising/falling/steady with a speed qualifier.
 *
 * Exported because the server derives the SAME trend at a photo's capture time
 * (src/lib/flow-providers/usgs-historical.ts) from a USGS window rather than
 * from `HistoricalReading[]`. Two call sites, one rule — a photo's stored trend
 * and the live trend on the gauge card must never disagree about what counts as
 * "steady".
 */
export function classifyTrend(
  delta: number,
  referenceValue: number,
): { direction: TrendDirection; qualifier: 'fast' | 'slowly' | null } {
  const pct = Math.abs(delta) / Math.max(Math.abs(referenceValue), 1e-6);
  if (pct < TREND_STEADY_PCT) return { direction: 'steady', qualifier: null };
  return {
    direction: delta > 0 ? 'rising' : 'falling',
    qualifier: pct >= TREND_FAST_PCT ? 'fast' : 'slowly',
  };
}

/** "Rising fast", "Falling slowly", "Holding steady". */
export function trendLabel(
  direction: TrendDirection,
  qualifier: 'fast' | 'slowly' | null,
): string {
  if (direction === 'steady') return 'Holding steady';
  return `${direction === 'rising' ? 'Rising' : 'Falling'} ${qualifier}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Trend over roughly the last `targetHours` (default 6h). Uses percent change
 * so it works for both gauge height (ft) and discharge (cfs): <3% reads as
 * steady, >=15% as fast. Returns null when there isn't enough data.
 */
export function computeTrend(
  readings: HistoricalReading[] | undefined | null,
  unit: GaugeUnit,
  targetHours = 6,
): GaugeTrend | null {
  if (!readings || readings.length < 2) return null;

  const withValue = readings.filter((r) => valueFor(r, unit) != null);
  if (withValue.length < 2) return null;

  // API returns readings chronologically ascending → last is most recent.
  const latest = withValue[withValue.length - 1];
  const latestVal = valueFor(latest, unit)!;
  const latestTime = new Date(latest.timestamp).getTime();
  const targetTime = latestTime - targetHours * 3_600_000;

  let compare = withValue[0];
  let bestDiff = Infinity;
  for (const r of withValue) {
    const diff = Math.abs(new Date(r.timestamp).getTime() - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      compare = r;
    }
  }

  const compareVal = valueFor(compare, unit)!;
  const windowHours = Math.max(
    1,
    Math.round((latestTime - new Date(compare.timestamp).getTime()) / 3_600_000),
  );

  const delta = latestVal - compareVal;
  const { direction, qualifier } = classifyTrend(delta, latestVal);

  return { direction, delta, windowHours, qualifier, label: trendLabel(direction, qualifier) };
}

/**
 * Where the current value sits within the recent history window. Honest label:
 * "for the last N days" (NOT "for the season" — we only have the fetched window).
 * Returns null when there isn't enough history to be meaningful.
 */
export function computePercentile(
  readings: HistoricalReading[] | undefined | null,
  currentValue: number | null,
  unit: GaugeUnit,
  windowDays = 14,
): GaugePercentile | null {
  if (currentValue == null || !readings || readings.length < 12) return null;

  const values = readings
    .map((r) => valueFor(r, unit))
    .filter((v): v is number => v != null);
  if (values.length < 12) return null;

  const atOrBelow = values.filter((v) => v <= currentValue).length;
  const percentile = Math.min(99, Math.max(1, Math.round((atOrBelow / values.length) * 100)));

  let short: string;
  if (percentile <= 15) short = 'near the low end';
  else if (percentile < 40) short = 'below typical';
  else if (percentile <= 60) short = 'about typical';
  else if (percentile < 85) short = 'above typical';
  else short = 'near the high end';

  return {
    percentile,
    windowDays,
    label: `${ordinal(percentile)} percentile`,
    short,
    descriptor: `${short} for the last ${windowDays} days`,
  };
}
