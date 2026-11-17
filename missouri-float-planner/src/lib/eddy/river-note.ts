// src/lib/eddy/river-note.ts
// Whether a stored river_characteristics.river_note is fit to hand to a model.
//
// The note is injected into every Read prompt as "Gauge notes:". For most of
// 2026 the dossier ingest wrote a bookkeeping string there instead of a note:
//
//   Per-section hydro types: wolf-pen-to-redding=undefined, ... River-level
//   default: rain_flashy.
//
// It reads as data, so nothing failed: the model was simply told, under a
// heading that says "notes about this gauge", a list of slugs equal to
// `undefined`. Sixteen of 28 active rivers carried it when this was written.
//
// Pure, with no imports, so the loader (rivers/context.ts) and the trust check
// can both use it.

export type RiverNoteDefect = 'ingestion_placeholder' | 'unrendered_value';

/** Why a note is unusable, or null when it is fine (or absent). */
export function riverNoteDefect(note: string | null | undefined): RiverNoteDefect | null {
  const text = note?.trim();
  if (!text) return null;
  if (/^Per-section hydro types:/i.test(text)) return 'ingestion_placeholder';
  // A template that interpolated a missing value. `=undefined` and `: null`
  // are the shapes a serialized object leaves behind; the bare words can occur
  // in honest prose ("an undefined channel"), so only the assigned forms count.
  if (/[=:]\s*(?:undefined|null|NaN)\b|\[object Object\]/.test(text)) return 'unrendered_value';
  return null;
}

/** The note when it is usable, otherwise null. */
export function usableRiverNote(note: string | null | undefined): string | null {
  const text = note?.trim();
  return text && !riverNoteDefect(text) ? text : null;
}
