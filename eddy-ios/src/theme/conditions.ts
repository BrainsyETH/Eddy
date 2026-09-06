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
} from '@eddy/conditions';

export type { ConditionCode };

/** Solid brand colour for a condition. Never hardcode these. */
export function conditionColor(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.solid ?? CONDITION_SYSTEM.unknown.solid;
}

/**
 * Translucent fill for chips and badges.
 *
 * An rgba tint, not a hex — which is precisely why condition colours need no
 * light/dark variants: the same tint composites correctly over a warm off-white
 * canvas and over near-black stone.
 */
export function conditionBg(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.bg ?? CONDITION_SYSTEM.unknown.bg;
}

/**
 * Accessible dark text/icon colour for use ON the `bg` tint.
 *
 * The canonical file is explicit: "NEVER print white text on the light condition
 * fills — use tint + ink." These clear WCAG 2.2 AA at 4.5:1.
 */
export function conditionInk(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.ink ?? CONDITION_SYSTEM.unknown.ink;
}

/**
 * The ink for text and icons ON a tinted condition chip, per scheme.
 *
 * ── The bug this ends ──────────────────────────────────────────────────────
 * `conditionInk` is the canonical 800-level dark, chosen for the light `bg`
 * tint over white. The same tint over Eddy's dark cards (primary-900 teal) is
 * near black, and that ink sat on it at 1.1–1.6:1 — every verdict chip in the
 * app, "Flood - Do Not Float" included, unreadable in dark mode. Fifteen files
 * called conditionInk on a chip with no scheme check.
 *
 * Light keeps `ink`; dark takes the canonical `darkInk` (a 300-level of the
 * same hue). Both clear 4.5:1 over every surface the app draws a chip on — the
 * web suite composites and asserts it (condition-chip-contrast.test.ts). Use
 * this on anything sitting on conditionBg; use conditionText for condition
 * colour on a PLAIN card.
 */
export function conditionChipInk(code: string, isDark: boolean): string {
  const def = CONDITION_SYSTEM[code as ConditionCode] ?? CONDITION_SYSTEM.unknown;
  return isDark ? def.darkInk : def.ink;
}

/**
 * Condition colour for TEXT sitting on an ordinary card, not on a tinted chip.
 *
 * The two existing roles both assume a background: `solid` is drawn as a stripe
 * or a dot, and `ink` is explicitly "for use ON the light `bg` tint". Neither is
 * safe on a plain surface in both schemes — the canonical inks are 800-level
 * darks, which vanish against Eddy's near-black stone, while several solids
 * (lime-500, yellow-500) fail AA as small text on the warm off-white.
 *
 * So this picks per scheme: ink on light, solid on dark. Callers pass
 * `isDark` from useTheme rather than reading it here, because this file has no
 * business importing React.
 */
export function conditionText(code: string, isDark: boolean): string {
  return isDark ? conditionColor(code) : conditionInk(code);
}

/** Border for a tinted chip — a mid tint of the same hue. */
export function conditionChipBorder(code: string): string {
  return (
    CONDITION_SYSTEM[code as ConditionCode]?.chipBorder ?? CONDITION_SYSTEM.unknown.chipBorder
  );
}

/**
 * Short canonical label — "Flood", "Flowing", "Good", "High"…
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
 * The short label — "Good", not "Good - Floatable".
 *
 * Used where the long form would be a lie of tense rather than of fact. The
 * long labels are instructions ("Do Not Float", "Floatable"), and an
 * instruction is a statement about right now; a reading recovered from disk two
 * days later has no standing to issue one. The short label is a name, and a
 * name survives being old.
 */
export function conditionShortLabel(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.label ?? CONDITION_SYSTEM.unknown.label;
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

/**
 * Alarm rank — MOST ALARMING FIRST, so 0 is `dangerous` and higher is calmer.
 *
 * The other ordering, and the counterpart to floatableRank above: this is
 * CONDITION_SYSTEM's own `severity`, which alerts and digests are ordered by.
 * The map's gauge clusters take the MINIMUM of it across their members, which
 * is how a bubble ends up wearing the worst news it contains rather than an
 * average of six verdicts — see the cluster paint in RiverMap.
 *
 * Named `alarmRank` rather than `severity` on purpose. Two functions called
 * something-rank sitting next to each other invite a reader to check which is
 * which; two called `severity` and `floatableRank` invite them not to.
 */
export function alarmRank(code: string): number {
  return CONDITION_SYSTEM[code as ConditionCode]?.severity ?? CONDITION_SYSTEM.unknown.severity;
}
