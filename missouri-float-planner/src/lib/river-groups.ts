// src/lib/river-groups.ts
// Utility to group gauge stations by river for the river-focused dashboard

import { computeCondition, getConditionShortLabel, getConditionTailwindColor, type ConditionThresholds } from '@/lib/conditions';
import type { GaugeStation } from '@/app/api/gauges/route';
import type { ConditionCode } from '@/types/api';

export interface RiverGroup {
  riverId: string;
  riverName: string;
  riverSlug: string | null;
  condition: { code: ConditionCode; label: string; tailwindColor: string };
  primaryGauge: GaugeStation;
  allGauges: GaugeStation[];
  primaryThreshold: NonNullable<GaugeStation['thresholds']>[0];
}

/**
 * Groups gauge stations by their primary river association.
 * Each gauge is bucketed under its primary river (isPrimary threshold).
 * Returns sorted array of RiverGroups with computed conditions.
 */
export function groupGaugesByRiver(gauges: GaugeStation[]): RiverGroup[] {
  const riverMap = new Map<string, {
    riverId: string;
    riverName: string;
    riverSlug: string | null;
    gauges: GaugeStation[];
    primaryGauge: GaugeStation | null;
    primaryThreshold: NonNullable<GaugeStation['thresholds']>[0] | null;
  }>();

  for (const gauge of gauges) {
    if (!gauge.thresholds) continue;

    // Iterate ALL thresholds so a gauge appears under every river it serves
    for (const threshold of gauge.thresholds) {
      const { riverId, riverName, riverSlug } = threshold;

      if (!riverMap.has(riverId)) {
        riverMap.set(riverId, {
          riverId,
          riverName,
          riverSlug,
          gauges: [],
          primaryGauge: null,
          primaryThreshold: null,
        });
      }

      const group = riverMap.get(riverId)!;
      // Avoid adding the same gauge twice for the same river
      if (!group.gauges.some(g => g.usgsSiteId === gauge.usgsSiteId)) {
        group.gauges.push(gauge);
      }

      // The primary gauge for this river is the one marked isPrimary for it
      if (threshold.isPrimary) {
        group.primaryGauge = gauge;
        group.primaryThreshold = threshold;
      }
    }
  }

  const result: RiverGroup[] = [];

  for (const group of Array.from(riverMap.values())) {
    // Use first gauge as fallback if no explicit primary
    const primaryGauge = group.primaryGauge || group.gauges[0];
    const primaryThreshold = group.primaryThreshold ||
      primaryGauge.thresholds?.find((t: NonNullable<GaugeStation['thresholds']>[0]) => t.riverId === group.riverId) ||
      primaryGauge.thresholds?.[0];

    if (!primaryThreshold) continue;

    // Compute condition using the primary gauge's reading + this river's thresholds
    const thresholds: ConditionThresholds = {
      levelTooLow: primaryThreshold.levelTooLow,
      levelLow: primaryThreshold.levelLow,
      levelOptimalMin: primaryThreshold.levelOptimalMin,
      levelOptimalMax: primaryThreshold.levelOptimalMax,
      levelHigh: primaryThreshold.levelHigh,
      levelDangerous: primaryThreshold.levelDangerous,
      thresholdUnit: primaryThreshold.thresholdUnit,
    };

    const conditionResult = computeCondition(
      primaryGauge.gaugeHeightFt,
      thresholds,
      primaryGauge.dischargeCfs
    );

    result.push({
      riverId: group.riverId,
      riverName: group.riverName,
      riverSlug: group.riverSlug,
      condition: {
        code: conditionResult.code,
        label: getConditionShortLabel(conditionResult.code),
        tailwindColor: getConditionTailwindColor(conditionResult.code),
      },
      primaryGauge,
      allGauges: group.gauges,
      primaryThreshold,
    });
  }

  return result.sort((a, b) => a.riverName.localeCompare(b.riverName));
}

/**
 * Find a specific river group by its slug
 */
export function findRiverGroupBySlug(groups: RiverGroup[], slug: string): RiverGroup | null {
  return groups.find(g => g.riverSlug === slug) || null;
}
