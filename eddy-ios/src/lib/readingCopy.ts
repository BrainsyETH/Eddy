// eddy-ios/src/lib/readingCopy.ts
// Turning a gauge reading into words.
//
// The rule running through all of this: never state more certainty than the data
// supports. A USGS reading is a measurement from a specific moment at a specific
// gauge, not "the river right now", and the app's copy has to keep that
// distinction visible without being tedious about it.

import type { RiverConditionDetail } from '@eddy/types';

/**
 * The reading in the unit this river's thresholds are actually defined in.
 *
 * Deliberately does NOT fall back across units. Showing cfs when the condition
 * was computed from stage — or the reverse — produces a number that looks
 * authoritative and does not correspond to the colour beside it. The same rule
 * is enforced server-side in the alert gate (`strictUnit`).
 */
export function primaryReading(
  condition: Pick<RiverConditionDetail, 'gaugeHeightFt' | 'dischargeCfs'> & {
    // Widened to accept null as well as undefined. /api/conditions omits the key
    // when it cannot establish a unit, while /api/rivers sends an explicit null;
    // both mean the same thing — "no declared unit" — and must take the same
    // branch below rather than one of them silently matching 'ft'.
    thresholdUnit?: 'ft' | 'cfs' | null;
  },
): { value: number; unit: 'ft' | 'cfs' } | null {
  const unit = condition.thresholdUnit;

  // A DECLARED unit is absolute: if its reading is missing we show nothing. An
  // earlier version let these fall through to the block below, which quietly
  // reintroduced the cross-unit fallback this function exists to prevent.
  if (unit === 'ft') {
    return condition.gaugeHeightFt != null ? { value: condition.gaugeHeightFt, unit: 'ft' } : null;
  }
  if (unit === 'cfs') {
    return condition.dischargeCfs != null ? { value: condition.dischargeCfs, unit: 'cfs' } : null;
  }

  // Only when NO unit is declared: prefer stage, which is what most Ozark
  // gauges are rated on.
  if (condition.gaugeHeightFt != null) return { value: condition.gaugeHeightFt, unit: 'ft' };
  if (condition.dischargeCfs != null) return { value: condition.dischargeCfs, unit: 'cfs' };
  return null;
}

/** Stage to two decimals, discharge whole — the precision each is reported at. */
export function formatReading(value: number, unit: 'ft' | 'cfs'): string {
  if (unit === 'ft') return `${value.toFixed(2)} ft`;
  return `${Math.round(value).toLocaleString('en-US')} cfs`;
}

/**
 * How old the reading is, phrased for a person.
 *
 * Anything past a day is called out in days rather than a large hour count,
 * because "31h ago" reads as precision the number does not deserve.
 */
export function readingAge(hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 1) return 'Updated in the last hour';
  if (hours < 2) return 'Updated an hour ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Plain-language percentile context.
 *
 * This is what the 89,304-row day-of-year snapshot bought: not "1.51 ft", which
 * means nothing to most people, but "lower than most years for late July". The
 * comparison is against THIS DAY historically, which is why a summer low reads
 * as normal rather than alarming.
 */
export function percentileSentence(percentile: number | null | undefined): string | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  const p = Math.max(0, Math.min(100, percentile));
  if (p < 10) return 'Much lower than usual for this time of year';
  if (p < 25) return 'Lower than usual for this time of year';
  if (p < 75) return 'About normal for this time of year';
  if (p < 90) return 'Higher than usual for this time of year';
  return 'Much higher than usual for this time of year';
}

/** "12th percentile" — the number behind the sentence, for people who want it. */
export function percentileLabel(percentile: number | null | undefined): string | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  const p = Math.round(Math.max(0, Math.min(100, percentile)));
  const suffix = p % 10 === 1 && p !== 11 ? 'st' : p % 10 === 2 && p !== 12 ? 'nd' : p % 10 === 3 && p !== 13 ? 'rd' : 'th';
  return `${p}${suffix} percentile for this date`;
}

/**
 * The caveat line, or null when there is nothing to caveat.
 *
 * Surfaced whenever the server flags accuracy OR the reading is over six hours
 * old, even if the server said nothing — a stale reading is a caveat regardless
 * of whether anything upstream noticed.
 */
export function accuracyNote(
  condition: Pick<
    RiverConditionDetail,
    'accuracyWarning' | 'accuracyWarningReason' | 'readingAgeHours'
  >,
): string | null {
  if (condition.accuracyWarning) {
    return condition.accuracyWarningReason ?? 'This reading may not reflect current conditions.';
  }
  if ((condition.readingAgeHours ?? 0) >= 6) {
    return 'This gauge has not reported recently, so conditions may have changed.';
  }
  return null;
}
