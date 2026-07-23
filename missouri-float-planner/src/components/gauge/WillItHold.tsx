'use client';

import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplet,
  Snowflake,
  Sun,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { formatOutlookDay, type RiverOutlookState } from '@/lib/river-outlook';

interface WillItHoldProps {
  outlook: RiverOutlookState;
  embedded?: boolean;
  showSummary?: boolean;
  className?: string;
}

function weatherGlyph(iconCode: string): LucideIcon {
  if (iconCode.startsWith('01')) return Sun;
  if (iconCode.startsWith('02')) return CloudSun;
  if (iconCode.startsWith('03') || iconCode.startsWith('04')) return Cloud;
  if (iconCode.startsWith('09') || iconCode.startsWith('10')) return CloudRain;
  if (iconCode.startsWith('11')) return CloudLightning;
  if (iconCode.startsWith('13')) return Snowflake;
  if (iconCode.startsWith('50')) return CloudFog;
  return CloudSun;
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
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-primary-100 px-4 py-3 sm:px-5">
        <div>
          <h3 id="river-outlook-heading" className="font-heading text-sm font-bold text-neutral-900">Will it hold?</h3>
          <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Next 72 hours</p>
        </div>
        <span className={`inline-flex items-center gap-1 py-1 text-[10px] font-semibold ${
          outlook.sourceKind === 'official' ? 'text-primary-700' : 'text-neutral-600'
        }`}>
          {outlook.sourceKind === 'official'
            ? <Waves className="h-3 w-3" aria-hidden="true" />
            : <CloudRain className="h-3 w-3" aria-hidden="true" />}
          {outlook.sourceLabel}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-3 divide-x-2 divide-primary-100">
        {outlook.days.map(({ date, weather, river }, index) => (
          <div
            key={date}
            className="flex min-w-0 flex-col items-center px-2 py-3 text-center sm:px-3"
            aria-label={`${formatOutlookDay(date)}, ${weather ? `${weather.tempHigh} degrees high, ${weather.tempLow} degrees low, ${weather.precipitation} percent rain` : 'weather unavailable'}${river.valueFt != null ? `, forecast high ${river.valueFt.toFixed(2)} feet` : ''}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              {index === 0 ? 'Today' : (weather?.dayOfWeek ?? formatOutlookDay(date, false))}
            </span>
            {weather ? (() => {
              const WeatherGlyph = weatherGlyph(weather.conditionIcon);
              return (
              <>
                <WeatherGlyph
                  className="my-1 h-7 w-7 text-primary-700"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold tabular-nums text-neutral-900">
                  {weather.tempHigh}° <span className="font-normal text-neutral-400">{weather.tempLow}°</span>
                </span>
                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-primary-600">
                  <Droplet className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" /> {weather.precipitation}%
                </span>
              </>
              );
            })() : outlook.isWeatherLoading ? (
              <div className="my-2 h-12 w-12 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />
            ) : (
              <span className="my-3 text-[10px] text-neutral-400">Weather unavailable</span>
            )}

            {outlook.hasOfficialForecast && (
              <div className="mt-auto pt-2">
                {river.valueFt != null ? (
                  <>
                    <div className="font-mono text-xs font-bold tabular-nums text-neutral-900">{river.valueFt.toFixed(2)} ft</div>
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
        <div className="border-t border-primary-100 px-4 py-3 sm:px-5">
          <p className="text-xs leading-relaxed text-neutral-600" aria-live="polite">{outlook.summary}</p>
          {outlook.isGuidance && (
            <p className="mt-1 text-[10px] font-medium text-neutral-400">Weather outlook; future river levels are not predicted.</p>
          )}
        </div>
      )}
    </section>
  );
}
