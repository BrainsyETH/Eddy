import type { WeatherSummary } from '@/lib/weather/openweather';
import { getLocalDateKey } from './local-time';

/** Require the actual upcoming weekend dates; absent coverage is unknown. */
export function weekendWeather(weather: WeatherSummary | null | undefined, now = new Date()): WeatherSummary | null {
  if (!weather) return null;
  const local = new Date(`${getLocalDateKey('America/Chicago', now)}T12:00:00Z`);
  const day = local.getUTCDay();
  const first = new Date(local);
  if (day !== 0) first.setUTCDate(first.getUTCDate() + (6 - day));
  const dates = [first.toISOString().slice(0, 10)];
  if (day !== 0) { first.setUTCDate(first.getUTCDate() + 1); dates.push(first.toISOString().slice(0, 10)); }
  const forecast = dates.map(date => weather.forecast.find(d => d.date === date));
  if (forecast.some(d => !d)) return null;
  const days = forecast as WeatherSummary['forecast'];
  // The chip describes the weekend range, rather than today's temperature.
  return { current: null, forecast: [{ ...days[0], highF: Math.max(...days.map(d => d.highF)), lowF: Math.min(...days.map(d => d.lowF)),
    condition: [...days].sort((a, b) => b.precipChance - a.precipChance)[0].condition,
    dayOfWeek: `${days.length === 2 ? 'Sat–Sun' : 'Sun'} ${days[0].date.slice(5)}${days.length === 2 ? '–' + days[1].date.slice(5) : ''}` }],
    todayPrecipChance: days[0].precipChance, maxPrecipChance: Math.max(...days.map(d => d.precipChance)) };
}
