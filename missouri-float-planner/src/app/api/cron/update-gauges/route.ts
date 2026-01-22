// src/app/api/cron/update-gauges/route.ts
// POST /api/cron/update-gauges - Update gauge readings from USGS
// Called by Vercel Cron every hour

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();

    // Get all active gauge stations
    const { data: stations, error: stationsError } = await supabase
      .from('gauge_stations')
      .select('id, usgs_site_id')
      .eq('active', true);

    if (stationsError || !stations) {
      console.error('Error fetching gauge stations:', stationsError);
      return NextResponse.json(
        { error: 'Could not fetch gauge stations' },
        { status: 500 }
      );
    }

    if (stations.length === 0) {
      return NextResponse.json({
        message: 'No active gauge stations found',
        updated: 0,
      });
    }

    // Fetch readings from USGS
    const siteIds = stations.map(s => s.usgs_site_id);
    const readings = await fetchGaugeReadings(siteIds);

    // Update database
    let updated = 0;
    let errors = 0;

    for (const reading of readings) {
      const station = stations.find(s => s.usgs_site_id === reading.siteId);
      if (!station) continue;

      if (!reading.readingTimestamp) {
        console.warn(`No timestamp for gauge ${reading.siteId}`);
        continue;
      }

      // Insert or update reading
      const { error: insertError } = await supabase
        .from('gauge_readings')
        .upsert(
          {
            gauge_station_id: station.id,
            reading_timestamp: reading.readingTimestamp,
            gauge_height_ft: reading.gaugeHeightFt,
            discharge_cfs: reading.dischargeCfs,
            fetched_at: new Date().toISOString(),
          },
          {
            onConflict: 'gauge_station_id,reading_timestamp',
          }
        );

      if (insertError) {
        console.error(`Error updating gauge ${reading.siteId}:`, insertError);
        errors++;
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      message: 'Gauge update complete',
      updated,
      errors,
      total: readings.length,
    });
  } catch (error) {
    console.error('Error in gauge update cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also allow GET for manual testing (with auth)
export async function GET(request: NextRequest) {
  return POST(request);
}
