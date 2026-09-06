// shared/reading-presentation.ts
// What a surface may SAY about a gauge reading, given how old the reading is.
//
// ── The gap this closes ──────────────────────────────────────────────────────
// Every screen that paints a verdict beside a number had its own idea of when
// the verdict stopped being true. The iOS river screen withheld it for cached
// readings ("Last known: Good"); the iOS gauge screen never withheld it at all,
// so a station that went quiet on Tuesday still wore "Good - Floatable", a green
// number and a happy otter on Friday — while the NWS line on the same card
// honestly said "comparison unavailable". Two rules on one card is the screen
// arguing with itself.
//
// This is the one rule. It is built on the two staleness numbers that already
// exist rather than adding a third:
//
//   STALE_READING_HOURS   (6h)  the reading stops being presentable as current
//   UNUSABLE_READING_HOURS (48h) the number itself is withheld
//
// and it returns what to draw, not a boolean — the paintable code, the chip
// text, whether the number and the trend may show, and which otter. Callers
// stop re-deriving those from a band, which is how they drifted.
//
// ── Why the long label is the thing that goes ────────────────────────────────
// The long labels are instructions: "Floatable", "Do Not Float". An instruction
// is a claim about right now, and a reading from Tuesday has no standing to make
// one. The SHORT label is a name, and a name survives being old — so a stale
// reading says "Last known: Good", in the neutral colour, with the flag otter.
//
// ── Null age ─────────────────────────────────────────────────────────────────
// Counts as EXPIRED, not fresh. An unknown age is not evidence of freshness, and
// a null reaching a `< threshold` comparison would paint a confident chip over a
// gauge that has never reported. Same rule readingBand has always applied to
// cache entries; it is now the rule everywhere.
//
// shared/ is @eddy/conditions, which eddy-ios consumes as a file: dependency,
// so this is reachable from both apps.

import { CONDITION_SYSTEM, type ConditionCode } from './condition-system';
import { STALE_READING_HOURS } from './reading-staleness';

/** Past this, the number itself is withheld rather than shown with a hedge. */
export const UNUSABLE_READING_HOURS = 48;

export type ReadingBand = 'fresh' | 'stale' | 'expired';

/**
 * Which of the three presentations a reading has earned.
 *
 *   fresh    the ordinary condition colour and the long label
 *   stale    neutral, and the label becomes "Last known: Good"
 *   expired  neutral, and the number is not shown at all
 */
export function readingBand(ageHours: number | null | undefined): ReadingBand {
  if (ageHours == null || !Number.isFinite(ageHours)) return 'expired';
  if (ageHours < STALE_READING_HOURS) return 'fresh';
  if (ageHours < UNUSABLE_READING_HOURS) return 'stale';
  return 'expired';
}

/** The prefix a withheld verdict wears. One string, so it cannot be spelled two ways. */
export const LAST_KNOWN_PREFIX = 'Last known: ';

/**
 * The chip and the headline once a reading is EXPIRED.
 *
 * Not "Last known: Good": at five days that is the decoration the header above
 * warns about, a name for water that has rained twice since. The number moves
 * into the caveat ("… — last 2.31 ft") so the datum is demoted, not lost.
 */
export const NO_RECENT_READING_LABEL = 'No recent reading';

/**
 * "an hour", "5 hours", "3 days" — the age as a person says it. Mirrors the
 * iOS readingAge() so the two never disagree about the same reading.
 */
export function readingAgePhrase(ageHours: number): string {
  if (ageHours < 2) return 'an hour';
  if (ageHours < 24) return `${Math.round(ageHours)} hours`;
  const days = Math.max(2, Math.round(ageHours / 24));
  return `${days} days`;
}

/**
 * The sentence that explains a withheld verdict, or null when fresh.
 *
 * Every non-fresh state gets one, INCLUDING an unknown age — a grey chip over a
 * number with nothing saying why was the gauge screen's silent case.
 */
export function readingCaveat(band: ReadingBand, ageHours: number | null | undefined): string | null {
  if (band === 'fresh') return null;
  if (ageHours == null || !Number.isFinite(ageHours)) return 'Reading time unknown';
  const phrase = readingAgePhrase(ageHours);
  return band === 'stale'
    ? `Last reported ${phrase} ago`
    : `Last reported ${phrase} ago — too old to use`;
}

export interface ReadingPresentation {
  band: ReadingBand;
  /** True only when the verdict may be stated in the present tense. */
  fresh: boolean;
  /**
   * The code a surface may PAINT — the classified code when fresh, `unknown`
   * otherwise. Every colour, otter and chip border should derive from this,
   * never from the raw classification.
   */
  paintCode: ConditionCode;
  /**
   * The chip text: the long label when fresh, "Last known: Good" when stale,
   * NO_RECENT_READING_LABEL when expired.
   */
  label: string;
  /**
   * Whether the number itself may be shown as the headline. False once
   * expired; a screen then prints the label in its place and carries the last
   * value inside `caveat`'s row instead.
   */
  showValue: boolean;
  /**
   * Why the verdict is withheld, for a visible row: "Last reported 9 hours
   * ago", "Last reported 3 days ago — too old to use", "Reading time unknown".
   * Null when fresh.
   */
  caveat: string | null;
  /** Whether a "rising / falling" pill may be shown. A trend is a claim about now. */
  showTrend: boolean;
  /** The otter mood the canonical system assigns to `paintCode`. */
  otter: (typeof CONDITION_SYSTEM)[ConditionCode]['otter'];
}

function asCode(code: string): ConditionCode {
  return code in CONDITION_SYSTEM ? (code as ConditionCode) : 'unknown';
}

/**
 * Resolve what to draw for a reading of `code` that is `ageHours` old.
 *
 * `code` is the classification the caller already made (with suspect readings
 * already mapped to `unknown`, as gaugeConditionCode and classifyReading's
 * callers do). This decides only whether that classification may still be
 * stated, not whether it was right.
 */
export function presentReading(
  code: string,
  ageHours: number | null | undefined,
): ReadingPresentation {
  const band = readingBand(ageHours);
  const fresh = band === 'fresh';
  const classified = asCode(code);
  const paintCode: ConditionCode = fresh ? classified : 'unknown';
  const label = fresh
    ? CONDITION_SYSTEM[classified].longLabel
    : band === 'stale'
      ? `${LAST_KNOWN_PREFIX}${CONDITION_SYSTEM[classified].label}`
      : NO_RECENT_READING_LABEL;

  return {
    band,
    fresh,
    paintCode,
    label,
    showValue: band !== 'expired',
    showTrend: fresh,
    otter: CONDITION_SYSTEM[paintCode].otter,
    caveat: readingCaveat(band, ageHours),
  };
}
