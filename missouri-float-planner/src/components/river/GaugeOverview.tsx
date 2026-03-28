'use client';

// src/components/river/GaugeOverview.tsx
// Compact river conditions summary with links to full gauge report

import { useMemo } from 'react';
import Link from 'next/link';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import { computeCondition, getConditionTailwindColor, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { GaugeStation } from '@/hooks/useGaugeStations';
import type { ConditionCode } from '@/types/api';
import { ExternalLink, ArrowRight } from 'lucide-react';

interface GaugeOverviewProps {
  gauges: GaugeStation[] | undefined;
  riverId: string;
  riverSlug?: string;
  isLoading?: boolean;
  defaultOpen?: boolean;
  putInCoordinates?: { lat: number; lng: number } | null;
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const latDiff = lat1 - lat2;
  const lngDiff = lng1 - lng2;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

function getGaugeCondition(gauge: GaugeStation, riverId: string): {
  code: ConditionCode;
  label: string;
  color: string;
} {
  const threshold = gauge.thresholds?.find(t => t.riverId === riverId && t.isPrimary)
    || gauge.thresholds?.find(t => t.riverId === riverId);

  if (!threshold) {
    return { code: 'unknown', label: 'Unknown', color: 'bg-neutral-400' };
  }

  const thresholdsForCompute: ConditionThresholds = {
    levelTooLow: threshold.levelTooLow,
    levelLow: threshold.levelLow,
    levelOptimalMin: threshold.levelOptimalMin,
    levelOptimalMax: threshold.levelOptimalMax,
    levelHigh: threshold.levelHigh,
    levelDangerous: threshold.levelDangerous,
    thresholdUnit: threshold.thresholdUnit,
  };

  const result = computeCondition(gauge.gaugeHeightFt, thresholdsForCompute, gauge.dischargeCfs);

  return {
    code: result.code,
    label: getConditionShortLabel(result.code),
    color: getConditionTailwindColor(result.code),
  };
}

export default function GaugeOverview({
  gauges,
  riverId,
  riverSlug,
  isLoading,
  defaultOpen = false,
  putInCoordinates,
}: GaugeOverviewProps) {
  const closestGaugeId = useMemo(() => {
    if (!putInCoordinates || !gauges || gauges.length === 0) return null;
    let closest: GaugeStation | null = null;
    let minDistance = Infinity;
    for (const gauge of gauges) {
      const distance = getDistance(
        putInCoordinates.lat, putInCoordinates.lng,
        gauge.coordinates.lat, gauge.coordinates.lng
      );
      if (distance < minDistance) {
        minDistance = distance;
        closest = gauge;
      }
    }
    return closest?.id || null;
  }, [putInCoordinates, gauges]);

  if (isLoading) {
    return (
      <CollapsibleSection title="River Conditions" defaultOpen={defaultOpen}>
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-neutral-100 rounded-lg" />
          <div className="h-16 bg-neutral-100 rounded-lg" />
        </div>
      </CollapsibleSection>
    );
  }

  if (!gauges || gauges.length === 0) {
    return (
      <CollapsibleSection title="River Conditions" defaultOpen={defaultOpen}>
        <p className="text-neutral-500 text-sm">No gauge data available for this river.</p>
      </CollapsibleSection>
    );
  }

  const CONDITION_ORDER: ConditionCode[] = ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous'];
  const conditions = gauges.map(g => getGaugeCondition(g, riverId));
  const conditionCodes = conditions.map(c => c.code).filter(c => c !== 'unknown');
  const conditionIndices = conditionCodes.map(code => CONDITION_ORDER.indexOf(code)).filter(i => i !== -1);
  const minIndex = Math.min(...conditionIndices);
  const maxIndex = Math.max(...conditionIndices);
  const minCondition = conditions.find(c => c.code === CONDITION_ORDER[minIndex]);
  const maxCondition = conditions.find(c => c.code === CONDITION_ORDER[maxIndex]);

  let badge = null;
  if (minCondition && maxCondition) {
    if (minIndex === maxIndex) {
      badge = (
        <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${minCondition.color}`}>
          {minCondition.label}
        </span>
      );
    } else {
      badge = (
        <span className="flex items-center gap-1 text-xs font-bold">
          <span className={`px-1.5 py-0.5 rounded text-white ${minCondition.color}`}>{minCondition.label}</span>
          <span className="text-neutral-500">→</span>
          <span className={`px-1.5 py-0.5 rounded text-white ${maxCondition.color}`}>{maxCondition.label}</span>
        </span>
      );
    }
  }

  return (
    <CollapsibleSection title="River Conditions" defaultOpen={defaultOpen} badge={badge}>
      <div className="space-y-2">
        {gauges.map((gauge) => {
          const condition = getGaugeCondition(gauge, riverId);
          const isClosest = gauge.id === closestGaugeId;
          const threshold = gauge.thresholds?.find(t => t.riverId === riverId && t.isPrimary)
            || gauge.thresholds?.find(t => t.riverId === riverId);
          const useCfs = threshold?.thresholdUnit === 'cfs';

          const primaryVal = useCfs ? gauge.dischargeCfs : gauge.gaugeHeightFt;
          const primaryUnit = useCfs ? 'cfs' : 'ft';
          const primaryLabel = useCfs ? 'Flow' : 'Stage';
          const primaryFormatted = primaryVal !== null
            ? useCfs ? primaryVal.toLocaleString() : primaryVal.toFixed(2)
            : '—';

          const secondaryVal = useCfs ? gauge.gaugeHeightFt : gauge.dischargeCfs;
          const secondaryUnit = useCfs ? 'ft' : 'cfs';
          const secondaryFormatted = secondaryVal !== null
            ? useCfs ? secondaryVal.toFixed(2) : secondaryVal.toLocaleString()
            : null;

          // Reading age
          const ageText = gauge.readingAgeHours != null
            ? gauge.readingAgeHours < 1
              ? `${Math.round(gauge.readingAgeHours * 60)}m ago`
              : gauge.readingAgeHours < 24
                ? `${Math.round(gauge.readingAgeHours)}h ago`
                : `${Math.round(gauge.readingAgeHours / 24)}d ago`
            : null;

          return (
            <div
              key={gauge.id}
              className={`rounded-lg p-3 ${
                isClosest
                  ? 'border-2 border-green-500 bg-green-50'
                  : 'border border-neutral-200 bg-white'
              }`}
            >
              {/* Top row: name + badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${condition.color}`} />
                  <p className="font-semibold text-neutral-900 text-sm truncate">{gauge.name}</p>
                  {isClosest && (
                    <span className="px-1.5 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded flex-shrink-0">
                      Closest
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${condition.color}`}>
                    {condition.label}
                  </span>
                  <a
                    href={`https://waterdata.usgs.gov/monitoring-location/${gauge.usgsSiteId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-400 hover:text-primary-600"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Readings row */}
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-lg font-bold text-neutral-900 tabular-nums">
                  {primaryFormatted}
                </span>
                <span className="text-xs text-neutral-500">{primaryUnit}</span>
                <span className="text-[10px] text-primary-600 font-medium">{primaryLabel}</span>
                {secondaryFormatted && (
                  <>
                    <span className="text-neutral-300">·</span>
                    <span className="text-sm text-neutral-500 tabular-nums">{secondaryFormatted} {secondaryUnit}</span>
                  </>
                )}
                {ageText && (
                  <>
                    <span className="text-neutral-300 ml-auto">·</span>
                    <span className="text-[10px] text-neutral-400">{ageText}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full report link */}
      {riverSlug && (
        <Link
          href={`/gauges/${riverSlug}`}
          className="flex items-center justify-center gap-1.5 mt-4 py-2.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-sm font-semibold hover:bg-primary-100 transition-colors"
        >
          View full river report
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-neutral-200">
        <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 text-xs">
          {[
            { color: 'bg-neutral-400', label: 'Too Low' },
            { color: 'bg-yellow-500', label: 'Low' },
            { color: 'bg-lime-500', label: 'Good' },
            { color: 'bg-emerald-600', label: 'Flowing' },
            { color: 'bg-orange-500', label: 'High' },
            { color: 'bg-red-600', label: 'Flood' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-neutral-600">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}
