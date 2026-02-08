// src/app/api/cron/update-gauges/route.ts
// POST /api/cron/update-gauges - Update gauge readings from USGS
// Called by Vercel Cron every hour (or every 15 minutes for high-frequency gauges)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';

// Force dynamic rendering (cron endpoint)
export const dynamic = 'force-dynamic';

// Rate of change threshold (ft/hour) that triggers high-frequency polling
const RAPID_CHANGE_THRESHOLD = 0.5;

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret — always required, including in development.
    // Use `curl -X POST -H "Authorization: Bearer $CRON_SECRET"` for local testing.
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

    // Check if this is a high-frequency poll (triggered every 15 minutes)
    const isHighFrequencyPoll = request.headers.get('x-high-frequency') === 'true';

    // Get gauge stations based on poll type
    let stationsQuery = supabase
      .from('gauge_stations')
      .select('id, usgs_site_id, high_frequency_flag')
      .eq('active', true);

    // For high-frequency polls, only fetch gauges with the flag set
    if (isHighFrequencyPoll) {
      stationsQuery = stationsQuery.eq('high_frequency_flag', true);
    }

    const { data: stationsData, error: stationsError } = await stationsQuery;

    if (stationsError || !stationsData) {
      console.error('Error fetching gauge stations:', stationsError);
      return NextResponse.json(
        { error: 'Could not fetch gauge stations' },
        { status: 500 }
      );
    }

    // Type assertion for stations
    const stations = stationsData as Array<{ 
      id: string; 
      usgs_site_id: string; 
      high_frequency_flag: boolean;
    }>;

    if (stations.length === 0) {
      return NextResponse.json({
        message: isHighFrequencyPoll 
          ? 'No high-frequency gauge stations found' 
          : 'No active gauge stations found',
        updated: 0,
        highFrequencyUpdated: 0,
      });
    }

    // Fetch readings from USGS (skip cache to ensure fresh data)
    const siteIds = stations.map(s => s.usgs_site_id);
    const readings = await fetchGaugeReadings(siteIds, { skipCache: true });

    // Update database and calculate rate of change
    let updated = 0;
    let errors = 0;
    let highFrequencyFlagsSet = 0;
    let highFrequencyFlagsCleared = 0;

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
        continue;
      }

      updated++;

      // Calculate rate of change using database function
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rateData } = await (supabase.rpc as any)('get_gauge_rate_of_change', {
        p_gauge_station_id: station.id,
        p_hours_lookback: 1,
      });

      const rateInfo = rateData?.[0];
      
      if (rateInfo) {
        const isRapidChange = rateInfo.rate_ft_per_hour !== null && 
          Math.abs(rateInfo.rate_ft_per_hour) > RAPID_CHANGE_THRESHOLD;
        
        // Update high_frequency_flag if needed
        if (isRapidChange && !station.high_frequency_flag) {
          // Water level changing rapidly - enable high-frequency polling
          const { error: flagError } = await supabase
            .from('gauge_stations')
            .update({ high_frequency_flag: true })
            .eq('id', station.id);

          if (!flagError) {
            highFrequencyFlagsSet++;
            console.log(
              `High-frequency polling enabled for ${reading.siteId}: ` +
              `rate=${rateInfo.rate_ft_per_hour?.toFixed(2)} ft/hr`
            );
          }
        } else if (!isRapidChange && station.high_frequency_flag) {
          // Water level stabilized - disable high-frequency polling
          const { error: flagError } = await supabase
            .from('gauge_stations')
            .update({ high_frequency_flag: false })
            .eq('id', station.id);

          if (!flagError) {
            highFrequencyFlagsCleared++;
            console.log(
              `High-frequency polling disabled for ${reading.siteId}: ` +
              `rate=${rateInfo.rate_ft_per_hour?.toFixed(2)} ft/hr`
            );
          }
        }
      }
    }

    const executionTime = new Date().toISOString();
    
    return NextResponse.json({
      message: 'Gauge update complete',
      updated,
      errors,
      total: readings.length,
      isHighFrequencyPoll,
      highFrequencyFlagsSet,
      highFrequencyFlagsCleared,
      executionTime,
      stationsProcessed: stations.length,
    });
  } catch (error) {
    console.error('Error in gauge update cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET removed — cron endpoints should only accept POST.
// For manual testing: curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/update-gauges
