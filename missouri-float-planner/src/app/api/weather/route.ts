// src/app/api/weather/route.ts
// Weather API route - fetches current weather for given coordinates
// Caches results for 30 minutes to minimize API calls

import { NextRequest, NextResponse } from 'next/server';
import { fetchWeather, getWindDirection } from '@/lib/weather/openweather';

// Simple in-memory cache (in production, use Redis or similar)
const weatherCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

  // Round coordinates to reduce cache key variations
  const roundedLat = Math.round(parseFloat(lat) * 100) / 100;
  const roundedLon = Math.round(parseFloat(lon) * 100) / 100;
  const cacheKey = `${roundedLat},${roundedLon}`;

  // Check cache
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
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
    weatherCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Weather fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
