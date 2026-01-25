'use client';

// src/components/river/GaugeOverview.tsx
// High-level overview of gauge stations for a river

import CollapsibleSection from '@/components/ui/CollapsibleSection';
import type { GaugeStation } from '@/hooks/useGaugeStations';

interface GaugeOverviewProps {
  gauges: GaugeStation[] | undefined;
  riverId: string;
  isLoading?: boolean;
  defaultOpen?: boolean;
}

// Determine condition based on gauge height and thresholds
function getGaugeCondition(gauge: GaugeStation, riverId: string): {
  code: string;
  label: string;
  color: string;
} {
  const height = gauge.gaugeHeightFt;

  // Find threshold for this river - prefer primary (matches conditions API)
  const threshold = gauge.thresholds?.find(t => t.riverId === riverId && t.isPrimary)
    || gauge.thresholds?.find(t => t.riverId === riverId);

  if (height === null || !threshold) {
    return { code: 'unknown', label: 'Unknown', color: 'bg-neutral-400' };
  }

  // Check thresholds from highest to lowest
  if (threshold.levelDangerous !== null && height >= threshold.levelDangerous) {
    return { code: 'dangerous', label: 'Flood', color: 'bg-red-600' };
  }
  if (threshold.levelHigh !== null && height >= threshold.levelHigh) {
    return { code: 'high', label: 'High', color: 'bg-orange-500' };
  }
  if (threshold.levelOptimalMin !== null && threshold.levelOptimalMax !== null &&
      height >= threshold.levelOptimalMin && height <= threshold.levelOptimalMax) {
    return { code: 'optimal', label: 'Optimal', color: 'bg-emerald-500' };
  }
  if (threshold.levelLow !== null && height >= threshold.levelLow) {
    return { code: 'low', label: 'Good', color: 'bg-lime-500' };
  }
  // Between level_too_low and level_low = some dragging expected
  if (threshold.levelTooLow !== null && height >= threshold.levelTooLow) {
    return { code: 'very_low', label: 'Low', color: 'bg-yellow-500' };
  }
  // Below level_too_low = too low for comfortable floating
  return { code: 'too_low', label: 'Too Low', color: 'bg-neutral-400' };
}

export default function GaugeOverview({ gauges, riverId, isLoading, defaultOpen = true }: GaugeOverviewProps) {
  if (isLoading) {
    return (
      <CollapsibleSection title="Gauge Stations" defaultOpen={defaultOpen}>
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-neutral-100 rounded-lg"></div>
          <div className="h-10 bg-neutral-100 rounded-lg"></div>
        </div>
      </CollapsibleSection>
    );
  }

  if (!gauges || gauges.length === 0) {
    return (
      <CollapsibleSection title="Gauge Stations" defaultOpen={defaultOpen}>
        <p className="text-neutral-500 text-sm">No gauge data available for this river.</p>
      </CollapsibleSection>
    );
  }

  // Get overall condition badge - show BEST condition (most favorable for floating)
  const conditions = gauges.map(g => getGaugeCondition(g, riverId));
  const bestCondition = conditions.find(c => c.code === 'optimal') ||
    conditions.find(c => c.code === 'low') ||  // "Good" - floatable
    conditions.find(c => c.code === 'high') ||
    conditions.find(c => c.code === 'very_low') ||
    conditions.find(c => c.code === 'dangerous') ||
    conditions[0];

  const badge = bestCondition ? (
    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${bestCondition.color}`}>
      {bestCondition.label}
    </span>
  ) : null;

  return (
    <CollapsibleSection title="Gauge Stations" defaultOpen={defaultOpen} badge={badge}>
      <div className="space-y-2">
        {gauges.map((gauge) => {
          const condition = getGaugeCondition(gauge, riverId);

          return (
            <div
              key={gauge.id}
              className="flex items-center justify-between py-3 px-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors"
            >
              {/* Left side - Gauge name and status */}
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${condition.color}`} />
                <div>
                  <p className="font-semibold text-neutral-900 text-sm">{gauge.name}</p>
                  <p className="text-xs text-neutral-500">
                    USGS {gauge.usgsSiteId}
                  </p>
                </div>
              </div>

              {/* Right side - Reading values */}
              <div className="flex items-center gap-4 text-right">
                {gauge.gaugeHeightFt !== null && (
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{gauge.gaugeHeightFt.toFixed(2)} ft</p>
                    <p className="text-[10px] text-neutral-500 uppercase">Stage</p>
                  </div>
                )}
                {gauge.dischargeCfs !== null && (
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{gauge.dischargeCfs.toLocaleString()} cfs</p>
                    <p className="text-[10px] text-neutral-500 uppercase">Flow</p>
                  </div>
                )}
                <div className={`px-2.5 py-1 rounded-md text-xs font-bold ${condition.color} text-white`}>
                  {condition.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-neutral-200">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-neutral-500 font-medium">Conditions:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-neutral-600">Low</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-lime-500" />
            <span className="text-neutral-600">Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-neutral-600">Optimal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-neutral-600">High</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            <span className="text-neutral-600">Flood</span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
