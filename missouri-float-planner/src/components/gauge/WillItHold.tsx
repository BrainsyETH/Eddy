'use client';

import Image from 'next/image';
import { CloudRain, Droplets, Waves } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { useRiverForecast } from '@/hooks/useRiverForecast';
import { getWeatherIconUrl, useForecastByCoords } from '@/hooks/useWeather';
import { computeTrend } from '@/lib/gauge-trend';
import {
  buildGuidanceSummary,
  buildOfficialOutlookSummary,
  formatOutlookDay,
  getOutlookDates,
  groupForecastByDay,
} from '@/lib/river-outlook';
import type { ConditionThresholds } from '@/lib/conditions';

interface WillItHoldProps {
  siteId: string;
  lat: number;
  lon: number;
  trendUnit: 'ft' | 'cfs';
  stageThresholds: ConditionThresholds | null;
  className?: string;
}

export default function WillItHold({
  siteId,
  lat,
  lon,
  trendUnit,
  stageThresholds,
  className = '',
}: WillItHoldProps) {
  const weatherQuery = useForecastByCoords(lat, lon);
  const riverQuery = useRiverForecast(siteId);
  const historyQuery = useGaugeHistory(siteId, 14);

  const weatherDays = weatherQuery.data?.days?.slice(0, 3) ?? [];
  const dates = getOutlookDates();
  const weatherByDate = new Map(weatherDays.map((day) => [day.date, day]));
  const riverDays = groupForecastByDay(riverQuery.data?.stages ?? [], dates, stageThresholds);
  const hasOfficialForecast = riverDays.some((day) => day.valueFt != null);
  const checkingOfficialForecast = riverQuery.isPending;
  const trend = computeTrend(historyQuery.data?.readings, trendUnit, 6);

  const isInitialLoading = weatherQuery.isPending && riverQuery.isPending;
  const futureUnavailable = !hasOfficialForecast && weatherQuery.isError;
  const summary = checkingOfficialForecast
    ? 'Checking the official river forecast…'
    : hasOfficialForecast
    ? buildOfficialOutlookSummary(riverDays)
    : futureUnavailable
      ? 'Future outlook unavailable—use the current reading and recheck before launch.'
      : weatherQuery.data
        ? buildGuidanceSummary(trend, weatherDays)
        : 'Checking the river and weather outlook…';

  return (
    <section
      className={`flex h-full flex-col rounded-xl border border-neutral-200 bg-white overflow-hidden ${className}`}
      aria-labelledby="river-outlook-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-100 px-4 py-3 sm:px-5">
        <div>
          <h3 id="river-outlook-heading" className="text-sm font-bold text-neutral-900">
            Will it hold?
          </h3>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Next 72 hours</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
          hasOfficialForecast
            ? 'bg-blue-50 text-blue-700'
            : 'bg-neutral-100 text-neutral-600'
        }`}>
          {hasOfficialForecast ? <Waves className="h-3 w-3" aria-hidden="true" /> : <CloudRain className="h-3 w-3" aria-hidden="true" />}
          {checkingOfficialForecast
            ? 'Checking river forecast'
            : hasOfficialForecast
              ? 'NWS 72-hour river forecast'
              : 'Trend + local weather'}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-3 divide-x divide-neutral-100">
        {dates.map((date, index) => {
          const weather = weatherByDate.get(date);
          const river = riverDays[index];
          return (
            <div
              key={date}
              className="flex min-w-0 flex-col items-center px-2 py-3 text-center sm:px-3"
              aria-label={`${formatOutlookDay(date)}, ${weather ? `${weather.tempHigh} degrees high, ${weather.tempLow} degrees low, ${weather.precipitation} percent rain` : 'weather unavailable'}${river?.valueFt != null ? `, forecast high ${river.valueFt.toFixed(2)} feet` : ''}`}
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
              ) : weatherQuery.isPending ? (
                <div className="my-2 h-12 w-12 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />
              ) : (
                <span className="my-3 text-[10px] text-neutral-400">Weather unavailable</span>
              )}

              {hasOfficialForecast && (
                <div className="mt-auto pt-2">
                  {river?.valueFt != null ? (
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
          );
        })}
      </div>

      <div className="border-t border-neutral-100 px-4 py-3 sm:px-5">
        <p className="text-xs leading-relaxed text-neutral-600" aria-live="polite">
          {isInitialLoading ? 'Checking the river and weather outlook…' : summary}
        </p>
        {!checkingOfficialForecast && !hasOfficialForecast && !isInitialLoading && !futureUnavailable && (
          <p className="mt-1 text-[10px] font-medium text-neutral-400">Guidance, not a river forecast.</p>
        )}
      </div>
    </section>
  );
}
