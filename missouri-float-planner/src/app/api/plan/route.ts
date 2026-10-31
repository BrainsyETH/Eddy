import { DOWNSTREAM_DAM_BUFFER_MILES, splitRouteHazards } from '@shared/route-hazards';
import { planHazardResult } from '@/lib/plan-hazards';
import { privateNoStore } from '@/lib/api-utils';
import { estimateRoute, RouteEstimateError } from '@/lib/calculations/route-estimate';
// src/app/api/plan/route.ts
// GET /api/plan - Calculate a float plan with segment-aware gauge selection

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatFloatTime, formatFloatTimeRange, formatDistance } from '@/lib/calculations/floatTime';
import {
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';
import { conditionCodeToFlowRating, FLOW_DESCRIPTIONS, type FlowRating } from '@/lib/calculations/conditions';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { PlanResponse, FloatPlan, AccessPointType } from '@/types/api';
import { withX402Route } from '@/lib/x402-config';
import { toHazard } from '@/lib/offline/shapes';
import { toNum } from '@/lib/utils/num';

// Force dynamic rendering (uses cookies and searchParams)
export const dynamic = 'force-dynamic';

async function _GET(request: NextRequest) {
  try {
    // Rate limit: 30 plan calculations per IP per minute
    // Each request can trigger multiple external API calls (USGS, Mapbox)
    const rateLimitResult = await rateLimit(`plan:${getClientIp(request)}`, 30, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

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

    const { river, putIn, takeOut, vesselType, segmentData, distanceMiles,
      condition, conditionCode, dailyStats, spanWarnings, floatTimeResult, withholdReason, estimateBasis, availability,
    } = await estimateRoute(supabase, { riverId, startId, endId, vesselTypeId });

    // Get hazards along the route
    const startMile = parseFloat(String(segmentData.start_river_mile));
    const endMile = parseFloat(String(segmentData.end_river_mile));
    const minMile = Math.min(startMile, endMile);
    const maxMile = Math.max(startMile, endMile);

    const { data: hazards, error: hazardError } = await supabase
      .from('river_hazards')
      .select('*')
      .eq('river_id', riverId)
      .eq('active', true)
      .gte('river_mile_downstream', minMile)
      .lte('river_mile_downstream', maxMile + DOWNSTREAM_DAM_BUFFER_MILES)
      .order('river_mile_downstream', { ascending: true });
    const hazardResult = planHazardResult(hazards, hazardError);
    if (hazardResult.hazardsUnavailable) console.error('[Plan] Hazard lookup failed:', hazardError);

    const routeHazards = splitRouteHazards(hazardResult.hazards, minMile, maxMile);

    // Build warnings array
    const warnings: string[] = [];
    warnings.push(...spanWarnings);
    if (condition?.accuracy_warning) {
      warnings.push(condition.accuracy_warning_reason || 'Gauge reading may be inaccurate');
    }
    if (conditionCode === 'dangerous') {
      warnings.push('Water conditions are dangerous - do not float');
    }
    if (conditionCode === 'high') {
      warnings.push('High water conditions - use caution');
    }

    // Warn if put-in or take-out may not have direct road access
    const roadAccessTypes = ['access', 'boat_ramp'];
    const putInTypes = (Array.isArray(putIn.types) && putIn.types.length > 0 ? putIn.types : [putIn.type]).filter(Boolean) as string[];
    const takeOutTypes = (Array.isArray(takeOut.types) && takeOut.types.length > 0 ? takeOut.types : [takeOut.type]).filter(Boolean) as string[];
    if (!putInTypes.some(t => roadAccessTypes.includes(t))) {
      warnings.push(`${putIn.name} does not have direct road access`);
    }
    if (!takeOutTypes.some(t => roadAccessTypes.includes(t))) {
      warnings.push(`${takeOut.name} does not have direct road access`);
    }

    // Always derive flowRating from threshold-based condition code (not percentile)
    // This ensures consistency with gauge overview display
    const flowRating: FlowRating = conditionCodeToFlowRating(conditionCode);
    const flowDescription = FLOW_DESCRIPTIONS[flowRating];

    // Supplementary percentile info — reuse the stats fetched above for Q_ref.
    let percentile: number | null = null;
    let medianDischargeCfs: number | null = null;
    if (dailyStats && condition?.discharge_cfs != null) {
      percentile = calculateDischargePercentile(condition.discharge_cfs, dailyStats);
      medianDischargeCfs = dailyStats.p50;
    }

    // Build plan response
    const plan: FloatPlan = {
      estimateBasis,
      river: {
        id: river.id,
        name: river.name,
        slug: river.slug,
        lengthMiles: 0, // Not needed in plan
        description: null,
        floatTip: river.float_tip,
        difficultyRating: null,
        region: null,
      },
      putIn: {
        id: putIn.id,
        riverId: putIn.river_id ?? '',
        name: putIn.name,
        slug: putIn.slug,
        riverMile: parseFloat(String(segmentData.start_river_mile)),
        type: putIn.type as AccessPointType,
        types: (putIn.types || (putIn.type ? [putIn.type] : [])) as AccessPointType[],
        isPublic: putIn.is_public ?? false,
        ownership: putIn.ownership,
        description: putIn.description,
        amenities: putIn.amenities || [],
        parkingInfo: putIn.parking_info,
        roadAccess: putIn.road_access,
        facilities: putIn.facilities,
        feeRequired: putIn.fee_required ?? false,
        feeNotes: putIn.fee_notes,
        directionsOverride: putIn.directions_override || null,
        imageUrls: putIn.image_urls || [],
        coordinates: {
          lng: (putIn.location_orig as { coordinates?: number[] } | null)?.coordinates?.[0] || (putIn.location_snap as { coordinates?: number[] } | null)?.coordinates?.[0] || 0,
          lat: (putIn.location_orig as { coordinates?: number[] } | null)?.coordinates?.[1] || (putIn.location_snap as { coordinates?: number[] } | null)?.coordinates?.[1] || 0,
        },
      },
      takeOut: {
        id: takeOut.id,
        riverId: takeOut.river_id ?? '',
        name: takeOut.name,
        slug: takeOut.slug,
        riverMile: parseFloat(String(segmentData.end_river_mile)),
        type: takeOut.type as AccessPointType,
        types: (takeOut.types || (takeOut.type ? [takeOut.type] : [])) as AccessPointType[],
        isPublic: takeOut.is_public ?? false,
        ownership: takeOut.ownership,
        description: takeOut.description,
        amenities: takeOut.amenities || [],
        parkingInfo: takeOut.parking_info,
        roadAccess: takeOut.road_access,
        facilities: takeOut.facilities,
        feeRequired: takeOut.fee_required ?? false,
        feeNotes: takeOut.fee_notes,
        directionsOverride: takeOut.directions_override || null,
        imageUrls: takeOut.image_urls || [],
        coordinates: {
          lng: (takeOut.location_orig as { coordinates?: number[] } | null)?.coordinates?.[0] || (takeOut.location_snap as { coordinates?: number[] } | null)?.coordinates?.[0] || 0,
          lat: (takeOut.location_orig as { coordinates?: number[] } | null)?.coordinates?.[1] || (takeOut.location_snap as { coordinates?: number[] } | null)?.coordinates?.[1] || 0,
        },
      },
      vessel: {
        id: vesselType.id,
        name: vesselType.name,
        slug: vesselType.slug,
        description: vesselType.description || '',
        icon: vesselType.icon || '',
        speeds: {
          lowWater: vesselType.speed_low_water != null ? parseFloat(String(vesselType.speed_low_water)) : 0,
          normal: vesselType.speed_normal != null ? parseFloat(String(vesselType.speed_normal)) : 0,
          highWater: vesselType.speed_high_water != null ? parseFloat(String(vesselType.speed_high_water)) : 0,
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
              ? formatFloatTimeRange(floatTimeResult.timeRange.min, floatTimeResult.timeRange.max)
              : formatFloatTime(floatTimeResult.minutes),
            speedMph: floatTimeResult.speedMph,
            movingSpeedMph: availability.readingStatus === 'current' && !condition?.accuracy_warning
              ? floatTimeResult.movingSpeedMph : null,
            isEstimate: floatTimeResult.isEstimate,
            basis: floatTimeResult.basis,
            timeRange: floatTimeResult.timeRange,
          }
        : null,
      // The reason travels with the absence. Withholding was computed above
      // but never said, so the iOS plan card had one null for two silences and
      // worded both as flood water — "Wait for it to drop", on a tailwater at
      // ordinary generation, where dropping is not the problem and waiting
      // will not help.
      floatTimeWithheldReason: withholdReason,
      // NOT COMPUTED ANY MORE. Null, kept for response shape.
      //
      // No client shows a shuttle drive figure: the routing behind it is only
      // as good as the endpoints, and most access points still have no
      // driving coordinates and route from mid-river (the web panel once
      // printed 85 mi for a 30-mile Pulltite → Cedargrove shuttle). Both apps
      // hand the shuttle to Google or Apple Maps instead. Computing it anyway
      // made every uncached plan wait on up to three Mapbox calls — two
      // geocodes and a Directions request, 10 s timeout each — for a number
      // nobody saw. /api/shuttle still serves an estimate to API callers.
      driveBack: null,
      condition: {
        availability,
        label: condition?.condition_label || 'Unknown Conditions',
        code: conditionCode,
        gaugeHeightFt: toNum(condition?.gauge_height_ft),
        dischargeCfs: toNum(condition?.discharge_cfs),
        thresholdUnit: (condition?.threshold_unit === 'cfs' ? 'cfs' : 'ft'),
        readingTimestamp: condition?.reading_timestamp,
        readingAgeHours: condition?.reading_age_hours,
        accuracyWarning: condition?.accuracy_warning || false,
        accuracyWarningReason: condition?.accuracy_warning_reason,
        gaugeName: condition?.gauge_name,
        gaugeUsgsId: condition?.gauge_usgs_id,
        // The plan summary quotes a condition; it draws no hydrograph, so the
        // stages are not resolved here. Null means "not carried on this
        // payload", and the type's doc says so.
        floodStages: null,
        flowRating,
        flowDescription,
        percentile,
        medianDischargeCfs,
        usgsUrl: condition?.gauge_usgs_id
          ? `https://waterdata.usgs.gov/monitoring-location/${condition.gauge_usgs_id}/`
          : null,
      },
      hazardsUnavailable: hazardResult.hazardsUnavailable,
      damsBelowTakeOut: routeHazards.damsBelowTakeOut,
      hazards: routeHazards.hazards.map(toHazard),
      route: {
        type: 'Feature',
        geometry: segmentData.segment_geom as GeoJSON.LineString,
        properties: {},
      },
      warnings,
    };

    return NextResponse.json<PlanResponse>({ plan }, {
      headers: plan.hazardsUnavailable ? privateNoStore() : undefined,
    });
  } catch (error) {
    if (error instanceof RouteEstimateError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Error calculating float plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/plan');
