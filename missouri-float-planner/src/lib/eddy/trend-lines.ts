// src/lib/eddy/trend-lines.ts
// What a Read prompt is told about how the gauge has moved and how today
// compares with the season. Shared by both prompt builders, which used to
// build these lines separately.
//
// A MODEL WRITES ABOUT WHAT IT IS HANDED. On 2026-11-19, 41 of 46 Reads told
// the reader the gauge had held steady for 24 hours and 34 said the level was
// lower than typical for mid-November. Both prompts asked for the trend "only
// when it adds useful information", and both handed over a five-line block
// about a gauge that had not moved, plus the day's median flow and percentile.
// The request lost to the block every time.
//
// So the block now depends on the water:
//
//   moved    the measured changes, the rate, the peak and low, as before
//   steady   one line saying so, and a peak or low only when the water was
//            somewhere else within the window (a crest it has come down from)
//
// and the season is one plain line under [SEASON], or nothing:
//
//   far outside the usual for this date        any rating
//   about normal, on a Too Low or Low gauge    the river is usually like this
//                                              now, which is worth knowing
//   anything else                              nothing
//
// The season line carries no number. The old block carried the percentile and
// the median, under a prompt that forbade printing either, and Reads printed
// "the median for this date over 25 years of record is closer to 220 cfs".
//
// Pure, so it can be tested on a fixed trajectory.

import type { ConditionCode } from '@/types/api';
import type { GaugeTrajectory } from './gauge-trajectory';

/** Below this a change in gauge height is not a change a floater would see. */
export const STEADY_CHANGE_FT = 0.1;
/** The rate under which buildNarrative already calls the gauge steady. */
const STEADY_RATE_FT_PER_HOUR = 0.05;
/** A peak or low this far from the current height is a different river day. */
const NOTABLE_EXTREME_FT = 0.3;

/** True when nothing measured over the past day would change a float. */
export function isSteady(trajectory: GaugeTrajectory): boolean {
  if (trajectory.change24h == null || Math.abs(trajectory.change24h) >= STEADY_CHANGE_FT) return false;
  if (trajectory.change6h != null && Math.abs(trajectory.change6h) >= STEADY_CHANGE_FT) return false;
  return trajectory.rateFtPerHour == null || Math.abs(trajectory.rateFtPerHour) < STEADY_RATE_FT_PER_HOUR;
}

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

/** The `[GAUGE TRAJECTORY]` block, or no lines when there is no trajectory. */
export function trendPromptLines(trajectory: GaugeTrajectory | null): string[] {
  if (!trajectory) return [];
  const lines = ['[GAUGE TRAJECTORY]'];
  const steady = isSteady(trajectory);
  const current = trajectory.currentHeightFt;

  if (steady) {
    lines.push('Steady: no meaningful change over the past 24 hours.');
  } else {
    if (trajectory.change24h != null) {
      const was = current != null ? (current - trajectory.change24h).toFixed(1) : '?';
      lines.push(`24h change: ${signed(trajectory.change24h)} ft (was ${was} ft yesterday)`);
    }
    if (trajectory.change6h != null) lines.push(`6h change: ${signed(trajectory.change6h)} ft`);
    if (trajectory.rateFtPerHour != null && trajectory.acceleration) {
      lines.push(`Rate: ${trajectory.acceleration} at ${Math.abs(trajectory.rateFtPerHour).toFixed(2)} ft/hr`);
    }
  }

  // On a steady gauge the peak and low are the reading over again, unless the
  // water was somewhere else inside the window.
  const notable = (heightFt: number) => !steady || current == null || Math.abs(heightFt - current) >= NOTABLE_EXTREME_FT;
  if (trajectory.windowPeak && notable(trajectory.windowPeak.heightFt)) {
    lines.push(`${trajectory.windowDays}-day peak: ${trajectory.windowPeak.heightFt.toFixed(1)} ft`);
  }
  if (trajectory.windowLow && notable(trajectory.windowLow.heightFt)) {
    lines.push(`${trajectory.windowDays}-day low: ${trajectory.windowLow.heightFt.toFixed(1)} ft`);
  }
  if (!steady && trajectory.narrative) lines.push(`Summary: ${trajectory.narrative}`);
  return lines;
}

/**
 * How today's flow compares with this date in the gauge's record, in words, or
 * null when it is not worth a sentence. See the header for the three cases.
 */
export function seasonPhrase(trajectory: GaugeTrajectory | null, conditionCode: ConditionCode): string | null {
  const percentile = trajectory?.percentile;
  if (percentile == null) return null;
  if (percentile <= 10) return 'far lower than usual for this time of year';
  if (percentile >= 90) return 'far higher than usual for this time of year';
  const lowRating = conditionCode === 'too_low' || conditionCode === 'low';
  if (lowRating && percentile >= 25 && percentile <= 75) {
    return 'about normal for this time of year, so this river is usually like this now';
  }
  return null;
}

/** The `[SEASON]` block, or no lines. */
export function seasonPromptLines(trajectory: GaugeTrajectory | null, conditionCode: ConditionCode): string[] {
  const phrase = seasonPhrase(trajectory, conditionCode);
  return phrase ? ['[SEASON]', `The flow at this gauge is ${phrase}.`] : [];
}
