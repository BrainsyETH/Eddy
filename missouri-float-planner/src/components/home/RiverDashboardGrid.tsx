'use client';

// src/components/home/RiverDashboardGrid.tsx
// Compact all-rivers dashboard grid with mini sparklines and live readings

import Link from 'next/link';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import ConditionPulse from '@/components/ui/ConditionPulse';
import SparklineChart from '@/components/gauge/SparklineChart';

export default function RiverDashboardGrid() {
  const { riverGroups, isLoading } = useRiverGroups();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white border border-neutral-200 rounded-xl p-3 animate-pulse">
            <div className="h-3 bg-neutral-200 rounded w-20 mb-2" />
            <div className="h-8 bg-neutral-100 rounded mb-2" />
            <div className="h-5 bg-neutral-100 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (riverGroups.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {riverGroups.map((river) => {
        const condCode = river.condition.code;
        const condLabel = CONDITION_SHORT_LABELS[condCode] || 'Unknown';
        const condColor = CONDITION_COLORS[condCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
        const isCfs = river.primaryThreshold.thresholdUnit === 'cfs';
        const value = isCfs ? river.primaryGauge.dischargeCfs : river.primaryGauge.gaugeHeightFt;
        const unit = isCfs ? 'cfs' : 'ft';
        const href = river.riverSlug ? `/gauges/${river.riverSlug}` : '#';

        return (
          <Link
            key={river.riverId}
            href={href}
            className="group block bg-white border border-neutral-200 rounded-xl p-3 hover:shadow-md hover:border-neutral-300 transition-all no-underline"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <ConditionPulse conditionCode={condCode} size="sm" />
              <h3
                className="text-sm font-bold text-neutral-900 truncate"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {river.riverName}
              </h3>
            </div>

            <div className="h-10 mb-1.5">
              <SparklineChart
                siteId={river.primaryGauge.usgsSiteId}
                displayUnit={isCfs ? 'cfs' : 'ft'}
                className="h-10 w-full"
              />
            </div>

            <div className="flex items-center justify-between gap-1">
              {value !== null && (
                <span className="text-lg font-bold text-neutral-900 tabular-nums leading-none">
                  {isCfs ? value.toLocaleString() : value.toFixed(1)}
                  <span className="text-[10px] font-medium text-neutral-400 ml-0.5">{unit}</span>
                </span>
              )}
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white flex-shrink-0"
                style={{ backgroundColor: condColor }}
              >
                {condLabel}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
