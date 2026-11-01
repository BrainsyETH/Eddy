// src/app/api/weather/route.ts
// Weather API route - fetches current weather for given coordinates
// Caches results for 30 minutes to minimize API calls

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchWeather, getWindDirection } from '@/lib/weather/openweather';
import { withX402Route } from '@/lib/x402-config';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { BoundedTtlCache, parseWeatherCoords } from '@/lib/weather/request';

// Per-instance, size-bounded cache; see lib/weather/request.ts.
const weatherCache = new BoundedTtlCache<unknown>(30 * 60 * 1000);

async function _GET(request: NextRequest) {
  // Before anything that can cost an upstream call.
  const limited = await rateLimit(`weather:${getClientIp(request)}`, 30, 60 * 1000);
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
  const cacheKey = `${coords.key}`;

  const cached = weatherCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: cdnCacheHeaders(600, 1800) });
  }

  try {
    const weather = await fetchWeather(roundedLat, roundedLon, apiKey);

    const responseData = {
      temp: weather.temp,
      condition: weather.condition,
      conditionIcon: weather.conditionIcon,
      windSpeed: weather.windSpeed,
      windDirection: getWindDirection(weather.windDirection),
      humidity: weather.humidity,
      city: weather.city,
    };

    // Cache the result
    weatherCache.set(cacheKey, responseData);

    return NextResponse.json(responseData, { headers: cdnCacheHeaders(600, 1800) });
  } catch (error) {
    console.error('Weather fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/weather');
