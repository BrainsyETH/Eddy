'use client';

// src/components/gauge/GaugeTrendContext.tsx
// Plain-language context for a gauge reading: which way the river is moving
// right now, and how today compares to the recent window. Pulls history from
// React Query (already prefetched on the dashboard, so this is usually a cache
// hit) and yields nothing when there isn't enough data to be honest.
//
// Split into a hook and a trend label so a card can give them different
// weight: the trend is the prominent signal, the 14-day comparison a quieter
// line with its window available in an explanation.

import { TrendingUp, TrendingDown, MoveRight } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { computeTrend, computePercentile, type GaugeTrend, type GaugeUnit } from '@shared/gauge-trend';

export function useGaugeTrendContext(
  siteId: string | null | undefined,
  currentValue: number | null,
  unit: GaugeUnit,
  days = 14,
) {
  const { data: history } = useGaugeHistory(siteId ?? null, days);
  const readings = history?.readings;
  return {
    trend: computeTrend(readings, unit),
    recent: computePercentile(readings, currentValue, unit, days),
  };
}

/** "Falling slowly", with its direction mark. Rising is the cautionary tone. */
export function TrendLabel({ trend, className = '' }: { trend: GaugeTrend; className?: string }) {
  // A level arrow, not a minus: a bare dash before "Holding steady" read as
  // punctuation.
  const Icon = trend.direction === 'rising' ? TrendingUp : trend.direction === 'falling' ? TrendingDown : MoveRight;
  const tone =
    trend.direction === 'rising'
      ? 'text-orange-700'
      : trend.direction === 'falling'
        ? 'text-primary-600'
        : 'text-neutral-700';
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${tone} ${className}`}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {trend.label}
    </span>
  );
}
