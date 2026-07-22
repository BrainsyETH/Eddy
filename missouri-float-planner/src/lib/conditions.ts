// src/lib/conditions.ts
// Centralized condition calculation logic used across the app

import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';

export interface ConditionThresholds {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  thresholdUnit?: 'ft' | 'cfs';
}

export interface ConditionResult {
  code: ConditionCode;
  label: string;
  color: string;
}

/**
 * Determines condition code based on gauge reading and thresholds
 * This is the single source of truth for condition calculation across the app
 *
 * Supports both ft (gauge height) and cfs (discharge) threshold units.
 * Uses the appropriate value based on thresholdUnit, with automatic fallback.
 *
 * @param gaugeHeightFt - Current gauge height in feet
 * @param thresholds - River-specific gauge thresholds
 * @param dischargeCfs - Current discharge in cubic feet per second (optional)
 * @returns Condition code, label, and color
 */
export function computeCondition(
  gaugeHeightFt: number | null,
  thresholds: ConditionThresholds,
  dischargeCfs?: number | null
): ConditionResult {
  // Determine which value to use based on threshold unit
  const useCfs = thresholds.thresholdUnit === 'cfs';

  // Use the preferred value, with fallback to the other if null
  let compareValue: number | null;
  if (useCfs) {
    compareValue = dischargeCfs ?? gaugeHeightFt;
  } else {
    compareValue = gaugeHeightFt ?? dischargeCfs ?? null;
  }

  if (compareValue === null) {
    return {
      code: 'unknown',
      label: CONDITION_LABELS.unknown,
      color: CONDITION_COLORS.unknown,
    };
  }

  // Check thresholds from highest to lowest (most dangerous first)
  if (thresholds.levelDangerous !== null && compareValue >= thresholds.levelDangerous) {
    return {
      code: 'dangerous',
      label: CONDITION_LABELS.dangerous,
      color: CONDITION_COLORS.dangerous,
    };
  }

  // Anything above optimal_max (or above level_high if optimal_max is null) is "high".
  // The Float Conditions bar paints the High band starting at optimal_max, so the code
  // must agree — otherwise the badge ("Good") and the needle position ("High") disagree.
  const highStart = thresholds.levelOptimalMax ?? thresholds.levelHigh;
  if (highStart !== null && compareValue > highStart) {
    return {
      code: 'high',
      label: CONDITION_LABELS.high,
      color: CONDITION_COLORS.high,
    };
  }

  if (
    thresholds.levelOptimalMin !== null &&
    thresholds.levelOptimalMax !== null &&
    compareValue >= thresholds.levelOptimalMin &&
    compareValue <= thresholds.levelOptimalMax
  ) {
    return {
      code: 'flowing',
      label: CONDITION_LABELS.flowing,
      color: CONDITION_COLORS.flowing,
    };
  }

  // "Good": at or above the low threshold. When a partial ladder defines only
  // where the optimal band begins (optimal_min) with no low/optimal_max anchor —
  // e.g. the moherp "Good begins at X" ratings on Gasconade/Jerome (400 cfs) and
  // Black/Annapolis (180 cfs) — fall back to optimal_min as the good floor.
  // Without this, a healthy reading passes every band above and lands on the
  // final "too_low" fall-through, so the gauge reads "Too Low" at any level.
  const goodFloor = thresholds.levelLow ?? thresholds.levelOptimalMin;
  if (goodFloor !== null && compareValue >= goodFloor) {
    return {
      code: 'good',
      label: CONDITION_LABELS.good,
      color: CONDITION_COLORS.good,
    };
  }

  if (thresholds.levelTooLow !== null && compareValue >= thresholds.levelTooLow) {
    return {
      code: 'low',
      label: CONDITION_LABELS.low,
      color: CONDITION_COLORS.low,
    };
  }

  // Below all thresholds
  return {
    code: 'too_low',
    label: CONDITION_LABELS.too_low,
    color: CONDITION_COLORS.too_low,
  };
}

/** Raw river_gauges row shape (snake_case) as returned by Supabase. */
export interface DbThresholdRow {
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  threshold_unit?: string | null;
}

/**
 * Compute condition from a raw river_gauges DB row plus a live reading.
 *
 * SINGLE SOURCE OF TRUTH for the app-side (non-RPC) fallback path — shared by
 * /api/plan and /api/conditions so they can never disagree. ALWAYS threads
 * `threshold_unit` and `dischargeCfs` through, so stage (ft) and discharge (cfs)
 * thresholds are never conflated (the F7 bug: the plan endpoint used to compare
 * gauge height in feet against CFS thresholds).
 */
export function computeConditionFromDbRow(
  gaugeHeightFt: number | null,
  row: DbThresholdRow,
  dischargeCfs?: number | null
): ConditionResult {
  const thresholds: ConditionThresholds = {
    levelTooLow: row.level_too_low,
    levelLow: row.level_low,
    levelOptimalMin: row.level_optimal_min,
    levelOptimalMax: row.level_optimal_max,
    levelHigh: row.level_high,
    levelDangerous: row.level_dangerous,
    thresholdUnit: (row.threshold_unit as 'ft' | 'cfs') || undefined,
  };
  return computeCondition(gaugeHeightFt, thresholds, dischargeCfs);
}

/**
 * Helper to get Tailwind color class for a condition code
 * Used by components that need Tailwind classes instead of hex colors
 */
export function getConditionTailwindColor(code: ConditionCode): string {
  switch (code) {
    case 'dangerous':
      return 'bg-red-600';
    case 'high':
      return 'bg-orange-500';
    case 'flowing':
      return 'bg-emerald-500'; // matches canonical #10b981 in shared/condition-system.ts
    case 'good':
      return 'bg-lime-500';
    case 'low':
      return 'bg-yellow-500';
    case 'too_low':
      return 'bg-stone-500';
    case 'unknown':
      return 'bg-neutral-400';
    default:
      return 'bg-neutral-400';
  }
}

/**
 * Maps legacy database condition codes to aligned frontend codes.
 * The database RPC returns 'optimal', 'low' (meaning "good/floatable"),
 * and 'very_low' (meaning "low/scraping").
 * Frontend uses 'flowing', 'good', and 'low' respectively for clarity.
 */
export function mapConditionCode(dbCode: string): ConditionCode {
  switch (dbCode) {
    case 'optimal': return 'flowing';
    case 'very_low': return 'low';
    case 'low': return 'good';
    default: return dbCode as ConditionCode;
  }
}

/**
 * Helper to get short label for compact displays
 * Maps to labels used in GaugeOverview component
 */
export function getConditionShortLabel(code: ConditionCode): string {
  switch (code) {
    case 'dangerous':
      return 'Flood';
    case 'high':
      return 'High';
    case 'flowing':
      return 'Ideal';
    case 'good':
      return 'Good';
    case 'low':
      return 'Low';
    case 'too_low':
      return 'Too Low';
    case 'unknown':
      return 'Unknown';
    default:
      return 'Unknown';
  }
}
