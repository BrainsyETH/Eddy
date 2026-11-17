// src/lib/eddy/stretch-reads.ts
// Whether Eddy writes a Read for each stretch of a river, beside the river's own.
//
// PAUSED on 2026-11-17, by the owner.
//
// The daily pass wrote 58 stretch Reads next to 28 river Reads. No screen shows
// them: every reader of eddy_updates on the website and in the iOS app asks for
// river-level rows (section_slug IS NULL), and nothing calls
// /api/eddy-update/<river>?section=. The Black's stretch summaries do travel in
// the reaches API and the offline bundle, and nothing renders them there
// either. Seven of the 58 called the model; the other 51 were the code-written
// "no gauge reading for this stretch" line.
//
// So this is off until a screen exists to show a stretch Read. Turning it back
// on is this one constant. Before doing that, read "Connecting a stretch to a
// gauge" in docs/eddy-read-accuracy.md: most stretches have no gauge assigned,
// and assigning one also changes which gauge grades a float plan.
//
// Pure, so the rule can be tested without the database client that
// update-targets.ts imports.

import type { UpdateTarget } from '@/data/river-sections';

export const STRETCH_READS_ENABLED: boolean = false;

/** The targets to generate: whole-river only while stretch Reads are paused. */
export function withoutPausedStretches(
  targets: UpdateTarget[],
  enabled: boolean = STRETCH_READS_ENABLED,
): UpdateTarget[] {
  return enabled ? targets : targets.filter((target) => target.sectionSlug == null);
}
