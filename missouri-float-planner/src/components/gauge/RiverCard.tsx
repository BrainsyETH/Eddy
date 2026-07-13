'use client';

// src/components/gauge/RiverCard.tsx
// Dashboard card representing one river with 14-day chart, Eddy Says, and condition

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Droplets, ArrowRight, ChevronDown, ChevronUp, Camera } from 'lucide-react';

import type { RiverGroup } from '@/lib/river-groups';
import { type RiverFilterMeta, DIFFICULTY_TIER_LABELS, riverTypeLabel } from '@/lib/rivers/filters';
import { useEddyUpdates } from '@/hooks/useEddyUpdates';
import { getEddyImageForCondition } from '@/constants';
import { conditionChip } from '@shared/condition-system';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { buildStaticEddyText, RIVER_NOTES } from '@/data/eddy-quotes';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import GaugeTrendContext from '@/components/gauge/GaugeTrendContext';

interface RiverCardProps {
  riverGroup: RiverGroup;
  /** Optional per-river metadata (state, type, difficulty, length) for the info line. */
  meta?: RiverFilterMeta;
  /** Straight-line distance from the visitor, when the "Nearest me" sort is active. */
  distanceMiles?: number | null;
}

export default function RiverCard({ riverGroup, meta, distanceMiles }: RiverCardProps) {
  const { riverName, riverSlug, condition, primaryGauge, primaryThreshold, allGauges } = riverGroup;

  // Compact "at a glance" descriptors, shown as a muted dot-separated line so a
  // grid of many rivers stays scannable (distance / state / length / type /
  // difficulty). Distance leads when present since it's why the card is here.
  const metaBits: string[] = [];
  if (distanceMiles != null && Number.isFinite(distanceMiles)) {
    metaBits.push(`${Math.max(1, Math.round(distanceMiles))} mi away`);
  }
  if (meta?.state) metaBits.push(meta.state);
  if (meta?.lengthMiles != null && Number.isFinite(meta.lengthMiles)) metaBits.push(`${Math.round(meta.lengthMiles)} mi`);
  const typeLabel = riverTypeLabel(meta?.riverType);
  if (typeLabel) metaBits.push(typeLabel);
  if (meta?.difficultyTier) metaBits.push(DIFFICULTY_TIER_LABELS[meta.difficultyTier]);

  const [showFull, setShowFull] = useState(false);

  // Whether the collapsed (2-line clamped) quote is actually truncated. Drives
  // the More/Less toggle for the static fallback, which has no AI summaryText
  // to key off — without this the static quote clamps with no way to read on.
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  // Eddy update comes from the batched /api/eddy-updates call — one request
  // shared by every card on the grid (and the home page) via React Query,
  // instead of a per-card /api/eddy-update/[slug] fetch.
  const { data: eddyUpdates, isLoading: eddyLoading } = useEddyUpdates();
  const eddyUpdate = riverSlug ? eddyUpdates?.[riverSlug] ?? null : null;

  // Static fallback text \u2014 shared with the full river report page so the quote
  // reads identically across the card and the report (see buildStaticEddyText).
  const buildStaticText = () =>
    buildStaticEddyText({
      conditionCode: condition.code,
      gaugeHeightFt: primaryGauge.gaugeHeightFt,
      optimalMin: primaryThreshold.levelOptimalMin,
      optimalMax: primaryThreshold.levelOptimalMax,
      thresholdUnit: primaryThreshold.thresholdUnit,
      riverNote: riverSlug ? RIVER_NOTES[riverSlug] : null,
    });

  // Always use live condition so card badge matches the current gauge reading
  const displayConditionCode = condition.code;
  const surface = conditionChip(displayConditionCode);
  const surfaceStyle = { backgroundColor: surface.background, borderColor: surface.borderColor };

  const displayText = eddyUpdate?.summaryText && !showFull
    ? eddyUpdate.summaryText
    : eddyUpdate ? eddyUpdate.quoteText : buildStaticText();

  // Measure whether the collapsed quote overflows its 2-line clamp so we can
  // offer a More toggle even when there's no AI summaryText. Only measured
  // while collapsed; the value is retained once expanded so the Less button
  // stays put.
  useEffect(() => {
    if (showFull) return;
    const el = quoteRef.current;
    if (!el) return;
    const measure = () => setIsClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eddyLoading is included so we re-measure once the real quote paragraph
    // mounts (the loading placeholder has no ref) even if displayText is
    // unchanged between the loading and loaded renders.
  }, [displayText, showFull, eddyLoading]);

  // A toggle is worthwhile when there's a longer AI narrative to reveal, or
  // when the (static/AI) quote is being truncated by the clamp.
  const canExpand = Boolean(eddyUpdate?.summaryText) || isClamped || showFull;

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
              {metaBits.length > 0 && (
                <p className="mt-1.5 text-[11px] text-neutral-500 truncate">
                  {metaBits.join(' · ')}
                </p>
              )}
            </div>

            {/* Current reading */}
            <div className="flex flex-col items-end flex-shrink-0">
              {primaryValue !== null ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-neutral-900 tabular-nums">
                    {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(2)}
                  </span>
                  <span className="text-xs font-medium text-neutral-500">{primaryUnitLabel}</span>
                </div>
              ) : (
                <span className="text-sm text-neutral-400">No reading</span>
              )}
            </div>
          </div>
        </div>

        {/* Plain-language trend + how today compares to the recent window */}
        <div className="px-4 sm:px-5 pb-1">
          <GaugeTrendContext siteId={primaryGauge.usgsSiteId} currentValue={latestValue} unit={displayUnit} />
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
                <p ref={quoteRef} className={`text-xs leading-relaxed font-medium ${showFull ? '' : 'line-clamp-2'}`} style={{ color: surface.color }}>
                  &ldquo;{displayText}&rdquo;
                </p>
              )}
              {canExpand && (
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
