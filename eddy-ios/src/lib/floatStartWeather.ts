// eddy-ios/src/lib/floatStartWeather.ts
// The weather a float started in, for its recap's Rain and Chilly moods
// (docs/float-history-card-plan.md, 2d). Pure: the capture that calls these
// lives in src/float/startWeather.ts.
//
// Asked at the put-in, not at a GPS fix: at Start there is often no confirmed
// fix yet, and an access point is public. Only the values are kept, never the
// coordinates, and only the provider's current observation, never a forecast
// period standing in for one.

import type { StartWeather } from '@eddy/conditions/float-archive';
import type { LocationWeatherForecast } from '@eddy/types';
import type { FloatSession } from './floatSession';

/** A float with no put-in waits this long for its first confirmed position, then gives up. */
export const START_WEATHER_WINDOW_MS = 30 * 60_000;

/**
 * Where to ask: the put-in; with none, the first confirmed river position if
 * it came within the window; 'wait' while it still could; null for never.
 */
export function startWeatherPoint(
  session: Pick<FloatSession, 'putIn' | 'route' | 'recordedStart' | 'startedAt'>,
  now: number,
): { lat: number; lng: number } | 'wait' | null {
  const putIn = session.putIn ? session.route.anchors.find((anchor) => anchor.id === session.putIn?.id) : undefined;
  if (putIn) return { lng: putIn.lngLat[0], lat: putIn.lngLat[1] };
  const start = session.recordedStart;
  if (start) return start.at - session.startedAt <= START_WEATHER_WINDOW_MS ? { lng: start.lngLat[0], lat: start.lngLat[1] } : null;
  return now - session.startedAt <= START_WEATHER_WINDOW_MS ? 'wait' : null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The current observation, or null: never a forecast period, never a guess at
 * rain. Dated by the provider's observation time, not `fetchedAt`: the server
 * caches this response, so the fetch time can be over an hour newer than the
 * weather, and the recap's freshness rule must judge the weather. A response
 * without the observation time (an older server) gives no weather at all.
 */
export function startWeatherFrom(forecast: LocationWeatherForecast | null | undefined): StartWeather | null {
  const current = forecast?.current;
  if (!current || !finite(current.temp) || !finite(current.rain1hInches) || typeof current.observedAt !== 'string') return null;
  const at = Date.parse(current.observedAt);
  if (!Number.isFinite(at)) return null;
  return {
    tempF: current.temp, precipIn1h: current.rain1hInches, observedAt: new Date(at).toISOString(),
    ...(/^(01|02|03|04|09|10|11|13|50)[dn]$/.test(current.conditionIcon)
      ? { conditionIcon: current.conditionIcon } : {}),
  };
}
