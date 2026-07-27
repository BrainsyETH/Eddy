// src/lib/conditions.ts
// Centralized condition calculation logic used across the app.
//
// The COMPARISONS themselves now live in @shared/condition-ladder, alongside
// the condition system they produce codes for. They moved because the Expo app
// needs them too — it grades gauge readings on the phone to colour map pins —
// and this module cannot cross that boundary: it imports '@/constants', which
// is Next-only. Everything here is presentation on top of that ladder.

import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';
import {
  classifyReading,
  type ClassifyReadingOptions,
  type ConditionThresholds as LadderThresholds,
} from '@shared/condition-ladder';

export type ConditionThresholds = LadderThresholds;
export type ComputeConditionOptions = ClassifyReadingOptions;

export interface ConditionResult {
  code: ConditionCode;
  label: string;
  color: string;
}

export type FloatabilityClass = 'too_low' | 'floatable' | 'high' | 'dangerous' | 'unknown';

/**
 * Coarse safety class used to decide whether prose written for an earlier
 * reading is still compatible with the live river. Canonical labels remain
 * unchanged; this only prevents harmless good/low/flowing jitter from causing
 * unnecessary AI regeneration.
 */
export function getFloatabilityClass(code: string): FloatabilityClass {
  switch (code) {
    case 'too_low': return 'too_low';
    case 'low':
    case 'good':
    case 'flowing':
    case 'optimal': return 'floatable';
    case 'high': return 'high';
    case 'dangerous': return 'dangerous';
    default: return 'unknown';
  }
}

export function hasMaterialConditionChange(previousCode: string, nextCode: string): boolean {
  const previous = getFloatabilityClass(previousCode);
  const next = getFloatabilityClass(nextCode);
  return previous !== 'unknown' && next !== 'unknown' && previous !== next;
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
  dischargeCfs?: number | null,
  options?: ComputeConditionOptions
): ConditionResult {
  const code = classifyReading(gaugeHeightFt, thresholds, dischargeCfs, options);
  return {
    code,
    label: CONDITION_LABELS[code],
    color: CONDITION_COLORS[code],
  };
}

/**
 * NWS flood stage outranks the local condition ladder: a river at or above
 * flood stage is Dangerous regardless of where the float thresholds sit.
 *
 * SINGLE SOURCE OF TRUTH for that escalation. The gauge-report API used to
 * apply it inline while the river report's client-side computation did not,
 * so the server could withhold prose for a "dangerous" reading that the page
 * was still labeling "High".
 */
export function applyFloodStageOverride(
  code: ConditionCode,
  gaugeHeightFt: number | null,
  floodStageFt: number | null | undefined,
): ConditionCode {
  if (gaugeHeightFt == null || floodStageFt == null) return code;
  return gaugeHeightFt >= floodStageFt ? 'dangerous' : code;
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
      return 'Flowing';
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
