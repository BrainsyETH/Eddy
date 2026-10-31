import { sunriseAt, sunsetAt, type LngLat } from '@eddy/geo';
import { NEAR_SUNSET_MS } from './floatSession';

/** Local calendar dates, not 24-hour offsets: midnight and DST both matter. */
export function arrivalDayLabel(arriveAt: number, now: number): string | null {
  const arrival = new Date(arriveAt);
  const today = new Date(now);
  if (arrival.toDateString() === today.toDateString()) return null;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (arrival.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return arrival.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Readiness copy stays separate from River Mode's live tracking guidance. */
export function startTiming(minutes: number | null, now: number, at: LngLat) {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(now)) return null;
  const arriveAt = now + minutes * 60_000;
  const sunset = sunsetAt(at[1], at[0], now);
  const sunrise = sunriseAt(at[1], at[0], now);
  let daylight: { label: string; at: number; advisory: boolean } | null = null;
  if (sunset != null && sunrise != null) {
    daylight = now < sunrise
      ? { label: 'Starts before sunrise', at: sunrise, advisory: true }
      : now >= sunset
        ? { label: 'Starts after sunset', at: sunset, advisory: true }
        : arriveAt > sunset
          ? { label: arrivalDayLabel(arriveAt, now) ? 'Continues after sunset' : 'Arrives after sunset', at: sunset, advisory: true }
          : arriveAt > sunset - NEAR_SUNSET_MS
            ? { label: 'Arrives near sunset', at: sunset, advisory: true }
            : { label: 'Sunset', at: sunset, advisory: false };
  }
  return { arriveAt, day: arrivalDayLabel(arriveAt, now), daylight };
}
