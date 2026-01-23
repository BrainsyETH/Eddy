// src/app/api/conditions/[riverId]/route.ts
// GET /api/conditions/[riverId] - Get current river conditions

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import type { ConditionGauge, ConditionResponse } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverId: string }> }
) {
  try {
    const { riverId } = await params;
    const supabase = await createClient();
    
    // Check for optional put-in access point ID for segment-aware gauge selection
    const searchParams = request.nextUrl.searchParams;
    const putInAccessPointId = searchParams.get('putInAccessPointId');
    
    // Get put-in coordinates if access point ID provided
    let putInPoint: string | null = null;
    if (putInAccessPointId) {
      const { data: accessPoint } = await supabase
        .from('access_points')
        .select('location_snap, location_orig')
        .eq('id', putInAccessPointId)
        .eq('river_id', riverId)
        .single();
      
      if (accessPoint) {
        const coords = accessPoint.location_snap?.coordinates || accessPoint.location_orig?.coordinates;
        if (coords) {
          putInPoint = `SRID=4326;POINT(${coords[0]} ${coords[1]})`;
        }
      }
    }

    // Call the database function to get river condition (segment-aware if put-in provided)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(
      putInPoint ? 'get_river_condition_segment' : 'get_river_condition',
      putInPoint
        ? {
            p_river_id: riverId,
            p_put_in_point: putInPoint,
          }
        : {
            p_river_id: riverId,
          }
    );

    if (error) {
      console.error('[Conditions API] Database function error:', {
        riverId,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      
      // Return error response with diagnostic info
      return NextResponse.json<ConditionResponse>(
        {
          condition: null,
          available: false,
          error: 'Database error',
          diagnostic: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      );
    }

    const { data: linkedGauges } = await supabase
      .from('river_gauges')
      .select('id, is_primary, gauge_station_id, gauge_stations(id, name, usgs_site_id)')
      .eq('river_id', riverId);

    const usgsSiteIds = (linkedGauges || [])
      .map((gauge) => {
        const gaugeStation = Array.isArray(gauge.gauge_stations)
          ? gauge.gauge_stations[0]
          : gauge.gauge_stations;
        return gaugeStation?.usgs_site_id ?? null;
      })
      .filter((siteId): siteId is string => !!siteId);

    const usgsReadings = usgsSiteIds.length > 0 ? await fetchGaugeReadings(usgsSiteIds) : [];
    const usgsReadingMap = new Map(usgsReadings.map((reading) => [reading.siteId, reading]));

    const gaugeSummaries: ConditionGauge[] = await Promise.all(
      (linkedGauges || []).map(async (gauge) => {
        const gaugeStation = Array.isArray(gauge.gauge_stations)
          ? gauge.gauge_stations[0]
          : gauge.gauge_stations;
        const usgsReading = gaugeStation?.usgs_site_id
          ? usgsReadingMap.get(gaugeStation.usgs_site_id)
          : undefined;
        const { data: latestReading } = await supabase
          .from('gauge_readings')
          .select('gauge_height_ft, discharge_cfs, reading_timestamp')
          .eq('gauge_station_id', gauge.gauge_station_id)
          .order('reading_timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        const dbTimestamp = latestReading?.reading_timestamp ?? null;
        const usgsTimestamp = usgsReading?.readingTimestamp ?? null;
        const readingTimestamp =
          dbTimestamp && usgsTimestamp
            ? new Date(dbTimestamp) >= new Date(usgsTimestamp)
              ? dbTimestamp
              : usgsTimestamp
            : dbTimestamp ?? usgsTimestamp ?? null;
        const readingAgeHours = readingTimestamp
          ? (Date.now() - new Date(readingTimestamp).getTime()) / (1000 * 60 * 60)
          : null;

        return {
          id: gauge.gauge_station_id,
          name: gaugeStation?.name ?? null,
          usgsSiteId: gaugeStation?.usgs_site_id ?? null,
          isPrimary: gauge.is_primary ?? false,
          gaugeHeightFt:
            readingTimestamp === dbTimestamp
              ? latestReading?.gauge_height_ft ?? null
              : usgsReading?.gaugeHeightFt ?? null,
          dischargeCfs:
            readingTimestamp === dbTimestamp
              ? latestReading?.discharge_cfs ?? null
              : usgsReading?.dischargeCfs ?? null,
          readingTimestamp,
          readingAgeHours,
        };
      })
    );

    if (!data || data.length === 0) {
      console.warn('[Conditions API] No condition data returned for river:', riverId);
      
      // Check if river has gauge stations linked
      const { data: gaugeCheck } = await supabase
        .from('river_gauges')
        .select('id, is_primary')
        .eq('river_id', riverId)
        .limit(1);
      
      if (!gaugeCheck || gaugeCheck.length === 0) {
        console.warn('[Conditions API] River has no gauge stations linked:', riverId);
      } else {
        // Check if there are any gauge readings
        const { data: readingCheck } = await supabase
          .from('gauge_readings')
          .select('id, reading_timestamp')
          .order('reading_timestamp', { ascending: false })
          .limit(1);
        
        if (!readingCheck || readingCheck.length === 0) {
          console.warn('[Conditions API] No gauge readings found in database. Cron job may not be running.');
        }
      }
      
      return NextResponse.json<ConditionResponse>({
        condition: null,
        available: false,
        diagnostic: process.env.NODE_ENV === 'development' 
          ? 'No condition data found. Check gauge station linkage and cron job status.'
          : undefined,
        gauges: gaugeSummaries,
      });
    }

    const condition = data[0];

    let diagnostic: string | undefined;

    // Validate condition data
    if (!condition.condition_code || condition.condition_code === 'unknown') {
      console.warn('[Conditions API] Condition code is unknown for river:', riverId);
      if (condition.gauge_height_ft === null) {
        diagnostic = 'Gauge reading is missing for the primary station. Check gauge_readings and cron updates.';
      }
    }

    const response: ConditionResponse = {
      condition: {
        label: condition.condition_label || 'Unknown Conditions',
        code: condition.condition_code || 'unknown',
        gaugeHeightFt: condition.gauge_height_ft,
        dischargeCfs: condition.discharge_cfs,
        readingTimestamp: condition.reading_timestamp,
        readingAgeHours: condition.reading_age_hours,
        accuracyWarning: condition.accuracy_warning || false,
        accuracyWarningReason: condition.accuracy_warning_reason,
        gaugeName: condition.gauge_name,
        gaugeUsgsId: condition.gauge_usgs_id,
      },
      available: true,
      diagnostic,
      gauges: gaugeSummaries,
    };

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Conditions API] Unexpected error:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return NextResponse.json<ConditionResponse>(
      {
        condition: null,
        available: false,
        error: 'Internal server error',
        diagnostic: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
