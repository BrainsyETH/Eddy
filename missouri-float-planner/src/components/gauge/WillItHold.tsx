'use client';

import Image from 'next/image';
import { CloudRain, Droplets, Waves } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { getWeatherIconUrl } from '@/hooks/useWeather';
import { formatOutlookDay, type RiverOutlookState } from '@/lib/river-outlook';

interface WillItHoldProps {
  outlook: RiverOutlookState;
  embedded?: boolean;
  showSummary?: boolean;
  className?: string;
}

export default function WillItHold({
  outlook,
  embedded = false,
  showSummary = true,
  className = '',
}: WillItHoldProps) {
  return (
    <section
      className={`flex h-full flex-col overflow-hidden bg-white ${
        embedded ? 'border-0 rounded-none' : 'rounded-xl border border-neutral-200'
      } ${className}`}
      aria-labelledby="river-outlook-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-100 px-4 py-3 sm:px-5">
        <div>
          <h3 id="river-outlook-heading" className="text-sm font-bold text-neutral-900">Will it hold?</h3>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Next 72 hours</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
          outlook.sourceKind === 'official' ? 'bg-blue-50 text-blue-700' : 'bg-neutral-100 text-neutral-600'
        }`}>
          {outlook.sourceKind === 'official'
            ? <Waves className="h-3 w-3" aria-hidden="true" />
            : <CloudRain className="h-3 w-3" aria-hidden="true" />}
          {outlook.sourceLabel}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-3 divide-x divide-neutral-100">
        {outlook.days.map(({ date, weather, river }, index) => (
          <div
            key={date}
            className="flex min-w-0 flex-col items-center px-2 py-3 text-center sm:px-3"
            aria-label={`${formatOutlookDay(date)}, ${weather ? `${weather.tempHigh} degrees high, ${weather.tempLow} degrees low, ${weather.precipitation} percent rain` : 'weather unavailable'}${river.valueFt != null ? `, forecast high ${river.valueFt.toFixed(2)} feet` : ''}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              {index === 0 ? 'Today' : (weather?.dayOfWeek ?? formatOutlookDay(date, false))}
            </span>
            {weather ? (
              <>
                <Image
                  src={getWeatherIconUrl(weather.conditionIcon)}
                  alt={weather.condition}
                  width={36}
                  height={36}
                  className="h-9 w-9"
                  unoptimized
                />
                <span className="text-xs font-semibold tabular-nums text-neutral-900">
                  {weather.tempHigh}° <span className="font-normal text-neutral-400">{weather.tempLow}°</span>
                </span>
                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-blue-600">
                  <Droplets className="h-2.5 w-2.5" aria-hidden="true" /> {weather.precipitation}%
                </span>
              </>
            ) : outlook.isWeatherLoading ? (
              <div className="my-2 h-12 w-12 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />
            ) : (
              <span className="my-3 text-[10px] text-neutral-400">Weather unavailable</span>
            )}

            {outlook.hasOfficialForecast && (
              <div className="mt-auto pt-2">
                {river.valueFt != null ? (
                  <>
                    <div className="text-xs font-bold tabular-nums text-neutral-900">{river.valueFt.toFixed(2)} ft</div>
                    {river.conditionCode && <ConditionBadge code={river.conditionCode} size="sm" />}
                  </>
                ) : (
                  <span className="text-[10px] text-neutral-400">No stage point</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showSummary && (
        <div className="border-t border-neutral-100 px-4 py-3 sm:px-5">
          <p className="text-xs leading-relaxed text-neutral-600" aria-live="polite">{outlook.summary}</p>
          {outlook.isGuidance && (
            <p className="mt-1 text-[10px] font-medium text-neutral-400">Guidance, not a river forecast.</p>
          )}
        </div>
      )}
    </section>
  );
}
