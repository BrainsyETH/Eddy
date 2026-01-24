// src/app/api/plan/route.ts
// GET /api/plan - Calculate a float plan with segment-aware gauge selection

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDriveTime } from '@/lib/mapbox/directions';
import { calculateFloatTime, formatFloatTime, formatDistance, formatDriveTime } from '@/lib/calculations/floatTime';
import {
  fetchGaugeReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';
import type { PlanResponse, FloatPlan, AccessPointType, HazardType, HazardSeverity, ConditionCode, FlowRating } from '@/types/api';

// Flow rating based on percentile thresholds
function getFlowRatingFromPercentile(percentile: number | null): FlowRating {
  if (percentile === null) return 'unknown';
  if (percentile <= 10) return 'poor';
  if (percentile <= 25) return 'low';
  if (percentile <= 75) return 'good';
  if (percentile <= 90) return 'high';
  return 'flood';
}

const FLOW_DESCRIPTIONS: Record<FlowRating, string> = {
  flood: 'Dangerous flooding - do not float',
  high: 'Fast current - experienced paddlers only',
  good: 'Ideal conditions - minimal dragging',
  low: 'Floatable with some dragging in riffles',
  poor: 'Too low - frequent dragging and portages likely',
  unknown: 'Current conditions unavailable',
};

// Map legacy condition codes to flow ratings (fallback when stats unavailable)
function conditionCodeToFlowRating(code: ConditionCode): FlowRating {
  switch (code) {
    case 'optimal': return 'good';
    case 'low': return 'low';
    case 'very_low': return 'poor';
    case 'too_low': return 'poor';
    case 'high': return 'high';
    case 'dangerous': return 'flood';
    default: return 'unknown';
  }
}

// Helper to compute condition from gauge height and thresholds
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
    return { label: 'Unknown Conditions', code: 'unknown' };
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

// Force dynamic rendering (uses cookies and searchParams)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const riverId = searchParams.get('riverId');
    const startId = searchParams.get('startId');
    const endId = searchParams.get('endId');
    const vesselTypeId = searchParams.get('vesselTypeId');
    // tripDurationDays is parsed but used by the separate /api/plan/campgrounds endpoint
    // Kept here for potential future inline campground response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _tripDurationDays = searchParams.get('tripDurationDays');

    if (!riverId || !startId || !endId) {
      return NextResponse.json(
        { error: 'Missing required parameters: riverId, startId, endId' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get river details
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, name, slug')
      .eq('id', riverId)
      .single();

    if (riverError || !river) {
      return NextResponse.json(
        { error: 'River not found' },
        { status: 404 }
      );
    }

    // Get access points
    const { data: accessPoints, error: accessError } = await supabase
      .from('access_points')
      .select('*')
      .in('id', [startId, endId])
      .eq('approved', true);

    if (accessError || !accessPoints || accessPoints.length !== 2) {
      return NextResponse.json(
        { error: 'Access points not found' },
        { status: 404 }
      );
    }

    const putIn = accessPoints.find(ap => ap.id === startId);
    const takeOut = accessPoints.find(ap => ap.id === endId);

    if (!putIn || !takeOut) {
      return NextResponse.json(
        { error: 'Invalid access points' },
        { status: 400 }
      );
    }

    // Get vessel type (default to first if not specified)
    let vesselType;
    if (vesselTypeId) {
      const { data: vt } = await supabase
        .from('vessel_types')
        .select('*')
        .eq('id', vesselTypeId)
        .single();
      vesselType = vt;
    }

    if (!vesselType) {
      const { data: defaultVessel } = await supabase
        .from('vessel_types')
        .select('*')
        .order('sort_order', { ascending: true })
        .limit(1)
        .single();
      vesselType = defaultVessel;
    }

    if (!vesselType) {
      return NextResponse.json(
        { error: 'Vessel type not found' },
        { status: 404 }
      );
    }

    // Get float segment using database function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: segment, error: segmentError } = await (supabase.rpc as any)(
      'get_float_segment',
      {
        p_start_access_id: startId,
        p_end_access_id: endId,
      }
    );

    if (segmentError || !segment || segment.length === 0) {
      return NextResponse.json(
        { error: 'Could not calculate float segment' },
        { status: 500 }
      );
    }

    const segmentData = segment[0];
    const distanceMiles = parseFloat(segmentData.distance_miles);
    const putInMile = parseFloat(segmentData.start_river_mile);

    // Get put-in coordinates for segment-aware gauge selection (fallback)
    const putInCoords = putIn.location_snap?.coordinates || putIn.location_orig?.coordinates;

    // Debug logging for gauge selection
    console.log('[Plan API] Segment-aware gauge selection:', {
      putInName: putIn.name,
      putInMile,
      putInCoords,
    });

    // Get river condition using position-based gauge selection
    // Logic: Use gauge at or upstream of put-in mile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conditionData, error: conditionError } = await (supabase.rpc as any)('get_river_condition_segment', {
      p_river_id: riverId,
      p_put_in_mile: putInMile,
      p_put_in_point: putInCoords
        ? `SRID=4326;POINT(${putInCoords[0]} ${putInCoords[1]})`
        : null,
    });

    // Debug logging for condition result
    console.log('[Plan API] Condition result:', {
      error: conditionError,
      gaugeName: conditionData?.[0]?.gauge_name,
      gaugeUsgsId: conditionData?.[0]?.gauge_usgs_id,
      gaugeRiverMile: conditionData?.[0]?.gauge_river_mile,
    });

    let condition = conditionData?.[0];
    let conditionCode: ConditionCode = condition?.condition_code || 'unknown';

    // If database returns unknown (no gauge readings), fall back to live USGS data
    if (conditionCode === 'unknown' || !condition?.gauge_height_ft) {
      // Get gauge info for this river (segment-aware or primary)
      const gaugeUsgsSiteId = condition?.gauge_usgs_id;

      if (gaugeUsgsSiteId) {
        // Fetch live USGS reading
        const usgsReadings = await fetchGaugeReadings([gaugeUsgsSiteId]);
        const usgsReading = usgsReadings.find(r => r.siteId === gaugeUsgsSiteId);

        if (usgsReading && usgsReading.gaugeHeightFt !== null) {
          // Get thresholds for this gauge
          const { data: gaugeThresholds } = await supabase
            .from('river_gauges')
            .select(`
              level_too_low,
              level_low,
              level_optimal_min,
              level_optimal_max,
              level_high,
              level_dangerous,
              gauge_stations!inner (usgs_site_id)
            `)
            .eq('river_id', riverId)
            .eq('gauge_stations.usgs_site_id', gaugeUsgsSiteId)
            .limit(1)
            .maybeSingle();

          if (gaugeThresholds) {
            const computed = computeConditionFromReading(usgsReading.gaugeHeightFt, {
              level_too_low: gaugeThresholds.level_too_low,
              level_low: gaugeThresholds.level_low,
              level_optimal_min: gaugeThresholds.level_optimal_min,
              level_optimal_max: gaugeThresholds.level_optimal_max,
              level_high: gaugeThresholds.level_high,
              level_dangerous: gaugeThresholds.level_dangerous,
            });

            const readingAgeHours = usgsReading.readingTimestamp
              ? (Date.now() - new Date(usgsReading.readingTimestamp).getTime()) / (1000 * 60 * 60)
              : null;

            // Update condition with live USGS data
            condition = {
              ...condition,
              condition_label: computed.label,
              condition_code: computed.code,
              gauge_height_ft: usgsReading.gaugeHeightFt,
              discharge_cfs: usgsReading.dischargeCfs,
              reading_timestamp: usgsReading.readingTimestamp,
              reading_age_hours: readingAgeHours,
            };
            conditionCode = computed.code;
          }
        }
      } else {
        // No gauge from segment-aware lookup, try primary gauge
        const { data: primaryGauge } = await supabase
          .from('river_gauges')
          .select(`
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

        if (primaryGauge) {
          const gaugeStation = Array.isArray(primaryGauge.gauge_stations)
            ? primaryGauge.gauge_stations[0]
            : primaryGauge.gauge_stations;
          const usgsSiteId = gaugeStation?.usgs_site_id;

          if (usgsSiteId) {
            const usgsReadings = await fetchGaugeReadings([usgsSiteId]);
            const usgsReading = usgsReadings.find(r => r.siteId === usgsSiteId);

            if (usgsReading && usgsReading.gaugeHeightFt !== null) {
              const computed = computeConditionFromReading(usgsReading.gaugeHeightFt, {
                level_too_low: primaryGauge.level_too_low,
                level_low: primaryGauge.level_low,
                level_optimal_min: primaryGauge.level_optimal_min,
                level_optimal_max: primaryGauge.level_optimal_max,
                level_high: primaryGauge.level_high,
                level_dangerous: primaryGauge.level_dangerous,
              });

              const readingAgeHours = usgsReading.readingTimestamp
                ? (Date.now() - new Date(usgsReading.readingTimestamp).getTime()) / (1000 * 60 * 60)
                : null;

              condition = {
                condition_label: computed.label,
                condition_code: computed.code,
                gauge_height_ft: usgsReading.gaugeHeightFt,
                discharge_cfs: usgsReading.dischargeCfs,
                reading_timestamp: usgsReading.readingTimestamp,
                reading_age_hours: readingAgeHours,
                gauge_name: gaugeStation?.name,
                gauge_usgs_id: usgsSiteId,
                accuracy_warning: false,
                accuracy_warning_reason: null,
              };
              conditionCode = computed.code;
            }
          }
        }
      }
    }

    // Try to get known float time from float_segments table first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: segmentTime } = await (supabase.rpc as any)('get_segment_float_time', {
      p_put_in_id: startId,
      p_take_out_id: endId,
      p_vessel_type: vesselType.slug,
    });

    let floatTimeResult: { minutes: number; speedMph: number; isEstimate: boolean; timeRange?: { min: number; max: number } } | null = null;

    if (segmentTime && segmentTime.length > 0 && segmentTime[0].time_avg_minutes) {
      // Use known segment time
      const st = segmentTime[0];
      floatTimeResult = {
        minutes: st.time_avg_minutes,
        speedMph: distanceMiles / (st.time_avg_minutes / 60),
        isEstimate: false,
        timeRange: st.time_min_minutes && st.time_max_minutes
          ? { min: st.time_min_minutes, max: st.time_max_minutes }
          : undefined,
      };

      // Add warning if floating upstream (reverse direction)
      if (st.is_reverse) {
        // Will be added to warnings array below
      }
    } else {
      // Fall back to calculation-based estimate
      const calcResult = calculateFloatTime(
        distanceMiles,
        {
          speedLowWater: parseFloat(vesselType.speed_low_water),
          speedNormal: parseFloat(vesselType.speed_normal),
          speedHighWater: parseFloat(vesselType.speed_high_water),
        },
        conditionCode
      );

      if (calcResult) {
        floatTimeResult = {
          minutes: calcResult.minutes,
          speedMph: calcResult.speedMph,
          isEstimate: true,
        };
      }
    }

    // Get shuttle drive time using Mapbox Directions API
    // Priority: driving_lat/lng > location_snap > location_orig
    let driveBack: {
      minutes: number;
      miles: number;
      formatted: string;
      routeSummary: string | null;
      routeGeometry: GeoJSON.LineString | null;
    };
    try {
      // Get put-in driving coordinates (prefer dedicated driving coords, then snap, then orig)
      let putInLng: number, putInLat: number;
      if (putIn.driving_lat && putIn.driving_lng) {
        putInLng = parseFloat(putIn.driving_lng);
        putInLat = parseFloat(putIn.driving_lat);
      } else {
        const coords = putIn.location_snap?.coordinates || putIn.location_orig?.coordinates;
        if (!coords) throw new Error('Missing put-in coordinates');
        [putInLng, putInLat] = coords;
      }

      // Get take-out driving coordinates
      let takeOutLng: number, takeOutLat: number;
      if (takeOut.driving_lat && takeOut.driving_lng) {
        takeOutLng = parseFloat(takeOut.driving_lng);
        takeOutLat = parseFloat(takeOut.driving_lat);
      } else {
        const coords = takeOut.location_snap?.coordinates || takeOut.location_orig?.coordinates;
        if (!coords) throw new Error('Missing take-out coordinates');
        [takeOutLng, takeOutLat] = coords;
      }

      // Call Mapbox Directions API (shuttle goes take-out -> put-in)
      const driveResult = await getDriveTime(
        takeOutLng,
        takeOutLat,
        putInLng,
        putInLat,
        conditionCode
      );

      driveBack = {
        minutes: driveResult.minutes,
        miles: driveResult.miles,
        formatted: formatDriveTime(driveResult.minutes),
        routeSummary: driveResult.routeSummary,
        routeGeometry: driveResult.geometry,
      };
    } catch (error) {
      console.error('Error calculating drive time:', error);
      driveBack = {
        minutes: 0,
        miles: 0,
        formatted: 'Unknown',
        routeSummary: null,
        routeGeometry: null,
      };
    }

    // Get hazards along the route
    const startMile = parseFloat(segmentData.start_river_mile);
    const endMile = parseFloat(segmentData.end_river_mile);
    const minMile = Math.min(startMile, endMile);
    const maxMile = Math.max(startMile, endMile);

    const { data: hazards } = await supabase
      .from('river_hazards')
      .select('*')
      .eq('river_id', riverId)
      .eq('active', true)
      .gte('river_mile_downstream', minMile)
      .lte('river_mile_downstream', maxMile)
      .order('river_mile_downstream', { ascending: true });

    // Build warnings array
    const warnings: string[] = [];
    if (condition?.accuracy_warning) {
      warnings.push(condition.accuracy_warning_reason || 'Gauge reading may be inaccurate');
    }
    if (conditionCode === 'dangerous') {
      warnings.push('Water conditions are dangerous - do not float');
    }
    if (conditionCode === 'high') {
      warnings.push('High water conditions - experienced paddlers only');
    }
    if (conditionCode === 'too_low' || conditionCode === 'very_low') {
      warnings.push('Water levels are very low - scraping and portaging likely');
    }

    // Enrich condition with percentile-based flow rating
    let flowRating: FlowRating = 'unknown';
    let flowDescription = FLOW_DESCRIPTIONS.unknown;
    let percentile: number | null = null;
    let medianDischargeCfs: number | null = null;

    if (condition?.gauge_usgs_id && condition?.discharge_cfs !== null) {
      try {
        const stats = await fetchDailyStatistics(condition.gauge_usgs_id);
        if (stats) {
          percentile = calculateDischargePercentile(condition.discharge_cfs, stats);
          flowRating = getFlowRatingFromPercentile(percentile);
          flowDescription = FLOW_DESCRIPTIONS[flowRating];
          medianDischargeCfs = stats.p50;
        }
      } catch (statsError) {
        console.warn('Failed to fetch statistics for plan:', statsError);
      }
    }

    // Fallback: if stats-based rating failed, use condition code mapping
    if (flowRating === 'unknown' && conditionCode !== 'unknown') {
      flowRating = conditionCodeToFlowRating(conditionCode);
      flowDescription = FLOW_DESCRIPTIONS[flowRating];
    }

    // Build plan response
    const plan: FloatPlan = {
      river: {
        id: river.id,
        name: river.name,
        slug: river.slug,
        lengthMiles: 0, // Not needed in plan
        description: null,
        difficultyRating: null,
        region: null,
      },
      putIn: {
        id: putIn.id,
        riverId: putIn.river_id,
        name: putIn.name,
        slug: putIn.slug,
        riverMile: parseFloat(segmentData.start_river_mile),
        type: putIn.type as AccessPointType,
        isPublic: putIn.is_public,
        ownership: putIn.ownership,
        description: putIn.description,
        amenities: putIn.amenities || [],
        parkingInfo: putIn.parking_info,
        feeRequired: putIn.fee_required,
        feeNotes: putIn.fee_notes,
        directionsOverride: putIn.directions_override || null,
        coordinates: {
          lng: putIn.location_snap?.coordinates?.[0] || putIn.location_orig?.coordinates?.[0] || 0,
          lat: putIn.location_snap?.coordinates?.[1] || putIn.location_orig?.coordinates?.[1] || 0,
        },
      },
      takeOut: {
        id: takeOut.id,
        riverId: takeOut.river_id,
        name: takeOut.name,
        slug: takeOut.slug,
        riverMile: parseFloat(segmentData.end_river_mile),
        type: takeOut.type as AccessPointType,
        isPublic: takeOut.is_public,
        ownership: takeOut.ownership,
        description: takeOut.description,
        amenities: takeOut.amenities || [],
        parkingInfo: takeOut.parking_info,
        feeRequired: takeOut.fee_required,
        feeNotes: takeOut.fee_notes,
        directionsOverride: takeOut.directions_override || null,
        coordinates: {
          lng: takeOut.location_snap?.coordinates?.[0] || takeOut.location_orig?.coordinates?.[0] || 0,
          lat: takeOut.location_snap?.coordinates?.[1] || takeOut.location_orig?.coordinates?.[1] || 0,
        },
      },
      vessel: {
        id: vesselType.id,
        name: vesselType.name,
        slug: vesselType.slug,
        description: vesselType.description || '',
        icon: vesselType.icon || '',
        speeds: {
          lowWater: parseFloat(vesselType.speed_low_water),
          normal: parseFloat(vesselType.speed_normal),
          highWater: parseFloat(vesselType.speed_high_water),
        },
      },
      distance: {
        miles: distanceMiles,
        formatted: formatDistance(distanceMiles),
      },
      floatTime: floatTimeResult
        ? {
            minutes: floatTimeResult.minutes,
            formatted: floatTimeResult.timeRange
              ? `${formatFloatTime(floatTimeResult.timeRange.min)} - ${formatFloatTime(floatTimeResult.timeRange.max)}`
              : formatFloatTime(floatTimeResult.minutes),
            speedMph: floatTimeResult.speedMph,
            isEstimate: floatTimeResult.isEstimate,
            timeRange: floatTimeResult.timeRange,
          }
        : null,
      driveBack,
      condition: {
        label: condition?.condition_label || 'Unknown Conditions',
        code: conditionCode,
        gaugeHeightFt: condition?.gauge_height_ft,
        dischargeCfs: condition?.discharge_cfs,
        readingTimestamp: condition?.reading_timestamp,
        readingAgeHours: condition?.reading_age_hours,
        accuracyWarning: condition?.accuracy_warning || false,
        accuracyWarningReason: condition?.accuracy_warning_reason,
        gaugeName: condition?.gauge_name,
        gaugeUsgsId: condition?.gauge_usgs_id,
        flowRating,
        flowDescription,
        percentile,
        medianDischargeCfs,
        usgsUrl: condition?.gauge_usgs_id
          ? `https://waterdata.usgs.gov/monitoring-location/${condition.gauge_usgs_id}/`
          : null,
      },
      hazards: (hazards || []).map(h => ({
        id: h.id,
        riverId: h.river_id,
        name: h.name,
        type: h.type as HazardType,
        riverMile: parseFloat(h.river_mile_downstream),
        description: h.description,
        severity: h.severity as HazardSeverity,
        portageRequired: h.portage_required,
        portageSide: h.portage_side as 'left' | 'right' | 'either' | null,
        seasonalNotes: h.seasonal_notes,
        coordinates: {
          lng: h.location?.coordinates?.[0] || 0,
          lat: h.location?.coordinates?.[1] || 0,
        },
      })),
      route: {
        type: 'Feature',
        geometry: segmentData.segment_geom,
        properties: {},
      },
      warnings,
    };

    return NextResponse.json<PlanResponse>({ plan });
  } catch (error) {
    console.error('Error calculating float plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
