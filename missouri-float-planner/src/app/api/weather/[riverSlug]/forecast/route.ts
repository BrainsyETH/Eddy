// src/app/api/weather/[riverSlug]/forecast/route.ts
// GET /api/weather/[riverSlug]/forecast - Fetch 5-day weather forecast

import { NextRequest, NextResponse } from 'next/server';
import { getCityForRiver, fetchForecast } from '@/lib/weather/openweather';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverSlug: string }> }
) {
  try {
    const { riverSlug } = await params;

    const location = getCityForRiver(riverSlug);
    if (!location) {
      return NextResponse.json(
        { error: 'Unknown river' },
        { status: 404 }
      );
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Weather service not configured' },
        { status: 500 }
      );
    }

    const forecast = await fetchForecast(location.lat, location.lon, apiKey);

    return NextResponse.json({
      river: riverSlug,
      location: location.city,
      forecast: forecast.days,
    });
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    return NextResponse.json(
      { error: 'Failed to fetch forecast' },
      { status: 500 }
    );
  }
}
