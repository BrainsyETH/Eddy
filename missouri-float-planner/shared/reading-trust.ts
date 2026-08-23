// shared/reading-trust.ts
// Whether a reading has earned an interpretation.
//
// A gauge reading is two different things at once: a fact ("4.2 ft, three
// hours ago") and the ground for everything Eddy builds on top of it — a
// condition verdict, a trend arrow, a seasonal comparison. This module decides
// when the second half is allowed. The rule:
//
//   An UNTRUSTED reading keeps its value and its age, and produces NO Eddy
//   condition, NO trend, and NO seasonal interpretation.
//
// The value stays because hiding a number the source published is worse than
// showing it plainly; the interpretation goes because a verdict painted over an
// ice-affected or six-hour-old reading is the screen vouching for a number the
// gauge itself has flagged.
//
// Two inputs, both of which already had canonical homes or badly needed one:
//
//   Staleness  reading-staleness.ts — the six-hour presentable-freshness line.
//              (The 2h refetch, 3-6h alert-gating and 24h prose numbers are
//              deliberately different questions; see that file's header.)
//   Qualifiers SUSPECT_QUALIFIERS below — previously declared independently in
//              src/lib/usgs/gauges.ts and src/lib/alerts/gate.ts, while
//              chart-model.ts captioned a third, smaller set. Three tables that
//              disagree on which codes mean "suspect" cannot back one rule.
//
// This is the presentation-layer sibling of src/lib/alerts/gate.ts, which asks
// the stricter question "is this reading solid enough to fire a push about" and
// adds flatline and future-skew detection. The alert gate keeps its own
// provider-specific age limits; it imports the qualifier set from here so the
// two policies can never disagree about which codes mean suspect.

import { isReadingStale } from './reading-staleness';

/**
 * Codes meaning the VALUE is suspect (not merely unapproved).
 *
 * 'P' (provisional) is deliberately NOT here: essentially every real-time USGS
 * reading carries it, so treating it as suspect would suppress interpretation
 * everywhere. It stays a footnote (see qualifierText in chart-model.ts).
 *
 *   e/E = estimated · Ice = ice affected · Eqp = equipment malfunction
 *   Bkw = backwater · Mnt = maintenance · ZFl = zero flow · *** = unavailable
 *   Dis = discontinued · Rat = rating extension · Ssn = seasonal
 */
export const SUSPECT_QUALIFIERS: ReadonlySet<string> = new Set([
  'e', 'E', 'Ice', 'Eqp', 'Bkw', 'Mnt', 'ZFl', '***', 'Dis', 'Rat', 'Ssn',
]);

export function hasSuspectQualifier(qualifiers: string[] | null | undefined): boolean {
  return (qualifiers ?? []).some((code) => SUSPECT_QUALIFIERS.has(code));
}

export type ReadingDistrust = 'suspect_qualifier' | 'stale';

export type ReadingTrust =
  | { trusted: true }
  | { trusted: false; reason: ReadingDistrust };

/**
 * Suspect wins over stale when both apply: "the sensor flagged this number" is
 * a stronger statement than "this number is old", and it is the one worth
 * captioning.
 */
export function assessReadingTrust(input: {
  qualifiers?: string[] | null;
  /** Age of the reading in hours; null/undefined (never reported) is stale. */
  ageHours: number | null | undefined;
}): ReadingTrust {
  if (hasSuspectQualifier(input.qualifiers)) {
    return { trusted: false, reason: 'suspect_qualifier' };
  }
  if (isReadingStale(input.ageHours)) {
    return { trusted: false, reason: 'stale' };
  }
  return { trusted: true };
}
