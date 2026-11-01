// src/app/api/weather/forecast/route.ts
// GET /api/weather/forecast?lat&lon — five-day forecast for a point.
//
// Shares its validation, cache-first order and fail-closed rate limit with
// /api/weather through lib/weather/request.ts.

import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchForecast, fetchWeather } from '@/lib/weather/openweather';
import { withX402Route } from '@/lib/x402-config';
import { BoundedTtlCache, coordinateWeatherHandler } from '@/lib/weather/request';

const handler = coordinateWeatherHandler({
  name: 'weather-forecast',
  cache: new BoundedTtlCache<unknown>(60 * 60 * 1000),
  cacheKeyPrefix: 'forecast-',
  cdnHeaders: cdnCacheHeaders(1800, 3600),
  load: async (lat, lon, apiKey) => {
    const [forecast, current] = await Promise.all([
      fetchForecast(lat, lon, apiKey),
      fetchWeather(lat, lon, apiKey).catch(() => null),
    ]);
    // Current observation and the provider's actual three-hour forecast periods.
    return {
      city: forecast.city,
      days: forecast.days,
      periods: forecast.periods,
      localDate: forecast.localDate,
      current: current ? { ...current, fetchedAt: new Date().toISOString() } : null,
    };
  },
});

export const GET = withX402Route(handler, '/api/weather/forecast');
