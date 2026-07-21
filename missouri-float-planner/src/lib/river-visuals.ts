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
 * Human date for when a photo was taken ("Jul 5, 2026"). Prefer captured_at
 * (EXIF) and fall back to the upload date at call sites. Null in, null out.
 */
export function formatPhotoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A river_gauges row carrying the threshold columns for one gauge. */
export interface GaugeThresholdRow {
  gauge_station_id: string | null;
  is_primary: boolean | null;
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  threshold_unit: string | null;
  // Optional embedded station, present when the query joins gauge_stations(name).
  gauge_stations?: { name: string | null } | { name: string | null }[] | null;
}

/**
 * Map each river gauge's station id to its display name, from river_gauges rows
 * that embed gauge_stations(name). Lets a photo be labeled with the gauge its
 * reading came from without embedding gauge_stations on community_reports
 * (whose gauge_station_id resolves to more than one relation).
 */
export function buildGaugeNameMap(gaugeRows: GaugeThresholdRow[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const g of gaugeRows) {
    if (!g.gauge_station_id) continue;
    const station = Array.isArray(g.gauge_stations) ? g.gauge_stations[0] : g.gauge_stations;
    if (station?.name) names.set(g.gauge_station_id, station.name);
  }
  return names;
}

/**
 * Build a river's condition thresholds keyed by gauge station, plus the primary
 * gauge's thresholds as a fallback. A photo is banded by the gauge that recorded
 * it (its reach gauge) so its level is accurate for that stretch; legacy photos
 * with no recorded gauge fall back to the primary. Both the map pins and the
 * gallery use this so a photo lands in the same band on either surface.
 */
export function buildGaugeThresholds(gaugeRows: GaugeThresholdRow[]): {
  thresholdsByGauge: Map<string, ConditionThresholds>;
  primaryThresholds: ConditionThresholds | null;
} {
  const toThresholds = (g: GaugeThresholdRow): ConditionThresholds => ({
    levelTooLow: g.level_too_low,
    levelLow: g.level_low,
    levelOptimalMin: g.level_optimal_min,
    levelOptimalMax: g.level_optimal_max,
    levelHigh: g.level_high,
    levelDangerous: g.level_dangerous,
    thresholdUnit: (g.threshold_unit as 'ft' | 'cfs') || undefined,
  });

  const thresholdsByGauge = new Map<string, ConditionThresholds>();
  let primaryThresholds: ConditionThresholds | null = null;
  for (const g of gaugeRows) {
    const t = toThresholds(g);
    if (g.gauge_station_id) thresholdsByGauge.set(g.gauge_station_id, t);
    if (g.is_primary) primaryThresholds = t;
  }
  if (!primaryThresholds && gaugeRows.length > 0) primaryThresholds = toThresholds(gaugeRows[0]);

  return { thresholdsByGauge, primaryThresholds };
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
