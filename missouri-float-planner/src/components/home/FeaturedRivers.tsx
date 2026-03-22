'use client';

// src/components/home/FeaturedRivers.tsx
// Condensed conditions spotlight: global Eddy quote + 2-3 best-condition rivers

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { useRiverGroups } from '@/hooks/useRiverGroups';
import { BG_BY_CONDITION, TEXT_BY_CONDITION, getEddyImageForCondition } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { RiverGroup } from '@/lib/river-groups';
import type { ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

// Priority ordering for featuring rivers (best conditions first)
const CONDITION_PRIORITY: Record<string, number> = {
  optimal: 0,
  okay: 1,
  low: 2,
  too_low: 3,
  high: 4,
  dangerous: 5,
  unknown: 6,
};

function pickFeaturedRivers(groups: RiverGroup[], count: number): RiverGroup[] {
  return [...groups]
    .sort((a, b) => (CONDITION_PRIORITY[a.condition.code] ?? 6) - (CONDITION_PRIORITY[b.condition.code] ?? 6))
    .slice(0, count);
}

export default function FeaturedRivers() {
  const { riverGroups, isLoading } = useRiverGroups();
  const [globalQuote, setGlobalQuote] = useState<string | null>(null);

  // Fetch global Eddy quote
  useEffect(() => {
    let cancelled = false;
    async function fetchGlobal() {
      try {
        const res = await fetch('/api/eddy-update/global');
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled && data.available && data.update) {
          setGlobalQuote(data.update.summaryText || data.update.quoteText);
        }
      } catch {
        // silently fail
      }
    }
    fetchGlobal();
    return () => { cancelled = true; };
  }, []);

  const featured = useMemo(() => pickFeaturedRivers(riverGroups, 3), [riverGroups]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-40 bg-neutral-200 rounded animate-pulse" />
          <div className="h-4 w-28 bg-neutral-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white border border-neutral-200 rounded-xl p-4 h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (featured.length === 0) return null;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
          Today&apos;s Conditions
        </h2>
        <Link
          href="/gauges"
          className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          View all rivers
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Global Eddy quote */}
      {globalQuote && (
        <p className="text-sm text-neutral-600 leading-relaxed mb-4 bg-neutral-50 rounded-lg px-4 py-3 border border-neutral-100">
          &ldquo;{globalQuote}&rdquo;
        </p>
      )}

      {/* Featured river mini-cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {featured.map((river) => (
          <FeaturedRiverCard key={river.riverId} river={river} />
        ))}
      </div>
    </div>
  );
}

function FeaturedRiverCard({ river }: { river: RiverGroup }) {
  const { riverName, riverSlug, condition, primaryGauge, primaryThreshold } = river;
  const href = riverSlug ? `/gauges/${riverSlug}` : '#';

  const isCfsPrimary = primaryThreshold.thresholdUnit === 'cfs';
  const primaryValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  const unitLabel = isCfsPrimary ? 'cfs' : 'ft';

  const blurb = CONDITION_CARD_BLURBS[condition.code] || CONDITION_CARD_BLURBS.unknown;
  const bgClass = BG_BY_CONDITION[condition.code] ?? BG_BY_CONDITION.unknown;
  const textClass = TEXT_BY_CONDITION[condition.code] ?? TEXT_BY_CONDITION.unknown;

  return (
    <Link
      href={href}
      className="group block bg-white border border-neutral-200 rounded-xl overflow-hidden hover:border-primary-300 hover:shadow-md transition-all no-underline"
    >
      <div className="p-4">
        {/* River name + reading */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {riverName}
          </h3>
          {primaryValue !== null && (
            <span className="text-sm font-bold text-neutral-700 tabular-nums flex-shrink-0">
              {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(2)}
              <span className="text-xs font-normal text-neutral-400 ml-0.5">{unitLabel}</span>
            </span>
          )}
        </div>

        {/* Condition badge */}
        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold text-white mb-2.5 ${condition.tailwindColor}`}>
          {condition.label}
        </span>

        {/* Mini Eddy blurb */}
        <div className={`rounded-lg px-3 py-2 ${bgClass}`}>
          <div className="flex items-start gap-2">
            <Image
              src={getEddyImageForCondition(condition.code)}
              alt=""
              width={24}
              height={24}
              className="flex-shrink-0 mt-0.5"
            />
            <p className={`text-xs leading-relaxed line-clamp-2 font-medium ${textClass}`}>
              {blurb}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
