// src/app/api/weather/route.ts
// GET /api/weather?lat&lon — current weather for a point.
//
// Validation, caching and the strict rate limit live in one shared flow
// (lib/weather/request.ts) so this route and /api/weather/forecast cannot
// drift: coordinates snapped to the iOS grid, cache first, then a limiter that
// fails CLOSED before any paid OpenWeather call.

import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchWeather, getWindDirection } from '@/lib/weather/openweather';
import { withX402Route } from '@/lib/x402-config';
import { BoundedTtlCache, coordinateWeatherHandler } from '@/lib/weather/request';

const handler = coordinateWeatherHandler({
  name: 'weather',
  cache: new BoundedTtlCache<unknown>(30 * 60 * 1000),
  cdnHeaders: cdnCacheHeaders(600, 1800),
  load: async (lat, lon, apiKey) => {
    const weather = await fetchWeather(lat, lon, apiKey);
    return {
      temp: weather.temp,
      condition: weather.condition,
      conditionIcon: weather.conditionIcon,
      windSpeed: weather.windSpeed,
      windDirection: getWindDirection(weather.windDirection),
      humidity: weather.humidity,
      city: weather.city,
    };
  },
});

export const GET = withX402Route(handler, '/api/weather');
