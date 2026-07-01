'use client';

// src/components/gauge/GaugeTrendContext.tsx
// One-line plain-language context under a gauge reading: which way the river is
// moving right now, and how today compares to the recent window. Pulls history
// from React Query (already prefetched on the dashboard, so this is usually a
// cache hit) and renders nothing when there isn't enough data to be honest.

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { computeTrend, computePercentile, type GaugeUnit } from '@/lib/gauge-trend';

interface GaugeTrendContextProps {
  siteId: string | null | undefined;
  currentValue: number | null;
  unit: GaugeUnit;
  days?: number;
  className?: string;
}

export default function GaugeTrendContext({
  siteId,
  currentValue,
  unit,
  days = 14,
  className = '',
}: GaugeTrendContextProps) {
  const { data: history } = useGaugeHistory(siteId ?? null, days);
  const readings = history?.readings;

  const trend = computeTrend(readings, unit);
  const pct = computePercentile(readings, currentValue, unit, days);

  if (!trend && !pct) return null;

  const TrendIcon =
    trend?.direction === 'rising' ? TrendingUp : trend?.direction === 'falling' ? TrendingDown : Minus;
  // Rising water is the cautionary direction (orange); falling reads calm (teal).
  const trendTone =
    trend?.direction === 'rising'
      ? 'text-orange-600'
      : trend?.direction === 'falling'
        ? 'text-primary-600'
        : 'text-neutral-500';

  return (
    <div className={`flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-neutral-600 ${className}`}>
      {trend && (
        <span className={`inline-flex items-center gap-1 font-semibold ${trendTone}`}>
          <TrendIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {trend.label}
          <span className="font-normal text-neutral-400">· {trend.windowHours}h</span>
        </span>
      )}
      {trend && pct && <span className="text-neutral-300" aria-hidden="true">·</span>}
      {pct && (
        <span className="first-letter:uppercase" title={pct.descriptor}>
          {pct.short} <span className="text-neutral-400">· {pct.label}</span>
        </span>
      )}
    </div>
  );
}
