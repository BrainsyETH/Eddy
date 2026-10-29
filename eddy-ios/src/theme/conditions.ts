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
import { darkPalette } from './palette';

export type { ConditionCode };

/** Solid brand colour for a condition. Never hardcode these. */
export function conditionColor(code: string): string {
  return CONDITION_SYSTEM[code as ConditionCode]?.solid ?? CONDITION_SYSTEM.unknown.solid;
}

function definition(code: string) {
  return CONDITION_SYSTEM[code as ConditionCode] ?? CONDITION_SYSTEM.unknown;
}

/** Blend canonical hues without introducing a second condition-color registry. */
function mix(foreground: string, background: string, alpha: number): string {
  return `#${[1, 3, 5].map(offset => {
    const front = parseInt(foreground.slice(offset, offset + 2), 16);
    const back = parseInt(background.slice(offset, offset + 2), 16);
    return Math.round(front * alpha + back * (1 - alpha)).toString(16).padStart(2, '0');
  }).join('')}`;
}

function opaqueBg(code: string, background: string): string {
  const condition = definition(code);
  const alpha = Number(condition.bg.match(/[\d.]+/g)?.[3] ?? 0.15);
  return mix(condition.solid, background, alpha);
}

/** Light retains the canonical tint; dark uses an opaque tint over charcoal. */
export function conditionBg(code: string, isDark: boolean): string {
  return isDark ? opaqueBg(code, darkPalette.card) : definition(code).bg;
}

/** A matched text/icon role for the current badge surface, including photos. */
export function conditionInk(code: string, isDark: boolean): string {
  // Keep 30% of the canonical hue. The lighter ink clears 7:1 on dark badge
  // fills and raised surfaces, including the gray and low-water conditions.
  return isDark ? mix(conditionColor(code), '#FFFFFF', 0.3) : definition(code).ink;
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
 * So this picks per scheme: canonical ink on light, lifted ink on dark. Callers pass
 * `isDark` from useTheme rather than reading it here, because this file has no
 * business importing React.
 */
export function conditionText(code: string, isDark: boolean): string {
  return conditionInk(code, isDark);
}

/** Border for a tinted chip — a mid tint of the same hue. */
export function conditionChipBorder(code: string, isDark: boolean): string {
  return isDark ? mix(conditionColor(code), darkPalette.card, 0.45) : definition(code).chipBorder;
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
 * The short label — "Good", not "Good to float".
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

/** Opaque fills prevent a photo or map from changing a badge's text contrast. */
export function conditionOpaqueBg(code: string, isDark: boolean): string {
  return opaqueBg(code, isDark ? darkPalette.card : '#FFFFFF');
}
