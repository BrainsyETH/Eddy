// src/app/api/weather/[riverSlug]/route.ts
// Server-side weather API to keep API key secure

import { NextRequest, NextResponse } from 'next/server';
import { fetchWeather, getCityForRiver } from '@/lib/weather/openweather';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverSlug: string }> }
) {
  const { riverSlug } = await params;

  const cityData = getCityForRiver(riverSlug);
  if (!cityData) {
    return NextResponse.json(
      { error: 'City not found for river' },
      { status: 404 }
    );
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Weather API not configured' },
      { status: 500 }
    );
  }

  try {
    const weather = await fetchWeather(cityData.lat, cityData.lon, apiKey);
    return NextResponse.json(weather);
  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
