// src/app/api/gauges/[siteId]/history/route.ts
// GET /api/gauges/[siteId]/history - Fetch 7-day historical gauge data

import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalReadings } from '@/lib/usgs/gauges';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);

    // Validate days parameter (max 30 days)
    const validDays = Math.min(Math.max(days, 1), 30);

    const historicalData = await fetchHistoricalReadings(siteId, validDays);

    if (!historicalData) {
      return NextResponse.json(
        { error: 'Historical data not available for this gauge' },
        { status: 404 }
      );
    }

    // Downsample readings for chart display (max ~168 points for 7 days = 1 per hour)
    const maxPoints = validDays * 24;
    let readings = historicalData.readings;

    if (readings.length > maxPoints) {
      const step = Math.ceil(readings.length / maxPoints);
      readings = readings.filter((_, index) => index % step === 0);
    }

    return NextResponse.json({
      siteId: historicalData.siteId,
      siteName: historicalData.siteName,
      readings,
      stats: {
        minDischarge: historicalData.minDischarge,
        maxDischarge: historicalData.maxDischarge,
        minHeight: historicalData.minHeight,
        maxHeight: historicalData.maxHeight,
      },
    });
  } catch (error) {
    console.error('Error fetching historical gauge data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}
