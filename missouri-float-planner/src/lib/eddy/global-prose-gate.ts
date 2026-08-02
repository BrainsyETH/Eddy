// src/lib/eddy/global-prose-gate.ts
//
// Whether the statewide Eddy summary is still safe to show.
//
// ── The hole this closes ────────────────────────────────────────────────────
//
// Every per-river quote is reconciled against live water before it is served:
// overlayLiveConditions blanks the prose when the river has moved to a
// different floatability class than the quote was written for. The statewide
// row has never been through that. It has no river of its own, so it has no
// live match, and it falls through the overlay unchanged — guarded by nothing
// but a 25-hour expires_at.
//
// That was tolerable while the only consumer was a card below the fold on the
// website. It is not tolerable on the app's launch screen, where the summary
// is the first sentence anybody reads, above the count, on a screen whose
// entire job is answering "what can I float TODAY".
//
// ── Why "any flood" is not the rule ─────────────────────────────────────────
//
// The generator is instructed to lead with safety when conditions are
// dangerous, so a summary written at 6:10am during a flood already says so.
// Blanking on any flood anywhere would throw away prose that is doing its job,
// every day of a long high-water spell.
//
// What it cannot do is know about a flood that arrived after it was written.
// So the rule is the narrower, true one: suppress when a river is dangerous
// NOW and the reading that says so is NEWER than the prose. Everything else
// the summary had a chance to account for.
//
// ── Failing closed ──────────────────────────────────────────────────────────
//
// A dangerous river whose reading carries no timestamp cannot be shown to
// predate the prose, so it counts against it. Same for prose we cannot date:
// it cannot be stamped "as of" honestly, and an undated claim about today's
// water is the thing this module exists to prevent.

/** Hours after which the statewide summary is too old to show regardless. */
export const GLOBAL_PROSE_STALE_HOURS = 24;

export type GlobalProseVerdict =
  | { show: true }
  | { show: false; reason: 'flood-since-generation' | 'stale' | 'undated' };

export interface GlobalProseGateInput {
  /** When the summary was generated. */
  generatedAt: string | null | undefined;
  /**
   * Every curated river's condition RIGHT NOW, with the age of the reading it
   * came from. One entry per river with a primary gauge.
   */
  live: ReadonlyArray<{ conditionCode: string; readingTimestamp: string | null }>;
  now?: Date;
  staleHours?: number;
}

export function gateGlobalProse({
  generatedAt,
  live,
  now = new Date(),
  staleHours = GLOBAL_PROSE_STALE_HOURS,
}: GlobalProseGateInput): GlobalProseVerdict {
  const written = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  if (!Number.isFinite(written)) return { show: false, reason: 'undated' };

  const ageHours = (now.getTime() - written) / 3_600_000;
  // Negative age means a clock disagreement, not freshness. Treated as stale
  // rather than trusted: prose apparently written in the future is prose we
  // cannot reason about.
  if (ageHours >= staleHours || ageHours < 0) return { show: false, reason: 'stale' };

  for (const river of live) {
    if (river.conditionCode !== 'dangerous') continue;
    if (!river.readingTimestamp) return { show: false, reason: 'flood-since-generation' };
    const measured = new Date(river.readingTimestamp).getTime();
    if (!Number.isFinite(measured) || measured > written) {
      return { show: false, reason: 'flood-since-generation' };
    }
  }

  return { show: true };
}
