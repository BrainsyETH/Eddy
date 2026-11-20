import { maxReadingAgeHours } from './gate';

export const MAX_EVENT_AGE_HOURS = 3;
const HOUR = 3_600_000;

export function observationExpiration(detectedAt: string, readingAt?: string | null, provider?: string | null): number {
  const detected = Date.parse(detectedAt);
  const reading = Date.parse(readingAt ?? '');
  const deadline = Number.isFinite(reading)
    ? Math.min(detected + MAX_EVENT_AGE_HOURS * HOUR, reading + maxReadingAgeHours(provider) * HOUR)
    : detected + MAX_EVENT_AGE_HOURS * HOUR;
  return Number.isFinite(deadline) ? Math.floor(deadline / 1000) : 0;
}

const defaultZone = 'America/Chicago';
const clocks = new Map<string, Intl.DateTimeFormat>();

function observationClock(timeZone: string): Intl.DateTimeFormat {
  const cached = clocks.get(timeZone);
  if (cached) return cached;
  try {
    const clock = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone,
    });
    clocks.set(timeZone, clock);
    return clock;
  } catch {
    // Older preferences may contain a timezone the runtime does not recognize.
    return observationClock(defaultZone);
  }
}

export function readingTimePhrase(iso?: string | null, timeZone?: string | null): string {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '';
  const { weekday, hour, minute, dayPeriod, timeZoneName } = Object.fromEntries(
    observationClock(timeZone ?? defaultZone).formatToParts(ms).map(part => [part.type, part.value]),
  );
  return ` at ${hour}:${minute} ${dayPeriod} ${timeZoneName} on ${weekday}`;
}
