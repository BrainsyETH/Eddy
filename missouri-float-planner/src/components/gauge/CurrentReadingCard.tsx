'use client';

// src/components/gauge/CurrentReadingCard.tsx
// Dark-themed current reading card matching the Stitch reference design

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';

interface CurrentReadingCardProps {
  siteId: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit: 'ft' | 'cfs';
  conditionLabel?: string;
  conditionTailwindColor?: string;
}

export default function CurrentReadingCard({
  siteId,
  gaugeHeightFt,
  dischargeCfs,
  thresholdUnit,
  conditionLabel,
  conditionTailwindColor,
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
  const primaryValue = isCfsPrimary ? dischargeCfs : gaugeHeightFt;
  const primaryUnit = isCfsPrimary ? 'cfs' : 'ft';
  const primaryLabel = 'CURRENT READING';
  const secondaryValue = isCfsPrimary ? gaugeHeightFt : dischargeCfs;
  const secondaryUnit = isCfsPrimary ? 'ft' : 'cfs';
  const secondaryLabel = isCfsPrimary ? 'STAGE' : 'FLOW';

  const formatPrimary = (val: number) => {
    if (isCfsPrimary) return val.toLocaleString();
    return val.toFixed(2);
  };

  const formatSecondary = (val: number) => {
    if (!isCfsPrimary) return val.toLocaleString();
    return val.toFixed(2);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#163F4A' }} aria-label="Current gauge reading">
      {/* Primary reading */}
      <div className="px-5 pt-5 pb-3" aria-live="polite">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">
            {primaryLabel}
          </span>
          {conditionLabel && conditionTailwindColor && (
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold text-white ${conditionTailwindColor}`}>
              {conditionLabel}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          {primaryValue !== null ? (
            <>
              <span className="text-4xl md:text-5xl font-bold text-white tabular-nums leading-none">
                {formatPrimary(primaryValue)}
              </span>
              <span className="text-lg text-white/60 font-medium">{primaryUnit}</span>
            </>
          ) : (
            <span className="text-2xl text-white/40">—</span>
          )}
        </div>
      </div>

      {/* Secondary reading + trend */}
      <div className="px-5 pb-5 flex items-center justify-between">
        <div>
          {secondaryValue !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-white/40 uppercase">
                {secondaryLabel}
              </span>
              <span className="text-lg font-bold text-white/80 tabular-nums">
                {formatSecondary(secondaryValue)}
              </span>
              <span className="text-sm text-white/40">{secondaryUnit}</span>
            </div>
          )}
        </div>

        {/* Trend indicator */}
        {trend && (
          <div className={`flex flex-col items-end gap-0.5`}>
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg ${
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
                {trend.delta > 0 ? '+' : ''}{isCfsPrimary ? Math.round(trend.delta) : trend.delta.toFixed(2)} {primaryUnit}
              </span>
            </div>
            <span className="text-[10px] text-white/40">
              {trend.direction === 'up' ? 'Rising' : trend.direction === 'down' ? 'Falling' : 'Steady'} over 6h
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
