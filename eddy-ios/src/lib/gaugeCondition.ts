// eddy-ios/src/lib/gaugeCondition.ts
// What a gauge station is reading, as a condition.
//
// /api/gauges sends every active station's latest reading AND the ladder each
// river grades it with, so the phone can classify all forty in one pass off one
// request. Asking the server for a condition per gauge would be forty requests
// to draw one map.
//
// The comparisons are NOT re-implemented here. classifyReading is the canonical
// ladder in @eddy/conditions/condition-ladder — the same function /api/plan and
// /api/conditions run server-side — because a second copy of these bands is how
// a map ends up disagreeing with the river screen it was opened from.
//
// The subpath import works because @eddy/conditions declares no `exports` map,
// the same route ReadingScale takes to threshold-zones.

import type { MapGauge } from '@eddy/types';
import { classifyReading, hasLadder } from '@eddy/conditions/condition-ladder';
import type { ConditionCode } from '@eddy/conditions';
import { formatReading } from '@/lib/readingCopy';

/** The association the app should grade and navigate by: primary, else first. */
function primaryLink(gauge: MapGauge) {
  return gauge.thresholds?.find((t) => t.isPrimary) ?? gauge.thresholds?.[0] ?? null;
}

/**
 * The gauge's condition right now, or 'unknown'.
 *
 * Returns 'unknown' — never a colour — in the two cases that matter:
 *
 *   • NO LADDER. A station wired to no river, or to one nobody has rated,
 *     carries a row of nulls. classifyReading answers `too_low` for that (every
 *     band is skipped and the fall-through wins), which would paint a perfectly
 *     healthy river brown. hasLadder is the guard.
 *
 *   • A SUSPECT READING. USGS qualifier codes flag ice-affected, estimated and
 *     sensor-fault values. Those numbers are real enough to display beside a
 *     caveat and nowhere near real enough to drive a colour that says "go".
 */
export function gaugeConditionCode(gauge: MapGauge): ConditionCode {
  const link = primaryLink(gauge);
  if (!link || !hasLadder(link)) return 'unknown';
  if (gauge.readingSuspect) return 'unknown';

  return classifyReading(gauge.gaugeHeightFt, link, gauge.dischargeCfs, {
    // The map is a display surface, but it is a display surface someone drives
    // to a river on. strictUnit refuses the cross-unit fallback, so a cfs-rated
    // gauge whose discharge sensor is dead reads 'unknown' rather than grading
    // its stage against cfs thresholds and inventing a colour.
    strictUnit: true,
  });
}

/**
 * The reading in the unit this gauge's river is rated in, formatted.
 *
 * Same rule as primaryReading() for rivers, and the same reason: showing cfs
 * when the ladder is in feet produces a number that looks authoritative and
 * does not correspond to the colour beside it.
 */
export function gaugeReadingText(gauge: MapGauge): string | null {
  const link = primaryLink(gauge);
  const unit = link?.thresholdUnit;

  if (unit === 'cfs') {
    return gauge.dischargeCfs != null ? formatReading(gauge.dischargeCfs, 'cfs') : null;
  }
  if (unit === 'ft') {
    return gauge.gaugeHeightFt != null ? formatReading(gauge.gaugeHeightFt, 'ft') : null;
  }

  // No declared unit: prefer stage, which is what most Ozark gauges are rated on.
  if (gauge.gaugeHeightFt != null) return formatReading(gauge.gaugeHeightFt, 'ft');
  if (gauge.dischargeCfs != null) return formatReading(gauge.dischargeCfs, 'cfs');
  return null;
}

/** The river this gauge should open, when it grades one. */
export function gaugeRiverSlug(gauge: MapGauge): string | null {
  return primaryLink(gauge)?.riverSlug ?? null;
}
