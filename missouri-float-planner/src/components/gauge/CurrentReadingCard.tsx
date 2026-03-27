'use client';

// src/components/gauge/CurrentReadingCard.tsx
// Dark-themed current reading card with condition status strip and 2-column layout

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';

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
  const { data: history } = useGaugeHistory(siteId, 7);

  // Calculate trend from historical data
  const trend = (() => {
    if (!history?.readings || history.readings.length < 2) return null;
    const readings = history.readings;
    const latest = readings[readings.length - 1];
    // Compare to reading ~6 hours ago
    const sixHoursAgo = new Date(latest.timestamp).getTime() - 6 * 60 * 60 * 1000;
    const compareReading = readings.reduce((closest: typeof readings[0] | null, r: typeof readings[0]) => {
      if (!closest) return r;
      const diff = Math.abs(new Date(r.timestamp).getTime() - sixHoursAgo);
      const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - sixHoursAgo);
      return diff < closestDiff ? r : closest;
    }, null);

    if (!compareReading || !latest) return null;

    const isFt = thresholdUnit === 'ft';
    const currentVal = isFt ? latest.gaugeHeightFt : latest.dischargeCfs;
    const compareVal = isFt ? compareReading.gaugeHeightFt : compareReading.dischargeCfs;

    if (currentVal === null || compareVal === null) return null;
    const delta = currentVal - compareVal;
    return { delta, direction: delta > 0.01 ? 'up' : delta < -0.01 ? 'down' : 'stable' as const };
  })();

  const isCfsPrimary = thresholdUnit === 'cfs';

  const formatFt = (val: number) => val.toFixed(2);
  const formatCfs = (val: number) => val.toLocaleString();

  // Condition strip — solid color background with short label
  const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown : null;
  const conditionLabel = conditionCode ? CONDITION_SHORT_LABELS[conditionCode] ?? CONDITION_SHORT_LABELS.unknown : null;

  const trendLabel = trend
    ? trend.direction === 'up' ? 'Rising' : trend.direction === 'down' ? 'Falling' : 'Steady'
    : null;

  const trendDelta = trend
    ? `${trend.delta > 0 ? '+' : ''}${isCfsPrimary ? Math.round(trend.delta) : trend.delta.toFixed(2)} ${isCfsPrimary ? 'cfs' : 'ft'}`
    : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#163F4A' }} aria-label="Current gauge reading">
      {/* Condition status strip */}
      {conditionColor && conditionLabel && (
        <div
          className="px-4 py-2.5 flex items-center justify-center gap-2"
          style={{ backgroundColor: conditionColor }}
        >
          <span className="text-[11px] font-bold tracking-wide uppercase text-white">
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

      {/* Trend indicator — full width */}
      {trend && (
        <div className="px-4 pb-4 pt-1 flex items-center justify-between">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
            trend.direction === 'up' ? 'bg-white/10 text-emerald-300' :
            trend.direction === 'down' ? 'bg-white/10 text-blue-300' :
            'bg-white/10 text-white/50'
          }`}>
            {trend.direction === 'up' ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : trend.direction === 'down' ? (
              <TrendingDown className="w-3.5 h-3.5" />
            ) : (
              <Minus className="w-3.5 h-3.5" />
            )}
            <span className="text-sm font-semibold tabular-nums">
              {trendDelta}
            </span>
          </div>
          <span className="text-[10px] text-white/40">
            {trendLabel} over 6h
          </span>
        </div>
      )}
    </div>
  );
}
