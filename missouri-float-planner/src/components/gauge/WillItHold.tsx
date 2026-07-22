'use client';

// src/components/gauge/WillItHold.tsx
// Compact "Will it hold?" outlook for the live-report rail. It adds only the
// near-term rain implication to the reading card's existing condition + trend,
// and never treats a loading or failed forecast as a clear forecast.

import { Droplets } from 'lucide-react';
import { useForecastByCoords } from '@/hooks/useWeather';

interface WillItHoldProps {
  lat: number;
  lon: number;
}

export default function WillItHold({ lat, lon }: WillItHoldProps) {
  const { data: forecast, isPending, isError } = useForecastByCoords(lat, lon);
  const rainDays = (forecast?.days?.slice(1, 4) ?? []).filter((d) => d.precipitation >= 70);
  const rainLabel = rainDays.map((d) => d.dayOfWeek).join(' & ');

  return (
    <section
      className="bg-white border border-neutral-200 rounded-xl px-4 py-3"
      aria-labelledby="river-outlook-heading"
    >
      <h3 id="river-outlook-heading" className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
        Will it hold?
      </h3>
      <p className="text-xs text-neutral-500 leading-relaxed" aria-live="polite">
        {isPending ? (
          'Checking the rain outlook…'
        ) : isError || !forecast ? (
          'Rain outlook unavailable — recheck before you go.'
        ) : rainDays.length > 0 ? (
          <span className="inline-flex items-start gap-1">
            <Droplets className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>Rain {rainLabel} could change levels — recheck before you go.</span>
          </span>
        ) : (
          'No significant rain in the forecast.'
        )}
      </p>
    </section>
  );
}
