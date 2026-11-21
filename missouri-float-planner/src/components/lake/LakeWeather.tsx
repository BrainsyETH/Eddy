import { createElement } from 'react';
import Card from '@/components/ui/Card';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { weatherGlyph } from '@/components/ui/weather-glyph';
import { relativeAge } from '@shared/dam-schedule-copy';
import { lakeWeatherIsStale, lakeWindLine } from '@shared/lake-system';
import type { LakeWeather as LakeWeatherReading } from '@shared/lake-types';

/** Wind first: it is what decides a day on open water. A measurement at one named point, never advice. */
export default function LakeWeather({ weather, now }: { weather: LakeWeatherReading; now: number }) {
  const stale = lakeWeatherIsStale(weather, now);
  const age = relativeAge(weather.observedAt, now);
  return <Card as="section" variant="panel" className="p-4 sm:p-6" aria-labelledby="lake-weather-heading" data-lake-weather>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="lake-weather-heading" className="flex items-center gap-2 font-heading text-xl font-bold text-primary-800"><EddyIcon name="weather" size={28} />Wind &amp; weather</h2>
      {age && <p className={`text-xs ${stale ? 'font-semibold text-accent-900' : 'text-neutral-600'}`}>Observed {age}{stale ? ' · Outdated' : ''}</p>}
    </div>
    <div className={`mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 ${stale ? 'opacity-70' : ''}`}>
      <p className="text-2xl font-semibold tracking-tight text-primary-900">{lakeWindLine(weather)}</p>
      <p className="inline-flex items-center gap-2 text-base text-neutral-700">{createElement(weatherGlyph(weather.conditionIcon), { className: 'size-5 shrink-0 self-center text-primary-700', 'aria-hidden': true })}{Math.round(weather.tempF)}°F · <span className="capitalize">{weather.condition}</span></p>
    </div>
    <p className="mt-2 text-xs leading-5 text-neutral-500">{weather.place}. Wind differs across the lake.</p>
  </Card>;
}
