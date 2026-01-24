// src/app/api/conditions/[riverId]/route.ts
// GET /api/conditions/[riverId] - Get current river conditions

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import type { ConditionCode, ConditionGauge, ConditionResponse, RiverCondition } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

// Helper to determine condition from gauge height and thresholds
function computeConditionFromReading(
  gaugeHeightFt: number | null,
  thresholds: {
    level_too_low: number | null;
    level_low: number | null;
    level_optimal_min: number | null;
    level_optimal_max: number | null;
    level_high: number | null;
    level_dangerous: number | null;
  }
): { label: string; code: ConditionCode } {
  if (gaugeHeightFt === null) {
    return { label: 'Unknown', code: 'unknown' };
  }

  if (thresholds.level_dangerous !== null && gaugeHeightFt >= thresholds.level_dangerous) {
    return { label: 'Dangerous - Do Not Float', code: 'dangerous' };
  }
  if (thresholds.level_high !== null && gaugeHeightFt >= thresholds.level_high) {
    return { label: 'High Water - Experienced Only', code: 'high' };
  }
  if (
    thresholds.level_optimal_min !== null &&
    thresholds.level_optimal_max !== null &&
    gaugeHeightFt >= thresholds.level_optimal_min &&
    gaugeHeightFt <= thresholds.level_optimal_max
  ) {
    return { label: 'Optimal Conditions', code: 'optimal' };
  }
  if (thresholds.level_low !== null && gaugeHeightFt >= thresholds.level_low) {
    return { label: 'Low - Floatable', code: 'low' };
  }
  if (thresholds.level_too_low !== null && gaugeHeightFt >= thresholds.level_too_low) {
    return { label: 'Very Low - Scraping Likely', code: 'very_low' };
  }
  return { label: 'Too Low - Not Recommended', code: 'too_low' };
}

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
    let finalCondition: RiverCondition;

    // Check if database returned unknown (no readings in gauge_readings table)
    const dbConditionIsUnknown = !condition.condition_code || condition.condition_code === 'unknown' || condition.gauge_height_ft === null;

    if (dbConditionIsUnknown) {
      console.log('[Conditions API] Database returned unknown, trying live USGS data...');

      // Try to use live USGS data with thresholds from river_gauges
      const { data: primaryGaugeData } = await supabase
        .from('river_gauges')
        .select(`
          gauge_station_id,
          level_too_low,
          level_low,
          level_optimal_min,
          level_optimal_max,
          level_high,
          level_dangerous,
          gauge_stations (
            id,
            name,
            usgs_site_id
          )
        `)
        .eq('river_id', riverId)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle();

      if (primaryGaugeData) {
        const gaugeStation = Array.isArray(primaryGaugeData.gauge_stations)
          ? primaryGaugeData.gauge_stations[0]
          : primaryGaugeData.gauge_stations;
        const usgsSiteId = gaugeStation?.usgs_site_id;

        if (usgsSiteId) {
          const usgsReading = usgsReadingMap.get(usgsSiteId);

          if (usgsReading && usgsReading.gaugeHeightFt !== null) {
            console.log('[Conditions API] Using live USGS reading:', usgsReading.gaugeHeightFt, 'ft');

            const computed = computeConditionFromReading(usgsReading.gaugeHeightFt, {
              level_too_low: primaryGaugeData.level_too_low,
              level_low: primaryGaugeData.level_low,
              level_optimal_min: primaryGaugeData.level_optimal_min,
              level_optimal_max: primaryGaugeData.level_optimal_max,
              level_high: primaryGaugeData.level_high,
              level_dangerous: primaryGaugeData.level_dangerous,
            });

            const readingAgeHours = usgsReading.readingTimestamp
              ? (Date.now() - new Date(usgsReading.readingTimestamp).getTime()) / (1000 * 60 * 60)
              : null;

            finalCondition = {
              label: computed.label,
              code: computed.code,
              gaugeHeightFt: usgsReading.gaugeHeightFt,
              dischargeCfs: usgsReading.dischargeCfs,
              readingTimestamp: usgsReading.readingTimestamp,
              readingAgeHours,
              accuracyWarning: false,
              accuracyWarningReason: null,
              gaugeName: gaugeStation?.name || condition.gauge_name,
              gaugeUsgsId: usgsSiteId,
            };
          } else {
            diagnostic = 'No live USGS data available for this gauge.';
            finalCondition = {
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
            };
          }
        } else {
          diagnostic = 'Primary gauge has no USGS site ID configured.';
          finalCondition = {
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
          };
        }
      } else {
        diagnostic = 'No primary gauge configured for this river.';
        finalCondition = {
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
        };
      }
    } else {
      // Database has valid condition data
      finalCondition = {
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
      };
    }

    const response: ConditionResponse = {
      condition: finalCondition,
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
