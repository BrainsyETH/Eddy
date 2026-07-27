// shared/reading-unit.ts
// Which unit a river is GRADED in — the one question every reading on every
// surface has to agree about.
//
// WHY THIS IS ITS OWN FILE. The rule lived only in eddy-ios/src/lib/readingCopy.ts,
// and the web test that covered it re-implemented it inline rather than importing
// it, because the app has no test runner and the app's source was unreachable
// from the web's. So the test passed against a copy while the shipping code was
// wrong: /api/conditions never sent `thresholdUnit`, the real primaryReading()
// fell into its "no declared unit" branch, and the river screen printed a stage
// reading over a discharge ladder on 18 of 24 rivers. A green suite the whole
// time. That is the duplicate-then-drift failure this repo has been bitten by
// before, and the fix is the same one it used for the condition ladder: put the
// rule where both platforms can import it.
//
// LIVES IN shared/ FOR THE SAME REASON condition-system.ts DOES: eddy-ios reaches
// this folder through the `@eddy/conditions` file: dependency, which declares no
// `exports` map, so `@eddy/conditions/reading-unit` resolves straight to this
// file. Keep it free of imports for that reason.

export type ReadingUnit = 'ft' | 'cfs';

/** Everything needed to decide the unit. Both fields are optional and nullable. */
export interface RatedUnitSource {
  /**
   * The unit on the condition itself. /api/rivers has always sent this;
   * /api/conditions did not until the fix that created this file, so a phone
   * running against an older deploy still sees it missing.
   */
  thresholdUnit?: ReadingUnit | null;
  /** The gauge's own ladder, when the payload carries one. */
  thresholds?: { thresholdUnit?: ReadingUnit | null } | null;
}

/**
 * The unit this river's condition was actually computed in, or null.
 *
 * THE LADDER WINS when both are present. `thresholds` is what the band track is
 * drawn from, and a reading that disagrees with the scale beside it is wrong no
 * matter which of the two fields is "more authoritative" in the abstract — the
 * number and the picture have to describe the same quantity.
 *
 * Null means genuinely unknown, and callers must treat that as "show nothing"
 * rather than guessing. Guessing is what caused the bug: preferring stage
 * because most Ozark gauges are rated on it is true of six rivers and wrong
 * about the other eighteen.
 */
export function ratedUnit(source: RatedUnitSource): ReadingUnit | null {
  return source.thresholds?.thresholdUnit ?? source.thresholdUnit ?? null;
}
