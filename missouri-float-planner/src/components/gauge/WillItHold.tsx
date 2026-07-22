'use client';

// src/components/gauge/WillItHold.tsx
// Compact "Will it hold?" outlook for the live-report rail: today's canonical
// band, the live trend, and a deterministic rain implication. Qualitative
// only — no future readings or bands are claimed.

import { TrendingUp, TrendingDown, Minus, Droplets } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { useForecastByCoords } from '@/hooks/useWeather';
import { computeTrend } from '@/lib/gauge-trend';
import type { ConditionCode } from '@/types/api';

interface WillItHoldProps {
  siteId: string;
  thresholdUnit: 'ft' | 'cfs';
  conditionCode: ConditionCode;
  lat: number;
  lon: number;
}

export default function WillItHold({ siteId, thresholdUnit, conditionCode, lat, lon }: WillItHoldProps) {
  const { data: history } = useGaugeHistory(siteId, 14);
  const { data: forecast } = useForecastByCoords(lat, lon);
  const trend = computeTrend(history?.readings, thresholdUnit, 6);
  const rainDays = (forecast?.days?.slice(1, 4) ?? []).filter((d) => d.precipitation >= 70);

  // Nothing to say without a trend or rain signal — don't render an empty card.
  if (!trend && rainDays.length === 0) return null;
  const rainLabel = rainDays.map((d) => d.dayOfWeek).join(' & ');

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
        Will it hold?
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-neutral-500">Today</span>
        <ConditionBadge code={conditionCode} size="sm" />
      </div>
      {trend && (
        <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
          {trend.direction === 'rising' ? (
            <TrendingUp className="w-4 h-4 text-orange-500" aria-hidden="true" />
          ) : trend.direction === 'falling' ? (
            <TrendingDown className="w-4 h-4 text-blue-500" aria-hidden="true" />
          ) : (
            <Minus className="w-4 h-4 text-neutral-400" aria-hidden="true" />
          )}
          {trend.label}
        </div>
      )}
      <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
        {rainDays.length > 0 ? (
          <span className="inline-flex items-start gap-1">
            <Droplets className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>Rain {rainLabel} could change levels — recheck before you go.</span>
          </span>
        ) : (
          'No significant rain in the forecast.'
        )}
      </p>
    </div>
  );
}
