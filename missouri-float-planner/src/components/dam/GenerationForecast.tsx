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

import { CalendarClock } from 'lucide-react';
import type { DamGenerationForecast } from '@shared/dam-types';
import {
  forecastDays,
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
  const retrieval = retrievalSentence(forecast.retrievedAt, renderedAt);

  return (
    <section className="rounded-xl border-2 border-neutral-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary-700" aria-hidden="true" />
        <h2
          className="text-lg font-bold text-neutral-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Generation forecast
        </h2>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        The operating forecast published by {forecast.source} — a plan, refreshed
        daily, not a commitment.
      </p>

      {/* The one sentence a reader came for, when the forecast can support
          it. Null renders nothing: a gap at the present hour means the
          forecast cannot say what the dam is doing now, and this line
          anchors on that claim. */}
      {nextChange && (
        <p className="mt-3 text-sm font-bold text-neutral-900">{nextChange}</p>
      )}

      <div className="mt-4">
        {days.map((day) => (
          <div
            key={day.dayKey}
            className="border-t border-neutral-200 py-3 first:border-t-0 first:pt-0"
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
        Forecasts change without notice — power demand, transmission constraints,
        generator outages and inflow all move them. A change at the dam does not
        reach every downstream location at the same time. Never wade or anchor
        below a dam without checking the horn and posted warnings.
      </p>
    </section>
  );
}
