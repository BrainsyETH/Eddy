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
  const pct = Math.abs(delta) / Math.max(Math.abs(latestVal), 1e-6);

  let direction: TrendDirection;
  let qualifier: 'fast' | 'slowly' | null;
  if (pct < 0.03) {
    direction = 'steady';
    qualifier = null;
  } else {
    direction = delta > 0 ? 'rising' : 'falling';
    qualifier = pct >= 0.15 ? 'fast' : 'slowly';
  }

  const label =
    direction === 'steady'
      ? 'Holding steady'
      : `${direction === 'rising' ? 'Rising' : 'Falling'} ${qualifier}`;

  return { direction, delta, windowHours, qualifier, label };
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
