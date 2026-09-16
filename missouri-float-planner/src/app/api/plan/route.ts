import { estimateRoute, RouteEstimateError } from '@/lib/calculations/route-estimate';
// src/app/api/plan/route.ts
// GET /api/plan - Calculate a float plan with segment-aware gauge selection

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDriveTime, geocodeAddress } from '@/lib/mapbox/directions';
import { assessShuttlePlausibility } from '@/lib/shuttle-plausibility';
import { formatFloatTime, formatFloatTimeRange, formatDistance, formatDriveTime } from '@/lib/calculations/floatTime';
import {
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';
import { conditionCodeToFlowRating, FLOW_DESCRIPTIONS, type FlowRating } from '@/lib/calculations/conditions';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { PlanResponse, FloatPlan, AccessPointType, HazardType, HazardSeverity } from '@/types/api';
import { withX402Route } from '@/lib/x402-config';
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
      condition, conditionCode, dailyStats, spanWarnings, floatTimeResult, withholdReason,
    } = await estimateRoute(supabase, { riverId, startId, endId, vesselTypeId });

    // Get shuttle drive time. Check drive_time_cache first (shared with
    // /api/shuttle — both model the shuttle drive take-out → put-in) so we
    // only pay for a Mapbox Directions call on cache miss.
    // Priority: directions_override (geocoded) > driving_lat/lng > location_snap > location_orig
    let driveBack: {
      minutes: number;
      miles: number;
      formatted: string;
      routeSummary: string | null;
      routeGeometry: GeoJSON.LineString | null;
    };
    try {
      // Cache writes need the service role (RLS restricts writes to admins).
      const adminSupabase = createAdminClient();

      // During high/dangerous water, roads and low bridges can close, so only
      // trust cache entries fetched within the last hour (mirrors the 1h
      // fetch revalidate that getDriveTime uses for those conditions).
      const isVolatileConditions = conditionCode === 'high' || conditionCode === 'dangerous';
      const { data: cachedDrive } = await adminSupabase
        .from('drive_time_cache')
        .select('drive_miles, drive_minutes, route_summary, route_geometry, fetched_at, expires_at')
        .eq('start_access_id', endId)
        .eq('end_access_id', startId)
        .maybeSingle();

      const cacheAgeMs = cachedDrive?.fetched_at
        ? Date.now() - new Date(cachedDrive.fetched_at).getTime()
        : Infinity;
      const cacheExpired = !cachedDrive?.expires_at
        || new Date(cachedDrive.expires_at).getTime() < Date.now();
      const cacheFresh = Boolean(
        cachedDrive
        && cachedDrive.drive_minutes != null
        && !cacheExpired
        && (!isVolatileConditions || cacheAgeMs < 60 * 60 * 1000)
      );

      if (cacheFresh && cachedDrive) {
        driveBack = {
          minutes: Number(cachedDrive.drive_minutes),
          miles: Number(cachedDrive.drive_miles ?? 0),
          formatted: formatDriveTime(Number(cachedDrive.drive_minutes)),
          routeSummary: cachedDrive.route_summary ?? null,
          routeGeometry: (cachedDrive.route_geometry as GeoJSON.LineString | null) ?? null,
        };
      } else {
      // Where a car meets the river, for each end of the float.
      //
      // Priority: directions_override (geocoded) > driving_lat/lng >
      // location_snap > location_orig. Written once rather than twice because
      // the two copies had to stay identical and the geocode is now anchored —
      // three places to keep in step is one too many.
      //
      // THE ANCHOR IS LOAD-BEARING. directions_override is free text and the
      // geocoder's `proximity` is only a soft bias, so an unchecked result is
      // whatever Mapbox ranked first anywhere in the country. Passing the
      // point's own position lets geocodeAddress reject a match that lands in
      // the wrong state — which is how a Two Rivers, MO shuttle came to be
      // cached at 1,689 miles by way of Two Rivers, WISCONSIN. A rejection
      // falls through to the coordinates we already had, which is what the
      // other 372 access points use anyway.
      const drivingCoords = async (
        point: typeof putIn,
        role: string,
      ): Promise<[number, number]> => {
        const own = (point.location_snap as { coordinates?: number[] } | null)?.coordinates
          || (point.location_orig as { coordinates?: number[] } | null)?.coordinates;

        if (point.directions_override) {
          const geocoded = await geocodeAddress(
            point.directions_override,
            own ? { lng: own[0], lat: own[1] } : null,
          );
          if (geocoded) return geocoded;
        }

        if (point.driving_lat && point.driving_lng) {
          return [parseFloat(String(point.driving_lng)), parseFloat(String(point.driving_lat))];
        }

        if (!own) throw new Error(`Missing ${role} coordinates`);
        return [own[0], own[1]];
      };

      const [putInLng, putInLat] = await drivingCoords(putIn, 'put-in');
      const [takeOutLng, takeOutLat] = await drivingCoords(takeOut, 'take-out');

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

      // Write back so /api/shuttle and future plan requests skip Mapbox.
      // Non-fatal on error (e.g. route_geometry column not yet migrated).
      const { error: cacheWriteError } = await adminSupabase
        .from('drive_time_cache')
        .upsert({
          start_access_id: endId,
          end_access_id: startId,
          drive_miles: driveResult.miles,
          drive_minutes: driveResult.minutes,
          route_summary: driveResult.routeSummary,
          route_geometry: driveResult.geometry,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, {
          onConflict: 'start_access_id,end_access_id',
        });
      if (cacheWriteError) {
        console.warn('drive_time_cache write failed:', cacheWriteError.message);
      }
      }
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
    warnings.push(...spanWarnings);
    // NOT PUSHED INTO `warnings` ANY MORE, deliberately.
    //
    // "This shuttle route looks unusually long" was a warning about a number
    // the app now declines to print — the drive time and its mileage are both
    // gone from PlanResult, because the routing behind them is only as good as
    // the endpoints, and 372 of 406 access points still have no driving
    // coordinates and route from mid-river. A caveat about a figure the reader
    // cannot see is noise at best and alarming at worst.
    //
    // The assessment itself stays, because it is the server-side smoke alarm
    // for exactly the class of breakage the geocode anchor was added to stop.
    // Logged, not shown.
    const shuttlePlausibility = assessShuttlePlausibility(driveBack.miles, distanceMiles);
    if (shuttlePlausibility.anomaly) {
      console.warn(
        `[Plan] Implausible shuttle ${putIn.name} → ${takeOut.name}: ` +
          `${driveBack.miles.toFixed(0)} road mi against ${distanceMiles.toFixed(1)} river mi.`,
      );
    }
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
        riverId: putIn.river_id ?? '',
        name: putIn.name,
        slug: putIn.slug,
        riverMile: parseFloat(segmentData.start_river_mile),
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
        riverMile: parseFloat(segmentData.end_river_mile),
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
      driveBack,
      condition: {
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
      hazards: (hazards || []).map(h => ({
        id: h.id,
        riverId: h.river_id ?? '',
        name: h.name,
        type: h.type as HazardType,
        riverMile: h.river_mile_downstream != null ? parseFloat(String(h.river_mile_downstream)) : 0,
        description: h.description,
        severity: h.severity as HazardSeverity,
        portageRequired: h.portage_required ?? false,
        portageSide: h.portage_side as 'left' | 'right' | 'either' | null,
        seasonalNotes: h.seasonal_notes,
        coordinates: {
          lng: (h.location as { coordinates?: number[] } | null)?.coordinates?.[0] || 0,
          lat: (h.location as { coordinates?: number[] } | null)?.coordinates?.[1] || 0,
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
    if (error instanceof RouteEstimateError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Error calculating float plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/plan');
