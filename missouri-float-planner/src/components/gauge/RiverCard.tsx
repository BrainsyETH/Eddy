'use client';

// src/components/gauge/RiverCard.tsx
// Dashboard card representing one river with 14-day chart, Eddy Says, and condition

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Droplets, ArrowRight, ChevronDown, ChevronUp, Camera } from 'lucide-react';

import type { RiverGroup } from '@/lib/river-groups';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { getEddyImageForCondition } from '@/constants';
import { conditionChip } from '@shared/condition-system';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { CONDITION_CARD_BLURBS, RIVER_NOTES } from '@/data/eddy-quotes';
import FlowTrendChart from '@/components/ui/FlowTrendChart';

interface RiverCardProps {
  riverGroup: RiverGroup;
}

export default function RiverCard({ riverGroup }: RiverCardProps) {
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

  // Always use live condition so card badge matches the current gauge reading
  const displayConditionCode = condition.code;
  const surface = conditionChip(displayConditionCode);
  const surfaceStyle = { backgroundColor: surface.background, borderColor: surface.borderColor };

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

  const href = riverSlug ? `/rivers/${riverSlug}` : '#';

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden transition-all hover:shadow-md hover:border-primary-300">
      {/* Header: River name + condition + reading */}
      <Link href={href} className="block">
        <div className="px-4 pt-4 pb-2 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <Droplets className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <h2 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
                  {riverName}
                </h2>
              </div>
              <p className="text-xs text-neutral-500 truncate mb-1.5">
                {primaryGauge.name}
              </p>
              <div className="flex items-center gap-2">
                <ConditionBadge code={condition.code} size="sm" />
                <span className="text-xs text-neutral-500">
                  {allGauges.length} gauge{allGauges.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Current reading */}
            <div className="flex flex-col items-end flex-shrink-0">
              {primaryValue !== null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-neutral-900 tabular-nums">
                    {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(2)}
                  </span>
                  <span className="text-xs font-medium text-neutral-500">{primaryUnitLabel}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 14-Day Chart with threshold lines */}
        <div className="px-1">
          <FlowTrendChart
            gaugeSiteId={primaryGauge.usgsSiteId}
            days={14}
            thresholds={chartThresholds}
            latestValue={latestValue}
            displayUnit={displayUnit}
            chartClassName="h-32"
          />
        </div>
      </Link>

      {/* Eddy Says blurb */}
      <div className="px-4 pb-4 pt-1 sm:px-5">
        <div className="border rounded-lg overflow-hidden" style={surfaceStyle}>
          <div className="flex items-start gap-2.5 px-3 py-2.5">
            <div className="flex-shrink-0 w-9 h-9 relative">
              <Image
                src={getEddyImageForCondition(displayConditionCode)}
                alt="Eddy the Otter"
                fill
                className="object-contain"
                sizes="36px"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold tracking-wide uppercase opacity-60">Eddy says</span>
                <ConditionBadge code={displayConditionCode} size="sm" uppercase />
              </div>
              {eddyLoading && !eddyUpdate ? (
                <p className="text-xs text-neutral-500 italic">Loading...</p>
              ) : (
                <p className={`text-xs leading-relaxed font-medium ${showFull ? '' : 'line-clamp-2'}`} style={{ color: surface.color }}>
                  &ldquo;{displayText}&rdquo;
                </p>
              )}
              {eddyUpdate?.summaryText && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFull(!showFull); }}
                  aria-expanded={showFull}
                  aria-label={showFull ? 'Show less' : 'Show more details'}
                  className="flex items-center gap-1 text-[10px] font-semibold transition-colors mt-0.5 opacity-60 hover:opacity-100"
                  style={{ color: surface.color }}
                >
                  {showFull ? <>Less <ChevronUp className="w-2.5 h-2.5" aria-hidden="true" /></> : <>More <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" /></>}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action links */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-neutral-100">
          <Link
            href={href}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:gap-2 transition-all"
          >
            Full River Report
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/rivers/${riverSlug}?submitPhoto=true`}
            className="flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-teal-600 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            Add Photo
          </Link>
        </div>
      </div>
    </div>
  );
}
