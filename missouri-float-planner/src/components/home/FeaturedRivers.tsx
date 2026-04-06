'use client';

// src/components/home/FeaturedRivers.tsx
// Landing page gauge data preview — 2 prominent featured river cards + smaller row

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Share2 } from 'lucide-react';

import { useRiverGroups } from '@/hooks/useRiverGroups';
import { CONDITION_COLORS, BG_BY_CONDITION, TEXT_BY_CONDITION, LABEL_BY_CONDITION, getEddyImageForCondition } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { RiverGroup } from '@/lib/river-groups';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1].map(i => (
          <div key={i} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden animate-pulse">
            {/* Header skeleton */}
            <div className="px-5 pt-5 pb-2 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="h-3 bg-neutral-200 rounded w-24 mb-2.5" />
                  <div className="h-5 bg-neutral-200 rounded w-36" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="h-6 bg-neutral-200 rounded-md w-16" />
                  <div className="h-7 bg-neutral-100 rounded w-20" />
                </div>
              </div>
            </div>
            {/* Chart skeleton */}
            <div className="px-2">
              <div className="h-32 mx-3 mb-1 rounded-lg bg-neutral-50 relative overflow-hidden">
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-neutral-100 to-transparent rounded-b-lg" />
              </div>
            </div>
            {/* Footer skeleton */}
            <div className="px-5 pb-4 pt-1 sm:px-6">
              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                <div className="h-3 bg-neutral-100 rounded w-12" />
                <div className="h-3 bg-neutral-100 rounded w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (featured.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 text-sm">
        River conditions are temporarily unavailable. Check back shortly.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {featured.map((river) => (
        <FeaturedCard key={river.riverId} river={river} />
      ))}
    </div>
  );
}

function FeaturedCard({ river }: { river: RiverGroup }) {
  const { riverName, riverSlug, condition, primaryGauge, primaryThreshold } = river;
  const href = riverSlug ? `/gauges/${riverSlug}` : '#';

  // Fetch Eddy update for this river
  const [eddyText, setEddyText] = useState<string | null>(null);
  useEffect(() => {
    if (!riverSlug) return;
    let cancelled = false;
    async function fetchEddy() {
      try {
        const res = await fetch(`/api/eddy-update/${riverSlug}`);
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled && data.available && data.update) {
          setEddyText(data.update.summaryText || data.update.quoteText);
        }
      } catch { /* silent */ }
    }
    fetchEddy();
    return () => { cancelled = true; };
  }, [riverSlug]);

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
              className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white"
              style={{ backgroundColor: conditionColor }}
            >
              {condition.label}
            </span>
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
          chartClassName="h-32 md:h-44"
        />
      </div>

      {/* Eddy Says blurb */}
      <div className="px-5 sm:px-6 pt-1">
        <div className={`border rounded-lg overflow-hidden ${BG_BY_CONDITION[condition.code] ?? BG_BY_CONDITION.unknown}`}>
          <div className="flex items-start gap-2 px-3 py-2">
            <div className="flex-shrink-0 w-7 h-7 relative">
              <Image
                src={getEddyImageForCondition(condition.code)}
                alt="Eddy"
                fill
                className="object-contain"
                sizes="28px"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] font-bold tracking-wide uppercase opacity-60">Eddy says</span>
                <span className={`text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-full ${(LABEL_BY_CONDITION[condition.code] ?? LABEL_BY_CONDITION.unknown).className}`}>
                  {(LABEL_BY_CONDITION[condition.code] ?? LABEL_BY_CONDITION.unknown).text}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed font-medium line-clamp-2 ${TEXT_BY_CONDITION[condition.code] ?? TEXT_BY_CONDITION.unknown}`}>
                &ldquo;{eddyText || CONDITION_CARD_BLURBS[condition.code] || CONDITION_CARD_BLURBS.unknown}&rdquo;
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 pt-2 sm:px-6">
        <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const url = `${window.location.origin}${href}`;
              if (navigator.share) {
                navigator.share({ title: `${riverName} River Report`, url });
              } else {
                navigator.clipboard.writeText(url);
              }
            }}
            className="flex items-center gap-1 font-medium text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <Share2 className="w-3 h-3" /> Share
          </button>
          <span className="flex items-center gap-1 group-hover:text-neutral-700 transition-colors">
            View details <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
