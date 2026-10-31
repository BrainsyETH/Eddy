// shared/floatable-headline.ts
//
// The one-line answer the app's launch screen exists to give: how many rivers
// are floatable right now.
//
// The number itself is not new — it is `summarizeConditionCounts().floatableNow`,
// the same bucket behind the "Floatable now" filter chip, which is the point.
// What lives here is the SENTENCE, so the app and any future surface cannot
// drift on how it is phrased or on when it is honest to say at all.
//
// Two rules the wording has to keep:
//
//   1. It counts, it does not clear anyone. "9 of 24 rivers are floatable right
//      now" is a tally of a condition bucket. Never "9 rivers are good to go" —
//      that is a go/no-go verdict, which Eddy does not issue. See the locked
//      phrasing table in docs/river-guide-style.md.
//
//   2. It says nothing when it knows nothing. (Dam tailwaters are counted
//      separately; see `floatableHeadlineParts` below.) If every river's condition came
//      back unknown — a failed conditions pull, a gauge provider outage — then
//      "0 of 24 rivers are floatable" is not a fact about the rivers, it is a
//      fact about the request, and stating it as the former would be a lie the
//      user has no way to catch. The caller shows its error instead.

import { summarizeConditionCounts } from './condition-system';

/**
 * The lag every count on this screen inherits.
 *
 * Same claim as the high-water list's footer, trimmed to its first clause: a
 * headline is not the place for "check again before getting on the water",
 * which belongs where somebody is about to act on a specific river.
 */
export const READING_LAG_NOTE = 'Gauge readings can trail the river by up to about an hour.';

/**
 * "9 of 24 rivers are floatable right now", or null when the tally would be
 * meaningless.
 *
 * Null cases, both deliberate:
 *   - no rivers at all (nothing has loaded)
 *   - no river with a KNOWN condition (see rule 2 above)
 *
 * The denominator is every river in the list, not just the ones Eddy could
 * read, so it always matches the number of rows on screen. Unknown rivers are
 * absent from the numerator, which claims only what it can support: these N are
 * floatable. It never asserts the rest are not.
 */
export function floatableHeadline(codes: ReadonlyArray<string | null | undefined>): string | null {
  const counts = summarizeConditionCounts(codes);
  if (counts.total === 0) return null;
  if (counts.byCode.unknown === counts.total) return null;

  const n = counts.floatableNow;
  const verb = n === 1 ? 'is' : 'are';
  return `${n} of ${counts.total} rivers ${verb} floatable right now`;
}

// ── Dam tailwaters sit outside the tally ────────────────────────────────────
//
// A tailwater's condition is `unknown` on purpose: Eddy refuses to rate a reach
// whose meaning inverts with the turbines (see the 2026-08-26 unrated-gauge
// migration). Counted like any other river, every tailwater was a permanent
// "not floatable" in the denominator — "4 of 28" with four of the 28 never able
// to join the numerator. Calling them floatable instead would be a verdict on a
// reach Eddy declines to rate, and during heavy generation, a wrong one.
//
// So they leave the count and get their own line. The two lines together still
// account for every row on screen, which is what rule 2's denominator protects.

/** rivers.river_type for a reach whose flow is set by an upstream dam. */
export const DAM_TAILWATER_TYPE = 'dam_tailwater';

export interface HeadlineRiver {
  code: string | null | undefined;
  riverType?: string | null;
}

export interface FloatableHeadlineParts {
  /** The free-flowing tally, as `floatableHeadline` words it. */
  headline: string | null;
  /** The caveat for the tailwaters left out of it, or null when there are none. */
  tailwaterNote: string | null;
}

/** "Plus 4 dam tailwaters, where flow depends on dam releases." */
export function tailwaterNote(count: number): string | null {
  if (count <= 0) return null;
  const noun = count === 1 ? 'dam tailwater' : 'dam tailwaters';
  return `Plus ${count} ${noun}, where flow depends on dam releases.`;
}

/**
 * The Ozarks headline with dam tailwaters held out of the count.
 *
 * The note only ever accompanies a headline: with no free-flowing tally to
 * qualify, a line about tailwaters alone would be the card rendering on its
 * footnote.
 */
export function floatableHeadlineParts(rivers: ReadonlyArray<HeadlineRiver>): FloatableHeadlineParts {
  const free: Array<string | null | undefined> = [];
  let tailwaters = 0;
  for (const river of rivers) {
    if (river.riverType === DAM_TAILWATER_TYPE) tailwaters += 1;
    else free.push(river.code);
  }
  const headline = floatableHeadline(free);
  return { headline, tailwaterNote: headline ? tailwaterNote(tailwaters) : null };
}
