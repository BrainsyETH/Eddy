// src/app/api/conditions/[riverId]/route.ts
// GET /api/conditions/[riverId] - Get current river conditions

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchGaugeReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';
import { computeCondition, type ConditionThresholds } from '@/lib/conditions';
import {
  conditionCodeToFlowRating,
  getThresholdBasedDescription,
} from '@/lib/calculations/conditions';
import type { ConditionCode, ConditionGauge, ConditionResponse, RiverCondition } from '@/types/api';

/**
 * Fetches statistics and calculates percentile for a gauge reading.
 * Used as supplementary info only — primary rating comes from threshold-based condition code.
 */
async function enrichWithStatistics(
  usgsSiteId: string,
  dischargeCfs: number | null
): Promise<{
  percentile: number | null;
  medianDischargeCfs: number | null;
}> {
  if (dischargeCfs === null) {
    return { percentile: null, medianDischargeCfs: null };
  }

  const stats = await fetchDailyStatistics(usgsSiteId);
  if (!stats) {
    return { percentile: null, medianDischargeCfs: null };
  }

  const percentile = calculateDischargePercentile(dischargeCfs, stats);
  return { percentile, medianDischargeCfs: stats.p50 };
}

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

// Helper to determine condition from gauge height and thresholds
// Uses shared condition computation logic from @/lib/conditions
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
  // Convert database snake_case to camelCase for shared utility
  const thresholdsForCompute: ConditionThresholds = {
    levelTooLow: thresholds.level_too_low,
    levelLow: thresholds.level_low,
    levelOptimalMin: thresholds.level_optimal_min,
    levelOptimalMax: thresholds.level_optimal_max,
    levelHigh: thresholds.level_high,
    levelDangerous: thresholds.level_dangerous,
  };

  const result = computeCondition(gaugeHeightFt, thresholdsForCompute);
  return { label: result.label, code: result.code };
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
    
    // --- Phase 1: Start independent database queries in parallel ---
    // Kick off linked gauges query immediately (resolves while we process access point)
    const linkedGaugesPromise = supabase
      .from('river_gauges')
      .select('id, is_primary, gauge_station_id, gauge_stations(id, name, usgs_site_id)')
      .eq('river_id', riverId);

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

    // Await linked gauges (likely already resolved while access point query ran)
    const { data: linkedGauges } = await linkedGaugesPromise;

    const usgsSiteIds = (linkedGauges || [])
      .map((gauge) => {
        const gaugeStation = Array.isArray(gauge.gauge_stations)
          ? gauge.gauge_stations[0]
          : gauge.gauge_stations;
        return gaugeStation?.usgs_site_id ?? null;
      })
      .filter((siteId): siteId is string => !!siteId);

    // --- Phase 2: Run RPC, USGS fetch, and DB gauge readings in parallel ---
    const gaugeReadingsPromises = (linkedGauges || []).map((gauge) =>
      supabase
        .from('gauge_readings')
        .select('gauge_station_id, gauge_height_ft, discharge_cfs, reading_timestamp')
        .eq('gauge_station_id', gauge.gauge_station_id)
        .order('reading_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    const [rpcResult, usgsReadings, latestReadingResults] = await Promise.all([
      // Database condition function (segment-aware if put-in provided)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)(
        putInPoint ? 'get_river_condition_segment' : 'get_river_condition',
        putInPoint
          ? { p_river_id: riverId, p_put_in_point: putInPoint }
          : { p_river_id: riverId }
      ),
      // Live USGS gauge readings (external API — typically the slowest call)
      usgsSiteIds.length > 0 ? fetchGaugeReadings(usgsSiteIds) : Promise.resolve([]),
      // Latest DB reading for each gauge station (batched in parallel)
      Promise.all(gaugeReadingsPromises),
    ]);

    const { data, error } = rpcResult;

    if (error) {
      console.error('[Conditions API] Database function error:', {
        riverId,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

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

    // Build gauge summaries from pre-fetched data (synchronous — no more N+1 queries)
    const usgsReadingMap = new Map(usgsReadings.map((reading) => [reading.siteId, reading]));

    const gaugeSummaries: ConditionGauge[] = (linkedGauges || []).map((gauge, index) => {
      const gaugeStation = Array.isArray(gauge.gauge_stations)
        ? gauge.gauge_stations[0]
        : gauge.gauge_stations;
      const usgsReading = gaugeStation?.usgs_site_id
        ? usgsReadingMap.get(gaugeStation.usgs_site_id)
        : undefined;
      const latestReading = latestReadingResults[index]?.data ?? null;

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
    });

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

      // The database function already selected the appropriate gauge (segment-aware if put-in provided)
      // Use condition.gauge_usgs_id from the database result, or fall back to primary gauge query
      let selectedGaugeUsgsSiteId = condition.gauge_usgs_id;
      let selectedGaugeName = condition.gauge_name;
      let selectedThresholds: {
        level_too_low: number | null;
        level_low: number | null;
        level_optimal_min: number | null;
        level_optimal_max: number | null;
        level_high: number | null;
        level_dangerous: number | null;
      } | null = null;

      // Get thresholds for the selected gauge
      if (selectedGaugeUsgsSiteId) {
        const { data: gaugeData } = await supabase
          .from('river_gauges')
          .select(`
            level_too_low,
            level_low,
            level_optimal_min,
            level_optimal_max,
            level_high,
            level_dangerous,
            gauge_stations!inner (
              usgs_site_id
            )
          `)
          .eq('river_id', riverId)
          .eq('gauge_stations.usgs_site_id', selectedGaugeUsgsSiteId)
          .limit(1)
          .maybeSingle();

        if (gaugeData) {
          selectedThresholds = {
            level_too_low: gaugeData.level_too_low,
            level_low: gaugeData.level_low,
            level_optimal_min: gaugeData.level_optimal_min,
            level_optimal_max: gaugeData.level_optimal_max,
            level_high: gaugeData.level_high,
            level_dangerous: gaugeData.level_dangerous,
          };
        }
      }

      // If no gauge from database result, fall back to primary gauge
      if (!selectedGaugeUsgsSiteId || !selectedThresholds) {
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
          selectedGaugeUsgsSiteId = gaugeStation?.usgs_site_id || null;
          selectedGaugeName = gaugeStation?.name || null;
          selectedThresholds = {
            level_too_low: primaryGaugeData.level_too_low,
            level_low: primaryGaugeData.level_low,
            level_optimal_min: primaryGaugeData.level_optimal_min,
            level_optimal_max: primaryGaugeData.level_optimal_max,
            level_high: primaryGaugeData.level_high,
            level_dangerous: primaryGaugeData.level_dangerous,
          };
        }
      }

      const usgsSiteId = selectedGaugeUsgsSiteId;

      if (selectedThresholds && usgsSiteId) {
        const usgsReading = usgsReadingMap.get(usgsSiteId);

        if (usgsReading && usgsReading.gaugeHeightFt !== null) {
          console.log('[Conditions API] Using live USGS reading:', usgsReading.gaugeHeightFt, 'ft from', selectedGaugeName);

          const computed = computeConditionFromReading(usgsReading.gaugeHeightFt, selectedThresholds);

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
            gaugeName: selectedGaugeName || condition.gauge_name,
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
        diagnostic = 'No gauge configured for this river.';
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

    // Always derive flowRating from threshold-based condition code (not percentile)
    // This ensures consistency with GaugeOverview display
    const thresholdBasedRating = conditionCodeToFlowRating(finalCondition.code);
    const thresholdBasedDescription = getThresholdBasedDescription(finalCondition.code);

    // Optionally fetch percentile stats as supplementary info (but don't use for primary rating)
    let percentile: number | null = null;
    let medianDischargeCfs: number | null = null;

    if (finalCondition.gaugeUsgsId && finalCondition.dischargeCfs !== null) {
      try {
        const statsEnrichment = await enrichWithStatistics(
          finalCondition.gaugeUsgsId,
          finalCondition.dischargeCfs
        );
        // Only use percentile data as supplementary info, not for the primary rating
        percentile = statsEnrichment.percentile;
        medianDischargeCfs = statsEnrichment.medianDischargeCfs;
      } catch (statsError) {
        console.warn('[Conditions API] Failed to fetch statistics:', statsError);
        // Continue without statistics - threshold-based rating is still valid
      }
    }

    finalCondition = {
      ...finalCondition,
      flowRating: thresholdBasedRating,
      flowDescription: thresholdBasedDescription,
      percentile,
      medianDischargeCfs,
      usgsUrl: finalCondition.gaugeUsgsId
        ? `https://waterdata.usgs.gov/monitoring-location/${finalCondition.gaugeUsgsId}/`
        : null,
    };

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
