// src/lib/river-visuals.ts
// Matching logic for dynamic river visuals
// Determines which community-submitted photos match current river conditions

import { computeCondition, type ConditionThresholds } from './conditions';
import type { ConditionCode, RiverVisual } from '@/types/api';

/**
 * Computes the condition code for a photo's stored gauge readings
 * using the current (potentially updated) thresholds.
 */
export function getPhotoConditionCode(
  gaugeHeightFt: number | null,
  dischargeCfs: number | null,
  thresholds: ConditionThresholds
): ConditionCode {
  return computeCondition(gaugeHeightFt, thresholds, dischargeCfs).code;
}

/**
 * Filters visuals to those matching the current condition band,
 * then sorts by proximity to the current reading.
 *
 * @param visuals - All approved river visuals
 * @param currentGaugeHeightFt - Current gauge height
 * @param currentDischargeCfs - Current discharge
 * @param thresholds - Current river thresholds
 * @param accessPointId - Optional: prefer photos from this access point
 * @returns Filtered and sorted visuals with computed condition codes
 */
export function matchVisualsToCondition(
  visuals: RiverVisual[],
  currentGaugeHeightFt: number | null,
  currentDischargeCfs: number | null,
  thresholds: ConditionThresholds,
  accessPointId?: string | null
): RiverVisual[] {
  const currentCondition = computeCondition(
    currentGaugeHeightFt,
    thresholds,
    currentDischargeCfs
  );

  // Determine the primary comparison value based on threshold unit
  const useCfs = thresholds.thresholdUnit === 'cfs';
  const currentValue = useCfs
    ? (currentDischargeCfs ?? currentGaugeHeightFt)
    : (currentGaugeHeightFt ?? currentDischargeCfs);

  // Filter to visuals in the same condition band
  const matched = visuals.filter(
    (v) => v.conditionCode === currentCondition.code
  );

  // Sort: prefer same access point first, then by proximity to current reading
  matched.sort((a, b) => {
    // Access point match preference
    if (accessPointId) {
      const aMatch = a.accessPointId === accessPointId ? 0 : 1;
      const bMatch = b.accessPointId === accessPointId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }

    // Proximity to current reading
    if (currentValue !== null) {
      const aValue = useCfs
        ? (a.dischargeCfs ?? a.gaugeHeightFt)
        : (a.gaugeHeightFt ?? a.dischargeCfs);
      const bValue = useCfs
        ? (b.dischargeCfs ?? b.gaugeHeightFt)
        : (b.gaugeHeightFt ?? b.dischargeCfs);

      const aDiff = aValue !== null ? Math.abs(aValue - currentValue) : Infinity;
      const bDiff = bValue !== null ? Math.abs(bValue - currentValue) : Infinity;
      return aDiff - bDiff;
    }

    // Fallback: newest first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return matched;
}
