'use client';

// src/components/gauge/RiverCard.tsx
// Dashboard card representing one river with Eddy Says, sparkline, and condition

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Droplets, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

import type { RiverGroup } from '@/lib/river-groups';
import type { ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { BG_BY_CONDITION, TEXT_BY_CONDITION, LABEL_BY_CONDITION, getEddyImageForCondition } from '@/constants';
import { CONDITION_CARD_BLURBS, RIVER_NOTES } from '@/data/eddy-quotes';
import SparklineChart from '@/components/gauge/SparklineChart';

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

  const displayConditionCode = (eddyUpdate?.conditionCode as ConditionCode) || condition.code;
  const bgClass = BG_BY_CONDITION[displayConditionCode] ?? BG_BY_CONDITION.unknown;
  const textClass = TEXT_BY_CONDITION[displayConditionCode] ?? TEXT_BY_CONDITION.unknown;
  const label = LABEL_BY_CONDITION[displayConditionCode] ?? LABEL_BY_CONDITION.unknown;

  const displayText = eddyUpdate?.summaryText && !showFull
    ? eddyUpdate.summaryText
    : eddyUpdate ? eddyUpdate.quoteText : buildStaticText();

  const isCfsPrimary = primaryThreshold.thresholdUnit === 'cfs';
  const primaryValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  const primaryUnit = isCfsPrimary ? 'cfs' : 'ft';

  const href = riverSlug ? `/gauges/${riverSlug}` : '#';

  return (
    <div className={`border rounded-xl overflow-hidden transition-all hover:shadow-md ${bgClass}`}>
      {/* Header: River name + condition + reading */}
      <Link href={href} className="block">
        <div className="px-4 pt-4 pb-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <Droplets className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <h2 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
                  {riverName}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold text-white ${condition.tailwindColor}`}>
                  {condition.label}
                </span>
                <span className="text-xs text-neutral-500">
                  {allGauges.length} gauge{allGauges.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Reading + sparkline */}
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {primaryValue !== null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-neutral-900 tabular-nums">
                    {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(2)}
                  </span>
                  <span className="text-xs font-medium text-neutral-500">{primaryUnit}</span>
                </div>
              )}
              <SparklineChart
                siteId={primaryGauge.usgsSiteId}
                displayUnit={primaryThreshold.thresholdUnit}
                className="w-20 h-8 text-primary-400"
              />
            </div>
          </div>
        </div>
      </Link>

      {/* Eddy Says blurb */}
      <div className="px-4 pb-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 relative">
            <Image
              src={getEddyImageForCondition(displayConditionCode)}
              alt="Eddy the Otter"
              fill
              className="object-contain"
              sizes="40px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold tracking-wide uppercase opacity-60">Eddy says</span>
              <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${label.className}`}>
                {label.text}
              </span>
            </div>
            {eddyLoading && !eddyUpdate ? (
              <p className="text-xs text-neutral-500 italic">Loading...</p>
            ) : (
              <p className={`text-sm leading-relaxed font-medium line-clamp-2 ${textClass}`}>
                &ldquo;{displayText}&rdquo;
              </p>
            )}
            {eddyUpdate?.summaryText && (
              <button
                onClick={(e) => { e.preventDefault(); setShowFull(!showFull); }}
                className={`flex items-center gap-1 text-[10px] font-semibold transition-colors mt-0.5 ${textClass} opacity-60 hover:opacity-100`}
              >
                {showFull ? <>Less <ChevronUp className="w-2.5 h-2.5" /></> : <>More <ChevronDown className="w-2.5 h-2.5" /></>}
              </button>
            )}
          </div>
        </div>

        {/* View details link */}
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 mt-3 pt-2.5 border-t border-black/5 hover:gap-2 transition-all"
        >
          View River Gauges
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
