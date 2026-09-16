import type { LocationWeatherForecast } from '@eddy/types';
let cached: { key: string; data: LocationWeatherForecast; at: number } | null = null;
export function seedLocationForecast(key: string, data: LocationWeatherForecast) {
  cached = { key, data, at: Date.now() };
}
export function peekLocationForecast(key: string): LocationWeatherForecast | null {
  return cached?.key === key && Date.now() - cached.at < 30 * 60_000 ? cached.data : null;
}

