// src/app/api/weather/forecast/route.ts
// Weather forecast API route - fetches 5-day forecast for given coordinates

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchForecast, fetchWeather } from '@/lib/weather/openweather';
import { withX402Route } from '@/lib/x402-config';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { BoundedTtlCache, parseWeatherCoords } from '@/lib/weather/request';

// Per-instance, size-bounded cache; see lib/weather/request.ts.
const forecastCache = new BoundedTtlCache<unknown>(60 * 60 * 1000);

async function _GET(request: NextRequest) {
  // Before anything that can cost an upstream call.
  const limited = await rateLimit(`weather-forecast:${getClientIp(request)}`, 30, 60 * 1000);
  if (limited) return limited;

  const coords = parseWeatherCoords(request.nextUrl.searchParams);
  if (!coords.ok) {
    return NextResponse.json({ error: coords.error }, { status: 400 });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Weather service not configured' },
      { status: 503 }
    );
  }

  const roundedLat = coords.lat;
  const roundedLon = coords.lon;
  const cacheKey = `forecast-${coords.key}`;

  const cached = forecastCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: cdnCacheHeaders(1800, 3600) });
  }

  try {
    const [forecast, current] = await Promise.all([
      fetchForecast(roundedLat, roundedLon, apiKey),
      fetchWeather(roundedLat, roundedLon, apiKey).catch(() => null),
    ]);

    // Current observation and the provider’s actual three-hour forecast periods.
    const responseData = {
      city: forecast.city,
      days: forecast.days,
      periods: forecast.periods,
      localDate: forecast.localDate,
      current: current ? { ...current, fetchedAt: new Date().toISOString() } : null,
    };

    forecastCache.set(cacheKey, responseData);

    return NextResponse.json(responseData, { headers: cdnCacheHeaders(1800, 3600) });
  } catch (error) {
    console.error('Forecast fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch forecast data' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/weather/forecast');
