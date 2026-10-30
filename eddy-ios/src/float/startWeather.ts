// eddy-ios/src/float/startWeather.ts
// Ask once for the weather a float started in, and keep it on the session.
// Best-effort and never awaited: Start does not wait on weather, a failure is
// silent, and the recap simply has no Rain or Chilly mood to choose from.

import { fetchLocationWeather } from '@/api/client';
import { getFloatSession, setStartWeather, subscribeFloatSession } from '@/lib/floatSessionStore';
import { START_WEATHER_WINDOW_MS, startWeatherFrom, startWeatherPoint } from '@/lib/floatStartWeather';

export function captureStartWeather(sessionId: string): void {
  let done = false;
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    done = true;
    unsubscribe?.();
    if (timer) clearTimeout(timer);
  };
  // Called on every session change until there is somewhere to ask: a float
  // with no put-in waits for its first confirmed river position.
  const attempt = () => {
    if (done) return;
    const session = getFloatSession();
    if (!session || session.id !== sessionId || session.startWeather) return finish();
    const point = startWeatherPoint(session, Date.now());
    if (point === 'wait') return;
    finish();
    if (!point) return;
    void fetchLocationWeather(point)
      .then((forecast) => {
        const weather = startWeatherFrom(forecast);
        if (weather) setStartWeather(sessionId, weather);
      })
      .catch(() => {});
  };
  unsubscribe = subscribeFloatSession(attempt);
  timer = setTimeout(finish, START_WEATHER_WINDOW_MS);
  attempt();
}
