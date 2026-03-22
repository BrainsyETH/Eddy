'use client';

// src/components/home/FeaturedRivers.tsx
// Landing page gauge data preview — 2 prominent featured river cards + smaller row

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { useRiverGroups } from '@/hooks/useRiverGroups';
import { CONDITION_COLORS } from '@/constants';
import type { RiverGroup } from '@/lib/river-groups';
import FlowTrendChart from '@/components/ui/FlowTrendChart';

// Hardcoded featured river slugs
const FEATURED_SLUGS = ['current', 'meramec'];

function pickFeaturedRivers(groups: RiverGroup[]): RiverGroup[] {
  const bySlug = new Map(groups.map(g => [g.riverSlug, g]));
  const featured: RiverGroup[] = [];
  for (const slug of FEATURED_SLUGS) {
    const g = bySlug.get(slug);
    if (g) featured.push(g);
  }
  return featured;
}

export default function FeaturedRivers() {
  const { riverGroups, isLoading } = useRiverGroups();

  const featured = useMemo(() => pickFeaturedRivers(riverGroups), [riverGroups]);
  const secondary = useMemo(() => {
    const featuredIds = new Set(featured.map(r => r.riverId));
    return riverGroups
      .filter(r => !featuredIds.has(r.riverId))
      .slice(0, 3);
  }, [riverGroups, featured]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map(i => (
            <div key={i} className="bg-neutral-50 rounded-2xl p-6 h-56 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-neutral-50 rounded-xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (featured.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Top 2 featured cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {featured.map((river) => (
          <FeaturedCard key={river.riverId} river={river} />
        ))}
      </div>

      {/* Secondary row */}
      {secondary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {secondary.map((river) => (
            <SecondaryCard key={river.riverId} river={river} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeaturedCard({ river }: { river: RiverGroup }) {
  const { riverName, riverSlug, condition, primaryGauge, primaryThreshold } = river;
  const href = riverSlug ? `/gauges/${riverSlug}` : '#';

  const isCfsPrimary = primaryThreshold.thresholdUnit === 'cfs';
  const primaryValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  const unitLabel = isCfsPrimary ? 'cfs' : 'ft';
  const displayUnit = isCfsPrimary ? 'cfs' as const : 'ft' as const;
  const latestValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  const conditionColor = CONDITION_COLORS[condition.code] || CONDITION_COLORS.unknown;

  const chartThresholds = {
    levelTooLow: primaryThreshold.levelTooLow,
    levelLow: primaryThreshold.levelLow,
    levelOptimalMin: primaryThreshold.levelOptimalMin,
    levelOptimalMax: primaryThreshold.levelOptimalMax,
    levelHigh: primaryThreshold.levelHigh,
    levelDangerous: primaryThreshold.levelDangerous,
  };

  return (
    <Link
      href={href}
      className="group block bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-lg hover:border-neutral-300 transition-all no-underline"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-2 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              {primaryGauge.name}
            </p>
            <h3 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
              {riverName}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: conditionColor }}
              title={condition.label}
            />
            {primaryValue !== null && (
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-neutral-900 tabular-nums leading-none">
                  {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(1)}
                </span>
                <span className="text-xs font-medium text-neutral-400">{unitLabel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2">
        <FlowTrendChart
          gaugeSiteId={primaryGauge.usgsSiteId}
          days={14}
          thresholds={chartThresholds}
          latestValue={latestValue}
          displayUnit={displayUnit}
          chartClassName="h-32"
        />
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 pt-1 sm:px-6">
        <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-100">
          <span className="font-medium">{condition.label}</span>
          <span className="flex items-center gap-1 group-hover:text-neutral-700 transition-colors">
            View details <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function SecondaryCard({ river }: { river: RiverGroup }) {
  const { riverName, riverSlug, condition, primaryGauge, primaryThreshold } = river;
  const href = riverSlug ? `/gauges/${riverSlug}` : '#';

  const isCfsPrimary = primaryThreshold.thresholdUnit === 'cfs';
  const primaryValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  const unitLabel = isCfsPrimary ? 'cfs' : 'ft';
  const conditionColor = CONDITION_COLORS[condition.code] || CONDITION_COLORS.unknown;

  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 bg-white border border-neutral-200 rounded-xl px-4 py-4 hover:shadow-md hover:border-neutral-300 transition-all no-underline"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
          {riverName}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: conditionColor }}
          />
          <span className="text-xs text-neutral-500">{condition.label}</span>
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        {primaryValue !== null && (
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-neutral-900 tabular-nums">
              {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(1)}
            </span>
            <span className="text-xs text-neutral-400">{unitLabel}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
