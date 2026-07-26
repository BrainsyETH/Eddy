'use client';

import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
  Thermometer,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import {
  HEAT_ADVISORY_TEMP_F,
  formatOutlookDay,
  getRainPresentation,
  type RiverOutlookState,
} from '@/lib/river-outlook';

interface WillItHoldProps {
  outlook: RiverOutlookState;
  embedded?: boolean;
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

// Rain is a fact about the day, not a control. It reads as plain text, weighted
// only when the chance is high enough to move a float plan.
const RAIN_TEXT_STYLES: Record<string, string> = {
  significant: 'font-bold text-accent-700',
  possible: 'font-semibold text-primary-800',
  unlikely: 'text-neutral-500',
  none: 'text-neutral-500',
};

export default function WillItHold({
  outlook,
  embedded = false,
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

      {/* The per-day rain chips below carry the same numbers a "Rain watch"
          strip used to repeat directly above them, and "Watch for" states the
          consequence. One place per fact. */}
      <div className="grid flex-1 grid-cols-3 divide-x-2 divide-primary-100">
        {outlook.days.map(({ date, weather, river }, index) => (
          <div
            key={date}
            className="flex min-w-0 flex-col items-center px-2 py-3 text-center sm:px-3"
            aria-label={`${formatOutlookDay(date)}, ${weather ? `${weather.tempHigh} degrees high, ${weather.tempLow} degrees low, ${weather.precipitation} percent rain${weather.tempHigh >= HEAT_ADVISORY_TEMP_F ? ', heat advisory range' : ''}` : 'weather unavailable'}${river.valueFt != null ? `, forecast high ${river.valueFt.toFixed(2)} feet` : ''}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              {index === 0 ? 'Today' : (weather?.dayOfWeek ?? formatOutlookDay(date, false))}
            </span>
            {weather ? (() => {
              const WeatherGlyph = weatherGlyph(weather.conditionIcon);
              const rain = getRainPresentation(weather.precipitation);
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
                <span className={`mt-1.5 text-[10px] uppercase tracking-wide ${
                  RAIN_TEXT_STYLES[rain.kind] ?? RAIN_TEXT_STYLES.none
                }`}>
                  {rain.label}
                </span>
                {/* Heat decides a Missouri float day as often as water does —
                    launch time, water carried, whether there is a shade stop. */}
                {weather.tempHigh >= HEAT_ADVISORY_TEMP_F && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-sm bg-accent-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-800">
                    <Thermometer className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    Heat
                  </span>
                )}
              </>
              );
            })() : outlook.isWeatherLoading ? (
              <div className="my-2 h-12 w-12 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />
            ) : (
              <span className="my-3 text-[10px] text-neutral-400">Weather unavailable</span>
            )}

            {outlook.hasOfficialForecast && (
              <div className="mt-2 w-full border-t-2 border-primary-100 pt-2">
                {river.valueFt != null ? (
                  <>
                    <div className="font-mono text-xs font-bold tabular-nums text-neutral-900">{river.valueFt.toFixed(2)} ft</div>
                    {river.conditionCode && <ConditionBadge code={river.conditionCode} size="sm" />}
                  </>
                ) : (
                  <span className="text-[10px] text-neutral-400">No river forecast</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
