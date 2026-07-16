// src/app/api/weather/[riverSlug]/forecast/route.ts
// GET /api/weather/[riverSlug]/forecast - Fetch 5-day weather forecast

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { getWeatherPointForRiver, fetchForecast } from '@/lib/weather/openweather';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverSlug: string }> }
) {
  try {
    const { riverSlug } = await params;

    const location = await getWeatherPointForRiver(riverSlug);
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
    }, { headers: cdnCacheHeaders(1800, 3600) });
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    return NextResponse.json(
      { error: 'Failed to fetch forecast' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ riverSlug: string }> }>(_GET, '/api/weather/:riverSlug/forecast');
