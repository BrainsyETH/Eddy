// eddy-ios/src/lib/eddySays.ts
// What Eddy is allowed to say for free about ONE river, and how old it is.
//
// ── The tier, and why it lives in a return type ─────────────────────────────
//
// One model call writes three blocks into eddy_updates: [SUMMARY] into
// summary_text, [EDDY_READ] into eddy_read, [FULL] into quote_text. Per-river
// summary_text is free; per-river quote_text is the artifact EddyTake sells,
// and it reaches the app twice — once here inside EddyUpdateEntry, and once as
// `fullRead` on /api/rivers/[slug]/outlook, which is the same column.
//
// So every free surface in the app takes an EddySays, never an EddyUpdateEntry.
// The DTO has no field the full quote could arrive in, which is a stronger
// guarantee than any amount of care at the call sites: a component that cannot
// be handed the quote cannot render it, however the wiring above it changes.
// selectEddySays is the ONLY way to make one.
//
// This is deliberately not a grep-style source assertion. One of those passes
// happily if a layer in between renames quoteText to `text` on its way down —
// which is exactly the shape of the mistake it would be guarding against.
//
// ── The statewide row is not this ───────────────────────────────────────────
//
// river_slug 'global' is written by insertGlobal in the generate-eddy-updates
// cron, which sets quote_text and nothing else — no summary_text, ever. It is a
// two-or-three sentence overview rather than a report about a river, it is free,
// and TodaySummary renders it directly. Do not route it through here: it would
// select null on every row it has ever written.
//
// ── A null summary renders nothing, and is a defect rather than a case ──────
//
// summary_text is nullable, and parse-response.ts's terminal path is how it goes
// null — the one that also logs "Could not extract summary from model output".
// Every path in that parser that nulls the summary nulls eddy_read in the same
// object, so there is no second field to fall back to; and on that path
// quote_text is RAW model output, still carrying its [SUMMARY]/[FULL] markers,
// so it is both the gated artifact and the unusable one. Measured 2026-08-23:
// zero of 353 per-river rows had a null summary. If that ever stops being zero
// the fix is regeneration, not a fallback here.

/**
 * The shape selectEddySays reads. Structural, so an EddyUpdateEntry satisfies it
 * without this module importing @eddy/types — and so a caller cannot widen it
 * into something carrying the quote.
 */
export interface EddySaysSource {
  summaryText: string | null;
  /** When the prose was WRITTEN, not when the reading was taken. */
  generatedAt: string;
}

/**
 * Eddy's free line about a river, ready to render.
 *
 * No quoteText field, and that absence is the point — see the header.
 */
export interface EddySays {
  text: string;
  generatedAt: string;
}

/** The free line for one river, or null when there is nothing free to say. */
export function selectEddySays(source: EddySaysSource | null | undefined): EddySays | null {
  const text = source?.summaryText?.trim();
  if (!text) return null;
  return { text, generatedAt: source!.generatedAt };
}

/**
 * "this morning" / "3 hours ago" — deliberately vague at the coarse end.
 *
 * The precision people need from this is "not just now", and a paragraph is not
 * a reading. Minutes would imply the prose tracks the water.
 *
 * Shared by the Today tab's statewide card and every per-river surface, so the
 * two cannot drift into describing the same daily generator in different words.
 * It was TodaySummary's private function first.
 */
export function writtenAge(iso: string, now = new Date()): string | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const hours = (now.getTime() - then) / 3_600_000;
  if (hours < 0) return null;
  if (hours < 1) return 'Written in the last hour';
  if (hours < 2) return 'Written an hour ago';
  return `Written ${Math.round(hours)} hours ago`;
}
