// src/components/dam/GenerationForecast.tsx
// A district's forward generation forecast — the Nashville shape, where the
// Corps publishes its operating forecast straight into CWMS as hourly cfs.
// Renders only when the payload carries one; most dams never will.
//
// VOICE DISCIPLINE, inherited from GenerationSchedule and dam-forecast-copy:
// this is a FORECAST — the district's own word — not a schedule anybody
// committed to and not an observation. Every string says "forecast", the
// peak wears a "~", and the times are absolute clocks in the dam's zone,
// because a countdown decays into a false claim under a 300-second ISR.
//
// Unlike SWPA's schedule there is no megawatt column and no scheduling-
// capacity scale — the district publishes discharge directly, so the cfs IS
// the source's number, not a conversion to hedge. That is why spans render a
// plain peak figure where the schedule page refuses one on ramp hours.

import DamInfoTip from './DamInfoTip';
import { CalendarClock } from 'lucide-react';
import type { DamGenerationForecast } from '@shared/dam-types';
import {
  forecastDays,
  forecastHorizonSentence,
  forecastPlanStale,
  nextForecastChangeSentence,
} from '@shared/dam-forecast-copy';
import { retrievalSentence, scheduleIsStale } from '@shared/dam-schedule-copy';

export default function GenerationForecast({
  forecast,
  renderedAt,
}: {
  forecast: DamGenerationForecast;
  /** The page's render instant, so "tomorrow" is judged on one clock. */
  renderedAt: number;
}) {
  const days = forecastDays(forecast.windows, forecast.timeZone);
  if (days.length === 0) return null;

  const nextChange = nextForecastChangeSentence(forecast.windows, forecast.timeZone, renderedAt);
  const retrieval = retrievalSentence(forecast.retrievedAt, renderedAt, 'Forecast');
  // How far the PLAN reaches, which is a different question from when Eddy
  // fetched it — and the only one that can catch a district's writer dying,
  // since CWMS publishes no write time. See forecastPlanStale.
  const horizon = forecastHorizonSentence(forecast.windows, forecast.timeZone);
  const planStale = forecastPlanStale(forecast.windows, renderedAt);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary-700" aria-hidden="true" />
        <h2
          className="flex-1 text-lg font-bold text-neutral-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Generation forecast
        </h2>
        <DamInfoTip title="Generation forecast"><p>The operating forecast comes from {forecast.source}. It is a plan, refreshed daily, and may change as power demand, inflow, outages and operating needs change.</p><p>A change at the dam reaches downstream locations later. Check local operating information and posted warnings before entering the water.</p></DamInfoTip>
      </div>
      {nextChange && (
        <p className="mt-3 text-sm font-bold text-neutral-900">{nextChange}</p>
      )}

      <div className="mt-4 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => (
          <div
            key={day.dayKey}
            className="border-t border-neutral-200 py-3"
          >
            <h3 className="text-sm font-bold text-neutral-900">{day.dayLabel}</h3>
            <ul className="mt-1.5 space-y-1">
              {day.spans.map((span, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span
                    className={
                      span.generating
                        ? 'font-medium text-primary-800'
                        : 'text-neutral-500'
                    }
                  >
                    {span.generating ? 'Generation forecast' : 'No generation forecast'}
                  </span>
                  <span className="text-neutral-700">{span.label}</span>
                  {span.peakLabel && (
                    <span className="text-xs text-neutral-500">{span.peakLabel}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Freshness and the disclaimer share a block for the same reason they
          do on the schedule card: how old the forecast is means little
          without "it can change", and the safety line must travel with the
          data everywhere it appears. */}
      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        {retrieval && (
          <span
            className={
              scheduleIsStale(forecast.retrievedAt, renderedAt)
                ? 'font-medium text-accent-700'
                : undefined
            }
          >
            {retrieval}{' '}
          </span>
        )}
        {horizon && (
          <span className={planStale ? 'font-medium text-accent-700' : undefined}>
            {horizon}
            {planStale && ' — shorter than this district usually publishes, so it may not have been updated'}
            .{' '}
          </span>
        )}
        Times at the dam · Downstream timing varies · Subject to change.
      </p>
    </section>
  );
}
