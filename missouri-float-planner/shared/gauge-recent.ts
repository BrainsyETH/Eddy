// shared/gauge-recent.ts
//
// What the water has been doing lately, in words — for stations of EITHER tier.
//
// Everything here is a HYDROLOGICAL FACT about a series of readings: which way
// the river is moving, where it crested, how cold it is. None of it is a
// verdict on whether to float, which is why an unrated station may say all of
// it (see shared/flow-band.ts: "Eddy never issues a floatability verdict on an
// uncurated gauge"). Feature roadmap #1451, the first batch.
//
// LIVES IN shared/ for the reason gauge-trend.ts does: eddy-ios reaches this
// folder through `@eddy/conditions` and has no test runner, so pure rules the
// app needs are written here, where the web suite can execute them. Imports stay
// relative and inside shared/.
//
// ── WHAT SERIES THESE MAY BE GIVEN ────────────────────────────────────────
// A window of seven days or less from /api/gauges/[siteId]/history. That route
// samples longer windows by keeping each bucket's MIN AND MAX, so a 30-day
// series is a chain of extrema — fine for finding a crest, wrong for a six-hour
// trend (see the long note on `trend` in eddy-ios GaugeChart, and
// src/lib/gauge/chart-trend-guard.test.ts). Seven days is the range GaugeChart
// already trusts for its own trend, and the sampling preserves peaks, so one
// seven-day request answers both questions here.

import type { ChartReadingLike } from './chart-model';
import type { ReadingUnit } from './reading-unit';
import { computeTrend, type GaugeTrend } from './gauge-trend';

const HOUR_MS = 3_600_000;

function valueFor(reading: ChartReadingLike, unit: ReadingUnit): number | null {
  const value = unit === 'cfs' ? reading.dischargeCfs : reading.gaugeHeightFt;
  return value != null && Number.isFinite(value) ? value : null;
}

function timeOf(reading: ChartReadingLike): number {
  return Date.parse(reading.timestamp);
}

/* ── Direction of travel ─────────────────────────────────────────────────── */

/**
 * The newest reading may be at most this old for a trend to describe "now".
 *
 * The screen already withholds trends when the station's CURRENT reading is
 * stale; this is the same question asked of the series, which comes from a
 * different request and can lag it.
 */
export const TREND_MAX_LATEST_AGE_HOURS = 3;

/**
 * The six-hour trend, or null when the series cannot honestly support one.
 *
 * computeTrend answers from whatever it can find. Two guards, both inherited
 * from GaugeChart rather than invented here:
 *   - the comparison reading must actually sit near six hours back (within
 *     three) — past a twelve-hour gap computeTrend compares the latest reading
 *     with itself and calls a rising river steady, always with a 1h window;
 *   - the newest reading must be recent (TREND_MAX_LATEST_AGE_HOURS), or the
 *     "trend" is about some earlier afternoon.
 */
export function recentTrend(
  readings: readonly ChartReadingLike[] | null | undefined,
  unit: ReadingUnit,
  now: number = Date.now(),
): GaugeTrend | null {
  if (!readings?.length) return null;
  const valued = readings.filter((reading) => valueFor(reading, unit) !== null);
  const latest = valued[valued.length - 1];
  if (!latest) return null;
  const latestAgeHours = (now - timeOf(latest)) / HOUR_MS;
  if (!Number.isFinite(latestAgeHours) || latestAgeHours > TREND_MAX_LATEST_AGE_HOURS) return null;

  const trend = computeTrend(valued, unit);
  return trend && Math.abs(trend.windowHours - 6) <= 3 ? trend : null;
}

/* ── The last crest ──────────────────────────────────────────────────────── */

export interface RecentPeak {
  value: number;
  unit: ReadingUnit;
  /** ISO timestamp of the crest reading. */
  at: string;
  hoursAgo: number;
}

/**
 * How big a rise-and-fall must be before it is worth naming.
 *
 * Discharge is proportional — a 25% swing means as much on a creek as on the
 * Missouri. Stage is not: it is measured from an arbitrary station datum, so a
 * percentage of "2.5 ft" says nothing, and a fixed half foot is used instead.
 * The same distinction gauge-trend.ts sidesteps by speaking only in percent,
 * which is fine for a direction and wrong for a magnitude.
 */
export const PEAK_MIN_RATIO_CFS = 1.25;
export const PEAK_MIN_RISE_FT = 0.5;

/** A crest younger than this is the river still coming down — the trend's job. */
export const PEAK_MIN_AGE_HOURS = 6;

function meaningfullyAbove(high: number, low: number, unit: ReadingUnit): boolean {
  if (unit === 'cfs') return low > 0 ? high / low >= PEAK_MIN_RATIO_CFS : high > 0;
  return high - low >= PEAK_MIN_RISE_FT;
}

/**
 * The highest reading in the window, when it was a real crest.
 *
 * A REAL crest means the river rose to it AND has come down from it since:
 * meaningfully above the lowest reading before it and above the latest
 * reading. Without the first half, a river falling all week reports its
 * opening value as a "peak" it never had; without the second, a river at its
 * highest right now reports a peak that is just the current reading.
 */
export function recentPeak(
  readings: readonly ChartReadingLike[] | null | undefined,
  unit: ReadingUnit,
  now: number = Date.now(),
): RecentPeak | null {
  if (!readings?.length) return null;
  const valued = readings
    .map((reading) => ({ reading, value: valueFor(reading, unit), t: timeOf(reading) }))
    .filter((point): point is { reading: ChartReadingLike; value: number; t: number } =>
      point.value !== null && Number.isFinite(point.t),
    );
  if (valued.length < 3) return null;

  let peakIndex = 0;
  for (let i = 1; i < valued.length; i++) {
    if (valued[i].value > valued[peakIndex].value) peakIndex = i;
  }
  const peak = valued[peakIndex];
  const latest = valued[valued.length - 1];
  if (peakIndex === 0 || peakIndex === valued.length - 1) return null;

  const lowBefore = Math.min(...valued.slice(0, peakIndex).map((point) => point.value));
  if (!meaningfullyAbove(peak.value, lowBefore, unit)) return null;
  if (!meaningfullyAbove(peak.value, latest.value, unit)) return null;

  const hoursAgo = (now - peak.t) / HOUR_MS;
  if (!Number.isFinite(hoursAgo) || hoursAgo < PEAK_MIN_AGE_HOURS) return null;

  return { value: peak.value, unit, at: peak.reading.timestamp, hoursAgo };
}

function formatValue(value: number, unit: ReadingUnit): string {
  return unit === 'ft'
    ? `${value.toFixed(2)} ft`
    : `${Math.round(value).toLocaleString('en-US')} cfs`;
}

/**
 * "Peaked 3 days ago at 4,200 cfs".
 *
 * Elapsed time, not calendar days: "yesterday" from a phone in one timezone
 * about a crest stamped in another is a day the reader did not mean.
 */
export function recentPeakSentence(peak: RecentPeak | null): string | null {
  if (!peak) return null;
  const hours = Math.round(peak.hoursAgo);
  const when =
    hours < 24
      ? `${hours} hours ago`
      : hours < 48
        ? 'about a day ago'
        : `${Math.floor(hours / 24)} days ago`;
  return `Peaked ${when} at ${formatValue(peak.value, peak.unit)}`;
}

/* ── Cold water ──────────────────────────────────────────────────────────── */

/**
 * Below this, a capsize is a cold-water emergency rather than a soaking.
 *
 * 60°F is the figure the issue names and the one paddling-safety guidance most
 * often uses as the line where immersion clothing stops being optional.
 */
export const COLD_WATER_F = 60;

/** A temperature older than this describes a different day's water. */
export const COLD_WATER_MAX_AGE_HOURS = 24;

/**
 * The cold-water line, or null.
 *
 * Safety information about the water, not about floatability: it is true of a
 * rated river and an unrated creek alike, and it says nothing about whether
 * either should be run. Null without a CURRENT measurement — a reading from
 * last week's cold snap is not a fact about today.
 */
export function coldWaterNote(
  temperature: { valueF: number; observedAt: string } | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!temperature || !Number.isFinite(temperature.valueF)) return null;
  const ageHours = (now - Date.parse(temperature.observedAt)) / HOUR_MS;
  if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > COLD_WATER_MAX_AGE_HOURS) return null;
  if (temperature.valueF >= COLD_WATER_F) return null;
  return `Cold water: ${Math.round(temperature.valueF)}°F. A capsize is dangerous at this temperature — dress for immersion.`;
}
