// eddy-ios/src/theme/conditions.ts
// Condition presentation, DERIVED from the canonical condition system.
//
// This file previously hardcoded its own condition hex, which broke the explicit
// instruction at the top of shared/condition-system.ts —
//   "Do not hardcode condition hex anywhere else; derive from CONDITION_SYSTEM."
// — and drifted immediately (app dangerous #DC2626 vs canonical #ef4444), so the
// app showed different colours than the website for the same river.
//
// Everything here now reads through CONDITION_SYSTEM. Metro reaches it via
// watchFolders (see metro.config.js); it has no imports of its own, so React
// Native can consume it directly.

import {
  CONDITION_SYSTEM,
  FLOATABLE_NOW,
  WEEKEND_SEVERITY,
  type ConditionCode,
} from '@shared/condition-system';

export { COLORS } from './palette';
export type { ConditionCode };

/** Solid brand colour for a condition. Never hardcode these. */
export function conditionColor(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.solid ?? CONDITION_SYSTEM.unknown.solid;
}

/** Translucent fill for chips and badges. */
export function conditionBg(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.bg ?? CONDITION_SYSTEM.unknown.bg;
}

/**
 * Short canonical label — "Flood", "Ideal", "Good", "High"…
 * Note `dangerous` reads "Flood", not "Dangerous"; that wording is deliberate
 * and shared with the website.
 */
export function conditionLabel(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.label ?? CONDITION_SYSTEM.unknown.label;
}

/** Full label for headline use — e.g. "Flood - Do Not Float". */
export function conditionLongLabel(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.longLabel ?? CONDITION_SYSTEM.unknown.longLabel;
}

/**
 * Is this river in the strictly positive "go float it" bucket?
 *
 * Uses FLOATABLE_NOW (flowing/good only), which is what every public "floatable
 * now" count on the website uses. Deliberately NARROWER than WEEKEND_FLOATABLE,
 * which also includes `high` — high water is worth featuring for experienced
 * paddlers but must never be folded into positive floatable copy.
 */
export function isFloatableNow(code: string): boolean {
  return FLOATABLE_NOW.has(code);
}

/**
 * Sort rank for "what can I float today?" — floatable first.
 *
 * WEEKEND_SEVERITY, not CONDITION_SYSTEM[].severity. The two orderings are
 * different on purpose and the canonical file warns against conflating them:
 * `severity` ranks most-alarming-first (for alerts), while WEEKEND_SEVERITY
 * ranks floatable-first (for "where should I go"). A report list wants the
 * latter.
 */
export function floatableRank(code: string): number {
  return WEEKEND_SEVERITY[code] ?? WEEKEND_SEVERITY.unknown;
}
