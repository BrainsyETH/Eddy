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

/**
 * What each suspect code means for the number on screen, most serious first.
 *
 * One entry per SUSPECT_QUALIFIERS code (reading-trust.test.ts holds the two
 * lists together). The order decides which explanation a reading carrying
 * several codes gets: a broken sensor outranks an estimate of what it would
 * have read. `{publisher}` is the station's agency, so a USACE dam is never
 * captioned with a USGS code it did not send.
 *
 * Plain words, not codes or hydrology terms: "Rat" and "extrapolated" mean
 * nothing to a floater, "higher than USGS has measured here" does. Two short
 * sentences, no dashes: what happened, then what it means for the number,
 * because that is the only part a reader can act on. "May be wrong" for a
 * reading that could be any value; "may be off" for one that is roughly right.
 */
const SUSPECT_QUALIFIER_NOTES: readonly (readonly [code: string, note: string])[] = [
  ['Eqp', 'Gauge equipment problem. This reading may be wrong.'],
  ['Mnt', 'Gauge is being serviced. This reading may be wrong.'],
  ['***', "{publisher} hasn't confirmed this number. Don't rely on it."],
  ['Dis', 'This gauge is no longer maintained. The reading may be out of date.'],
  ['Ice', 'Ice at the gauge. This reading may be off.'],
  ['Bkw', 'Water is backing up from downstream, from a dam or another river. The flow number may be off.'],
  ['Rat', 'Higher or lower than {publisher} has measured here. The flow number is a rough estimate.'],
  ['e', '{publisher} estimated this reading. It may be off.'],
  ['E', '{publisher} estimated this reading. It may be off.'],
  ['ZFl', 'Gauge shows no flowing water. Check before you go.'],
  ['Ssn', 'This gauge only reports part of the year. This reading may be outside that window.'],
];

/** The explanation for the most serious suspect code present, or null. */
export function suspectQualifierNote(
  qualifiers: string[] | null | undefined,
  publisher: string,
): string | null {
  const codes = qualifiers ?? [];
  // An unknown agency reads as "the source", never a bare "provider", and a
  // note that opens with the agency's name still opens with a capital.
  const who = publisher === 'provider' ? 'the source' : publisher;
  const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  for (const [code, note] of SUSPECT_QUALIFIER_NOTES) {
    if (codes.includes(code)) return capitalized(note.replace('{publisher}', who));
  }
  return hasSuspectQualifier(codes) ? `Reading flagged by ${who}. It may be off.` : null;
}

/** Every code with its own explanation — for the test that keeps both lists whole. */
export const EXPLAINED_SUSPECT_QUALIFIERS: readonly string[] = SUSPECT_QUALIFIER_NOTES.map(([code]) => code);

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
