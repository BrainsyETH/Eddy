// shared/station-tier.ts
// Which vocabulary a surface may speak about a station YET.
//
// Eddy has two ways of describing a reading and they contradict each other by
// design: a RATED station gets a ladder and a verdict ("Floatable"), a
// REFERENCE station gets a comparison to its own history ("Much lower than
// usual") or, having none, "No historical comparison published for this
// gauge". Choosing between them by asking whether a ladder happens to be on
// the wire is the bug this module ends — list and search payloads carry no
// ladders, not because stations have none, so a rated gauge opened from
// search would paint the reference answer in full confidence until the detail
// fetch landed. Reported from the field on the Eleven Point near Bardley.
//
// The three answers:
//
//   rated      A usable ladder is present. Verdict vocabulary.
//   reference  Known not to be curated, or carrying ladders with none usable.
//              Flow-band vocabulary.
//   unknown    No ladders on the wire AND no statement about the tier. The
//              surface must say NEITHER thing — render a shape of the right
//              size, not a sentence. "No historical comparison published"
//              is a claim the screen has not earned; a spinner says the
//              screen does not know yet, that sentence says it asked and
//              there is none.
//
// Extracted from eddy-ios/src/lib/gaugeSeed.ts (gaugeTier, which now
// delegates here) when the web detail views needed the same three states —
// web is MORE exposed to the first-frame problem, since its list and search
// payloads carry no ladders either.

import { hasLadder } from './condition-ladder';

export type StationTier = 'rated' | 'reference' | 'unknown';

/** The ladder fields the tier decision reads; everything else may ride along. */
export interface TierLink {
  isPrimary?: boolean | null;
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

export function stationTier(input: {
  /** Ladder links as the payload carried them; null when none were on the wire. */
  thresholds: readonly TierLink[] | null | undefined;
  /** The source's outright statement about the tier, when it made one. */
  curated: boolean | null | undefined;
}): StationTier {
  // FIND-PRIMARY, matching gaugeLink() and every grading surface: a station
  // that rates two rivers must be graded on the one it is primary for.
  const link =
    input.thresholds?.find((l) => l.isPrimary) ?? input.thresholds?.[0] ?? null;
  if (link && hasLadder(link)) return 'rated';
  // Ladders were on the wire and none of them is a ladder. That is an answer:
  // the source that carries ladders carried this station's, and it has none.
  if (input.thresholds != null) return 'reference';
  // No ladders, but the source stated the tier outright. The national tier
  // says `curated: false` and means it.
  if (input.curated === false) return 'reference';
  return 'unknown';
}
