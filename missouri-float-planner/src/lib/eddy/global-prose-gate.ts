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
// What it cannot do is know about a flood that arrived AFTER it was written.
// So the rule is the narrower one: suppress when a river is dangerous now and
// the summary was written while that river was not.
//
// ── The bug that made this suppress almost always ───────────────────────────
//
// The first implementation of that rule compared the river's latest READING
// TIMESTAMP against the prose's generation time: newer reading than prose, and
// the flood counted as unknown to it.
//
// A gauge reports every fifteen minutes. Any river sitting in flood therefore
// has a reading newer than any prose within the quarter hour, whether it
// flooded this morning or last Tuesday — so the gate fired on the very case it
// was written to spare. Once one Missouri river went into flood, the statewide
// summary stopped being served for the duration, everywhere, and the app's
// launch screen showed a bare count with no report under it. Nothing logged an
// error; the endpoint simply omitted the key. The `expires_at` window and the
// generator were both fine the whole time.
//
// What the rule actually needs is not "when was this river last measured" but
// "was this river already in flood when the summary was written", which is a
// question about the SNAPSHOT the generator read, not about the gauge. The
// caller answers it from the per-river eddy_updates rows the statewide prose
// was generated from — see src/app/api/eddy-updates/route.ts, which is the one
// place that knows which of those rows predate the statewide one.
//
// ── Failing closed ──────────────────────────────────────────────────────────
//
// A river that is dangerous now and for which we hold no what-it-knew answer
// counts against the prose. Same for prose we cannot date: it cannot be stamped
// "as of" honestly, and an undated claim about today's water is the thing this
// module exists to prevent.
//
// ── The second way this suppressed almost always ────────────────────────────
//
// Failing closed on a dangerous river is only sound when "dangerous" is a claim
// about water somebody measured recently. It was not. The live map is built
// over every primary gauge with no floor on how old its newest reading is, so a
// DEAD gauge kept computing a condition forever — and one of them, on a river
// retired from the app months earlier, had lost its stage sensor while still
// reporting discharge. Its ladder is rated in feet, its stage was null, and the
// display-side cross-unit fallback graded 1,720 cfs against a 6-foot flood line
// and returned 'dangerous'. Every day. From a reading taken in April.
//
// That river has no eddy_updates row of its own, so conditionWhenWritten was
// null, so the rule above fired — and the statewide summary was withheld from
// every client, permanently, over a gauge nobody could see reporting a flood
// that was not happening.
//
// Hence `stale`. A reading too old to be live is not evidence of a flood that
// arrived since the summary was written; it is not evidence of anything now.
// The gate skips those rivers rather than counting them, which is narrower than
// it sounds — readings refresh hourly, so a river with a working gauge is never
// stale, and the case this spares is exactly the case that has no business
// speaking: a gauge that stopped reporting.

/** Hours after which the statewide summary is too old to show regardless. */
export const GLOBAL_PROSE_STALE_HOURS = 24;

export type GlobalProseVerdict =
  | { show: true }
  | { show: false; reason: 'flood-since-generation' | 'stale' | 'undated' };

export interface GlobalProseGateInput {
  /** When the summary was generated. */
  generatedAt: string | null | undefined;
  /**
   * Every curated river's condition RIGHT NOW, paired with the condition the
   * statewide prose was written against. One entry per river with a primary
   * gauge.
   */
  live: ReadonlyArray<{
    conditionCode: string;
    /**
     * What this river's own Eddy update said at the moment the statewide
     * summary was generated — i.e. what the generator could have read.
     *
     * NULL MEANS UNKNOWN, NOT "FINE". No update row for this river, or none
     * old enough to have been an input, and a dangerous river we cannot show
     * the summary knew about is one the summary is suppressed for.
     */
    conditionWhenWritten: string | null;
    /**
     * Whether the reading `conditionCode` was computed from is itself too old
     * to be called live (LiveCondition.stale — see live-conditions.ts).
     *
     * Stale rivers are SKIPPED, not failed closed. See the header: a condition
     * derived from a months-old reading is not a flood the summary missed, and
     * treating it as one is what withheld the statewide report indefinitely
     * over a single retired gauge. Optional and defaulting to fresh so a caller
     * that cannot answer keeps the old behaviour.
     */
    stale?: boolean;
  }>;
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
    // A dead gauge cannot report a flood. Checked BEFORE the two clauses below
    // because both of them treat 'dangerous' as a fact about the water right
    // now, and a stale reading is not one — see the header.
    if (river.stale) continue;
    // Already in flood when the summary was written, so the generator saw it
    // and was instructed to lead with safety. This is the long-high-water case
    // the gate must NOT fire on.
    if (river.conditionWhenWritten === 'dangerous') continue;
    return { show: false, reason: 'flood-since-generation' };
  }

  return { show: true };
}
