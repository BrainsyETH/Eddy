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

  if (thresholds.levelHigh !== null && compareValue >= thresholds.levelHigh) {
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
      code: 'optimal',
      label: CONDITION_LABELS.optimal,
      color: CONDITION_COLORS.optimal,
    };
  }

  if (thresholds.levelLow !== null && compareValue >= thresholds.levelLow) {
    return {
      code: 'low',
      label: CONDITION_LABELS.low,
      color: CONDITION_COLORS.low,
    };
  }

  if (thresholds.levelTooLow !== null && compareValue >= thresholds.levelTooLow) {
    return {
      code: 'very_low',
      label: CONDITION_LABELS.very_low,
      color: CONDITION_COLORS.very_low,
    };
  }

  // Below all thresholds
  return {
    code: 'too_low',
    label: CONDITION_LABELS.too_low,
    color: CONDITION_COLORS.too_low,
  };
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
    case 'optimal':
      return 'bg-emerald-600';
    case 'low':
      return 'bg-lime-500';
    case 'very_low':
      return 'bg-yellow-500';
    case 'too_low':
      return 'bg-neutral-400';
    case 'unknown':
      return 'bg-neutral-400';
    default:
      return 'bg-neutral-400';
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
    case 'optimal':
      return 'Optimal';
    case 'low':
      return 'Okay';
    case 'very_low':
      return 'Low';
    case 'too_low':
      return 'Too Low';
    case 'unknown':
      return 'Unknown';
    default:
      return 'Unknown';
  }
}
