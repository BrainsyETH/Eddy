// shared/condition-ladder.ts
//
// CANONICAL threshold ladder — the one place a gauge reading becomes a
// condition code.
//
// This lives beside condition-system.ts, and for the same reason: more than one
// runtime needs it. condition-system.ts owns what a code MEANS (its colour, its
// label, its orderings); this owns how a NUMBER becomes a code. The two were
// always one concept split across a boundary — the ladder sat in
// src/lib/conditions.ts, which imports from '@/constants' and so could only ever
// run inside the Next.js app.
//
// The Expo app now needs it. A gauge pin drawn in a neutral dot is a label on a
// map; a gauge pin drawn in its own condition colour is the answer to "where is
// the water good right now", and the phone already holds every input — the
// reading and the ladder both come down in /api/gauges. The alternative was a
// second implementation of these comparisons on the client, which is precisely
// the failure this repo has been bitten by before (four condition ladders, two
// flood-stage overrides).
//
// Intentionally pure TypeScript: no React, no Next, no runtime imports beyond
// the sibling type. That is what lets the Next app, the Remotion project and
// Metro all consume it.
//
// src/lib/conditions.ts remains the app's entry point and still returns a
// {code, label, color} triple; it now delegates the comparisons here rather
// than owning them.

import type { ConditionCode } from "./condition-system";

export interface ConditionThresholds {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  thresholdUnit?: "ft" | "cfs";
  /**
   * NWS flood stage in FEET. Authoritative hazard line regardless of the unit
   * the gauge is classified in — a reading at flood stage is dangerous whether
   * or not the editorial `levelDangerous` band says so.
   */
  floodStageFt?: number | null;
}

export interface ClassifyReadingOptions {
  /**
   * Reject the cross-unit fallback: when true, a gauge whose PRIMARY unit has
   * no value returns `unknown` instead of silently classifying the other unit's
   * number against the wrong thresholds.
   *
   * Defaults to false so every existing display call site keeps its current
   * behavior. The alert path passes true — comparing cfs against ft thresholds
   * is how a dead stage sensor used to manufacture a `dangerous` social post.
   */
  strictUnit?: boolean;
}

/**
 * Grade a reading against a river's ladder.
 *
 * Supports both ft (gauge height) and cfs (discharge) threshold units, using
 * the value that matches `thresholdUnit` with an automatic fallback unless
 * `strictUnit` forbids it.
 */
export function classifyReading(
  gaugeHeightFt: number | null,
  thresholds: ConditionThresholds,
  dischargeCfs?: number | null,
  options?: ClassifyReadingOptions,
): ConditionCode {
  const useCfs = thresholds.thresholdUnit === "cfs";

  // ── Flood-stage override ────────────────────────────────────────
  // Checked BEFORE the null guard below, and before the threshold ladder,
  // mirroring the `is_flood` branch in the get_river_condition RPC
  // (migration 00166). Order matters for safety: a cfs-primary gauge whose
  // discharge sensor has died still reports `dangerous` from its stored
  // stage rather than degrading to `unknown`.
  if (
    thresholds.floodStageFt != null &&
    gaugeHeightFt != null &&
    gaugeHeightFt >= thresholds.floodStageFt
  ) {
    return "dangerous";
  }

  // Use the preferred value. The cross-unit fallback is preserved by default
  // for display call sites, but suppressed under strictUnit.
  let compareValue: number | null;
  if (options?.strictUnit) {
    compareValue = (useCfs ? dischargeCfs : gaugeHeightFt) ?? null;
  } else if (useCfs) {
    compareValue = dischargeCfs ?? gaugeHeightFt;
  } else {
    compareValue = gaugeHeightFt ?? dischargeCfs ?? null;
  }

  if (compareValue == null) return "unknown";

  // Check thresholds from highest to lowest (most dangerous first)
  if (thresholds.levelDangerous !== null && compareValue >= thresholds.levelDangerous) {
    return "dangerous";
  }

  // Anything above optimal_max (or above level_high if optimal_max is null) is "high".
  // The Float Conditions bar paints the High band starting at optimal_max, so the code
  // must agree — otherwise the badge ("Good") and the needle position ("High") disagree.
  const highStart = thresholds.levelOptimalMax ?? thresholds.levelHigh;
  if (highStart !== null && compareValue > highStart) return "high";

  if (
    thresholds.levelOptimalMin !== null &&
    thresholds.levelOptimalMax !== null &&
    compareValue >= thresholds.levelOptimalMin &&
    compareValue <= thresholds.levelOptimalMax
  ) {
    return "flowing";
  }

  // "Good": at or above the low threshold. When a partial ladder defines only
  // where the optimal band begins (optimal_min) with no low/optimal_max anchor —
  // e.g. the moherp "Good begins at X" ratings on Gasconade/Jerome (400 cfs) and
  // Black/Annapolis (180 cfs) — fall back to optimal_min as the good floor.
  // Without this, a healthy reading passes every band above and lands on the
  // final "too_low" fall-through, so the gauge reads "Too Low" at any level.
  const goodFloor = thresholds.levelLow ?? thresholds.levelOptimalMin;
  if (goodFloor !== null && compareValue >= goodFloor) return "good";

  if (thresholds.levelTooLow !== null && compareValue >= thresholds.levelTooLow) {
    return "low";
  }

  // Below all thresholds
  return "too_low";
}

/**
 * True when a ladder has enough anchors to grade anything at all.
 *
 * A gauge station wired to no river, or to one nobody has rated yet, carries a
 * row of nulls. classifyReading would answer `too_low` for it — every band is
 * skipped and the fall-through wins — which would paint a perfectly healthy
 * river brown on a map. Callers that DISPLAY a computed condition must check
 * this first; callers comparing a known-rated gauge need not.
 */
export function hasLadder(thresholds: ConditionThresholds): boolean {
  return (
    thresholds.levelTooLow !== null ||
    thresholds.levelLow !== null ||
    thresholds.levelOptimalMin !== null ||
    thresholds.levelOptimalMax !== null ||
    thresholds.levelHigh !== null ||
    thresholds.levelDangerous !== null
  );
}
