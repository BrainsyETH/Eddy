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

/**
 * The association to grade and navigate by.
 *
 * WITH `riverSlug`, that river's own row — which is not a preference but a
 * correctness requirement wherever the river is already known. One physical
 * gauge can rate two rivers against different editorial ladders (07014000 is
 * primary for Huzzah and also rates Courtois), so the same reading is a
 * different verdict depending on which river is asking. A river screen that
 * graded through the gauge's *primary* link would show its neighbour's opinion.
 *
 * WITHOUT it — the map, Favorites — there is no river in the question, so the
 * gauge's own primary association is the best available answer.
 */
export function gaugeLink(gauge: MapGauge, riverSlug?: string | null) {
  const links = gauge.thresholds;
  if (riverSlug) {
    const own = links?.find((t) => t.riverSlug === riverSlug);
    if (own) return own;
  }
  return links?.find((t) => t.isPrimary) ?? links?.[0] ?? null;
}

/** Every gauge that rates this river, primary first. */
export function gaugesForRiver(gauges: MapGauge[], riverSlug: string): MapGauge[] {
  return gauges
    .filter((g) => g.thresholds?.some((t) => t.riverSlug === riverSlug))
    .sort((a, b) => {
      const ap = gaugeLink(a, riverSlug)?.isPrimary ? 0 : 1;
      const bp = gaugeLink(b, riverSlug)?.isPrimary ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    });
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
export function gaugeConditionCode(gauge: MapGauge, riverSlug?: string | null): ConditionCode {
  const link = gaugeLink(gauge, riverSlug);
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
export function gaugeReadingText(gauge: MapGauge, riverSlug?: string | null): string | null {
  const link = gaugeLink(gauge, riverSlug);
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
  return gaugeLink(gauge)?.riverSlug ?? null;
}

/**
 * The part of a station's name that says WHERE it is.
 *
 * USGS names a gauge "<river> <preposition> <place>" — "Current River at Van
 * Buren, MO", "Meramec River near Sullivan, MO" — and on a map the river is
 * already drawn underneath the pin in its own condition colour. Printing the
 * whole name puts the same two or three words under every dot on a river and
 * pushes the one word that distinguishes them off the end of the label.
 *
 * Falls back to the full name whenever the pattern does not hold, which is the
 * only safe direction here: a label that is too long is a cosmetic problem, and
 * a label that names the wrong place is a navigational one.
 */
export function gaugePlaceLabel(name: string): string {
  // The four prepositions USGS actually uses, plus the abbreviations that show
  // up in the national tier ("BL TEX CREEK", "ABV LAKE"). Anchored on a space
  // either side so a place called "Nathan" is not cut at "n".
  const match = name.match(/\s(?:at|near|nr|below|blw|bl|above|abv|ab)\s+(.+)$/i);
  return match?.[1]?.trim() || name;
}
