'use client';

// src/components/gauge/CurrentReadingCard.tsx
// Dark-themed current reading card with condition status strip and 2-column layout

import Image from 'next/image';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS, getEddyImageForCondition } from '@/constants';
import type { ConditionCode } from '@/types/api';
import { computeTrend, computePercentile } from '@/lib/gauge-trend';

interface CurrentReadingCardProps {
  siteId: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit: 'ft' | 'cfs';
  conditionCode?: ConditionCode;
  waterTempF?: number | null;
  readingAgeHours?: number | null;
  className?: string;
  embedded?: boolean;
}

function formatAge(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return mins < 2 ? 'just now' : `${mins}m ago`;
  }
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function CurrentReadingCard({
  siteId,
  gaugeHeightFt,
  dischargeCfs,
  thresholdUnit,
  conditionCode,
  waterTempF,
  readingAgeHours,
  className = '',
  embedded = false,
}: CurrentReadingCardProps) {
  const { data: history } = useGaugeHistory(siteId, 14);

  const isCfsPrimary = thresholdUnit === 'cfs';

  // Plain-language trend (last ~6h) + how today compares to the recent window.
  const trend = computeTrend(history?.readings, thresholdUnit, 6);
  const primaryReadingValue = isCfsPrimary ? dischargeCfs : gaugeHeightFt;
  const percentile = computePercentile(history?.readings, primaryReadingValue, thresholdUnit, 14);

  const formatFt = (val: number) => val.toFixed(2);
  const formatCfs = (val: number) => val.toLocaleString();

  // Condition strip — solid color background with short label
  const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown : null;
  const conditionLabel = conditionCode ? CONDITION_SHORT_LABELS[conditionCode] ?? CONDITION_SHORT_LABELS.unknown : null;
  const conditionSurfaceColor = conditionCode === 'flowing' ? 'var(--cond-flowing-solid)' : conditionColor;
  const conditionInkColor = conditionCode === 'flowing' ? 'var(--cond-flowing-ink)' : 'var(--color-neutral-950)';

  const trendDelta = trend
    ? `${trend.delta > 0 ? '+' : ''}${isCfsPrimary ? Math.round(trend.delta) : trend.delta.toFixed(2)} ${isCfsPrimary ? 'cfs' : 'ft'}`
    : null;

  return (
    <div className={`${embedded ? 'rounded-none' : 'rounded-xl'} overflow-hidden bg-primary-800 ${className}`} role="group" aria-label="Current gauge reading">
      {/* One concise spoken summary instead of letting screen readers re-read the
          full two-column grid (both numbers + labels) on every background poll. */}
      <p className="sr-only" aria-live="polite">
        {conditionLabel ? `${conditionLabel}. ` : ''}
        {gaugeHeightFt !== null ? `Stage ${formatFt(gaugeHeightFt)} feet. ` : ''}
        {dischargeCfs !== null ? `Flow ${formatCfs(dischargeCfs)} cubic feet per second.` : ''}
      </p>

      {/* Condition status strip — bold solid band for at-a-glance color, with
          near-black ink (clears WCAG AA on every condition solid; white does not).
          Eddy's condition-matched artwork fronts the label (same asset set as
          the Eddy Says card and the hero pill). */}
      {conditionCode && conditionSurfaceColor && conditionLabel && (
        <div
          className="px-4 py-2 flex items-center justify-center gap-2"
          style={{ backgroundColor: conditionSurfaceColor }}
        >
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="font-sans text-xs font-bold tracking-wide uppercase" style={{ color: conditionInkColor }}>
            {conditionLabel}
          </span>
        </div>
      )}

      {/* 2-column readings: Stage | Flow (visual only; announced via summary above) */}
      <div className="grid grid-cols-2 divide-x divide-white/10" aria-hidden="true">
        {/* Stage (ft) */}
        <div className={`px-4 pt-4 pb-3 ${!isCfsPrimary ? '' : 'opacity-70'}`}>
          <span className="mb-1 block font-sans text-[11px] font-semibold uppercase tracking-wider text-primary-100">
            Stage
          </span>
          {gaugeHeightFt !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className={`${!isCfsPrimary ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} font-mono font-bold text-white tabular-nums leading-none`}>
                {formatFt(gaugeHeightFt)}
              </span>
              <span className="font-mono text-sm font-medium text-primary-100">ft</span>
            </div>
          ) : (
            <span className="text-xl text-white/30">—</span>
          )}
        </div>

        {/* Flow (cfs) */}
        <div className={`px-4 pt-4 pb-3 ${isCfsPrimary ? '' : 'opacity-70'}`}>
          <span className="mb-1 block font-sans text-[11px] font-semibold uppercase tracking-wider text-primary-100">
            Flow
          </span>
          {dischargeCfs !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className={`${isCfsPrimary ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} font-mono font-bold text-white tabular-nums leading-none`}>
                {formatCfs(dischargeCfs)}
              </span>
              <span className="font-mono text-sm font-medium text-primary-100">cfs</span>
            </div>
          ) : (
            <span className="text-xl text-white/30">—</span>
          )}
        </div>
      </div>

      {/* Water temperature (when available) */}
      {waterTempF != null && (
        <div className="px-4 py-2.5 border-t border-white/10">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-primary-100">
            Water Temp
          </span>
          <span className="ml-2 font-mono text-lg font-bold tabular-nums text-white">
            {waterTempF}°F
          </span>
        </div>
      )}

      {/* Trend + how today compares to the recent window */}
      {(trend || percentile) && (
        <div className="px-4 pb-4 pt-1 flex items-center justify-between gap-2">
          {trend ? (
            <div className={`flex items-center gap-1.5 rounded-lg bg-primary-700 px-2.5 py-1 ${
              trend.direction === 'rising' ? 'text-orange-200' :
              trend.direction === 'falling' ? 'text-primary-100' :
              'text-primary-100'
            }`}>
              {trend.direction === 'rising' ? (
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : trend.direction === 'falling' ? (
                <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="text-sm font-semibold">{trend.label}</span>
              {trendDelta && <span className="font-mono text-xs tabular-nums text-primary-100">{trendDelta}</span>}
            </div>
          ) : <span />}
          {percentile && (
            <span className="text-right text-[10px] leading-tight text-primary-100" title={percentile.descriptor}>
              {percentile.label}
              <span className="block text-primary-200">last {percentile.windowDays}d</span>
            </span>
          )}
        </div>
      )}

      {/* Reading freshness — so staleness is obvious on the card itself */}
      {readingAgeHours != null && (
        <div className="px-4 pb-3 -mt-1">
          <span className="text-[10px] text-primary-100">Updated {formatAge(readingAgeHours)}</span>
        </div>
      )}
    </div>
  );
}
