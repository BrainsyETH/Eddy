// src/app/api/weather/forecast/route.ts
// Weather forecast API route - fetches 5-day forecast for given coordinates

import { NextRequest, NextResponse } from 'next/server';
import { fetchForecast } from '@/lib/weather/openweather';

// Simple in-memory cache
const forecastCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json(
      { error: 'Missing lat or lon parameter' },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Weather service not configured' },
      { status: 503 }
    );
  }

  const roundedLat = Math.round(parseFloat(lat) * 100) / 100;
  const roundedLon = Math.round(parseFloat(lon) * 100) / 100;
  const cacheKey = `forecast-${roundedLat},${roundedLon}`;

  const cached = forecastCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const forecast = await fetchForecast(roundedLat, roundedLon, apiKey);

    // Return only the next 3 days (skip today if partial)
    const responseData = {
      city: forecast.city,
      days: forecast.days.slice(0, 4),
    };

    forecastCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Forecast fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch forecast data' },
      { status: 500 }
    );
  }
}
