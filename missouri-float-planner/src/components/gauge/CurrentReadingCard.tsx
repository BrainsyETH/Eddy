'use client';

// src/components/gauge/CurrentReadingCard.tsx
// Dark-themed current reading card with condition status strip and 2-column layout

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';
import { computeTrend, computePercentile } from '@/lib/gauge-trend';

interface CurrentReadingCardProps {
  siteId: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit: 'ft' | 'cfs';
  conditionCode?: ConditionCode;
  waterTempF?: number | null;
}

export default function CurrentReadingCard({
  siteId,
  gaugeHeightFt,
  dischargeCfs,
  thresholdUnit,
  conditionCode,
  waterTempF,
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

  const trendDelta = trend
    ? `${trend.delta > 0 ? '+' : ''}${isCfsPrimary ? Math.round(trend.delta) : trend.delta.toFixed(2)} ${isCfsPrimary ? 'cfs' : 'ft'}`
    : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#163F4A' }} aria-label="Current gauge reading">
      {/* Condition status strip — bold solid band for at-a-glance color, with
          near-black ink (clears WCAG AA on every condition solid; white does not). */}
      {conditionColor && conditionLabel && (
        <div
          className="px-4 py-2.5 flex items-center justify-center gap-2"
          style={{ backgroundColor: conditionColor }}
        >
          <span className="text-xs font-bold tracking-wide uppercase" style={{ color: '#1A1814' }}>
            {conditionLabel}
          </span>
        </div>
      )}

      {/* 2-column readings: Stage | Flow */}
      <div className="grid grid-cols-2 divide-x divide-white/10" aria-live="polite">
        {/* Stage (ft) */}
        <div className={`px-4 pt-4 pb-3 ${!isCfsPrimary ? '' : 'opacity-70'}`}>
          <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase block mb-1">
            Stage
          </span>
          {gaugeHeightFt !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className={`${!isCfsPrimary ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} font-bold text-white tabular-nums leading-none`}>
                {formatFt(gaugeHeightFt)}
              </span>
              <span className="text-sm text-white/50 font-medium">ft</span>
            </div>
          ) : (
            <span className="text-xl text-white/30">—</span>
          )}
        </div>

        {/* Flow (cfs) */}
        <div className={`px-4 pt-4 pb-3 ${isCfsPrimary ? '' : 'opacity-70'}`}>
          <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase block mb-1">
            Flow
          </span>
          {dischargeCfs !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className={`${isCfsPrimary ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} font-bold text-white tabular-nums leading-none`}>
                {formatCfs(dischargeCfs)}
              </span>
              <span className="text-sm text-white/50 font-medium">cfs</span>
            </div>
          ) : (
            <span className="text-xl text-white/30">—</span>
          )}
        </div>
      </div>

      {/* Water temperature (when available) */}
      {waterTempF != null && (
        <div className="px-4 py-2.5 border-t border-white/10">
          <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
            Water Temp
          </span>
          <span className="text-lg font-bold text-white tabular-nums ml-2">
            {waterTempF}°F
          </span>
        </div>
      )}

      {/* Trend + how today compares to the recent window */}
      {(trend || percentile) && (
        <div className="px-4 pb-4 pt-1 flex items-center justify-between gap-2">
          {trend ? (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
              trend.direction === 'rising' ? 'bg-white/10 text-orange-300' :
              trend.direction === 'falling' ? 'bg-white/10 text-blue-300' :
              'bg-white/10 text-white/60'
            }`}>
              {trend.direction === 'rising' ? (
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : trend.direction === 'falling' ? (
                <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="text-sm font-semibold">{trend.label}</span>
              {trendDelta && <span className="text-xs text-white/50 tabular-nums">{trendDelta}</span>}
            </div>
          ) : <span />}
          {percentile && (
            <span className="text-[10px] text-white/50 text-right leading-tight" title={percentile.descriptor}>
              {percentile.label}
              <span className="block text-white/30">last {percentile.windowDays}d</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
