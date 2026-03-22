'use client';

// src/components/gauge/RiverCard.tsx
// Clean, modern river gauge card with optional featured layout

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

import type { RiverGroup } from '@/lib/river-groups';
import type { ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { BG_BY_CONDITION, TEXT_BY_CONDITION, LABEL_BY_CONDITION, CONDITION_COLORS, getEddyImageForCondition } from '@/constants';
import { CONDITION_CARD_BLURBS, RIVER_NOTES } from '@/data/eddy-quotes';
import FlowTrendChart from '@/components/ui/FlowTrendChart';

interface RiverCardProps {
  riverGroup: RiverGroup;
  featured?: boolean;
}

export default function RiverCard({ riverGroup, featured = false }: RiverCardProps) {
  const { riverName, riverSlug, condition, primaryGauge, primaryThreshold, allGauges } = riverGroup;

  const [eddyUpdate, setEddyUpdate] = useState<EddyUpdateResponse['update'] | null>(null);
  const [eddyLoading, setEddyLoading] = useState(false);
  const [showFull, setShowFull] = useState(false);

  // Fetch Eddy update
  useEffect(() => {
    if (!riverSlug) return;
    let cancelled = false;
    setEddyLoading(true);

    async function fetchEddy() {
      try {
        const res = await fetch(`/api/eddy-update/${riverSlug}`);
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled) {
          setEddyUpdate(data.available ? data.update : null);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setEddyLoading(false);
      }
    }
    fetchEddy();
    return () => { cancelled = true; };
  }, [riverSlug]);

  // Build static fallback text
  const buildStaticText = () => {
    const blurb = CONDITION_CARD_BLURBS[condition.code] || CONDITION_CARD_BLURBS.unknown;
    const parts: string[] = [];
    if (primaryGauge.gaugeHeightFt !== null) {
      parts.push(`Reading ${primaryGauge.gaugeHeightFt.toFixed(1)} ft.`);
    }
    parts.push(blurb);
    const optMin = primaryThreshold.levelOptimalMin;
    const optMax = primaryThreshold.levelOptimalMax;
    const unit = primaryThreshold.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
    if (optMin != null && optMax != null) {
      parts.push(`Optimal range: ${optMin}\u2013${optMax} ${unit}.`);
    }
    const notes = riverSlug ? RIVER_NOTES[riverSlug] : null;
    if (notes) parts.push(notes);
    return parts.join(' ');
  };

  const displayConditionCode = (eddyUpdate?.conditionCode as ConditionCode) || condition.code;
  const eddyBgClass = BG_BY_CONDITION[displayConditionCode] ?? BG_BY_CONDITION.unknown;
  const textClass = TEXT_BY_CONDITION[displayConditionCode] ?? TEXT_BY_CONDITION.unknown;
  const label = LABEL_BY_CONDITION[displayConditionCode] ?? LABEL_BY_CONDITION.unknown;

  const displayText = eddyUpdate?.summaryText && !showFull
    ? eddyUpdate.summaryText
    : eddyUpdate ? eddyUpdate.quoteText : buildStaticText();

  const isCfsPrimary = primaryThreshold.thresholdUnit === 'cfs';
  const primaryValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  const primaryUnitLabel = isCfsPrimary ? 'cfs' : 'ft';
  const displayUnit = isCfsPrimary ? 'cfs' as const : 'ft' as const;
  const latestValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;

  const chartThresholds = {
    levelTooLow: primaryThreshold.levelTooLow,
    levelLow: primaryThreshold.levelLow,
    levelOptimalMin: primaryThreshold.levelOptimalMin,
    levelOptimalMax: primaryThreshold.levelOptimalMax,
    levelHigh: primaryThreshold.levelHigh,
    levelDangerous: primaryThreshold.levelDangerous,
  };

  const href = riverSlug ? `/gauges/${riverSlug}` : '#';
  const conditionColor = CONDITION_COLORS[condition.code] || CONDITION_COLORS.unknown;

  return (
    <div className={`bg-white border border-neutral-200 rounded-2xl overflow-hidden transition-all hover:shadow-lg hover:border-neutral-300 ${featured ? 'shadow-sm' : ''}`}>
      <Link href={href} className="block">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                {allGauges.length} gauge{allGauges.length !== 1 ? 's' : ''} &middot; {primaryGauge.name}
              </p>
              <h2 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
                {riverName}
              </h2>
            </div>

            {/* Condition indicator + reading */}
            <div className="flex flex-col items-end flex-shrink-0 gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: conditionColor }}
                title={condition.label}
              />
              {primaryValue !== null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-neutral-900 tabular-nums leading-none">
                    {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(1)}
                  </span>
                  <span className="text-xs font-medium text-neutral-400">{primaryUnitLabel}</span>
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
            chartClassName={featured ? 'h-36' : 'h-28'}
          />
        </div>
      </Link>

      {/* Eddy Says section */}
      <div className="px-5 pb-5 pt-2 sm:px-6">
        <div className={`rounded-xl overflow-hidden ${eddyBgClass}`}>
          <div className="flex items-start gap-3 px-3.5 py-3">
            <div className="flex-shrink-0 w-8 h-8 relative">
              <Image
                src={getEddyImageForCondition(displayConditionCode)}
                alt="Eddy the Otter"
                fill
                className="object-contain"
                sizes="32px"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold tracking-wider uppercase opacity-50">Eddy says</span>
                <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${label.className}`}>
                  {label.text}
                </span>
              </div>
              {eddyLoading && !eddyUpdate ? (
                <p className="text-xs text-neutral-400 italic">Loading...</p>
              ) : (
                <p className={`text-xs leading-relaxed font-medium line-clamp-2 ${textClass}`}>
                  &ldquo;{displayText}&rdquo;
                </p>
              )}
              {eddyUpdate?.summaryText && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFull(!showFull); }}
                  className={`flex items-center gap-1 text-[10px] font-semibold transition-colors mt-1 ${textClass} opacity-50 hover:opacity-100`}
                >
                  {showFull ? <>Less <ChevronUp className="w-2.5 h-2.5" /></> : <>More <ChevronDown className="w-2.5 h-2.5" /></>}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* View details */}
        <Link
          href={href}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 mt-3 pt-3 border-t border-neutral-100 hover:text-neutral-700 hover:gap-2.5 transition-all"
        >
          View River Gauges
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
