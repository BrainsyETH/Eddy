// src/app/api/plan/route.ts
// GET /api/plan - Calculate a float plan with segment-aware gauge selection

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDriveTime } from '@/lib/mapbox/directions';
import { calculateFloatTime, formatFloatTime, formatDistance, formatDriveTime } from '@/lib/calculations/floatTime';
import type { PlanResponse, FloatPlan, AccessPointType, HazardType, HazardSeverity, ConditionCode } from '@/types/api';

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

    // Get put-in coordinates for segment-aware gauge selection
    const putInCoords = putIn.location_snap?.coordinates || putIn.location_orig?.coordinates;
    
    // Get river condition using segment-aware gauge selection
    // This selects the gauge nearest to the put-in point instead of relying on is_primary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conditionData } = await (supabase.rpc as any)('get_river_condition_segment', {
      p_river_id: riverId,
      p_put_in_point: putInCoords 
        ? `SRID=4326;POINT(${putInCoords[0]} ${putInCoords[1]})`
        : null,
    });

    const condition = conditionData?.[0];
    const conditionCode: ConditionCode = condition?.condition_code || 'unknown';

    // Calculate float time
    const floatTimeResult = calculateFloatTime(
      distanceMiles,
      {
        speedLowWater: parseFloat(vesselType.speed_low_water),
        speedNormal: parseFloat(vesselType.speed_normal),
        speedHighWater: parseFloat(vesselType.speed_high_water),
      },
      conditionCode
    );

    // Get drive time (with caching)
    let driveBack;
    try {
      // Check cache first
      const { data: cached } = await supabase
        .from('drive_time_cache')
        .select('*')
        .eq('start_access_id', endId) // Take-out to put-in
        .eq('end_access_id', startId)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cached) {
        driveBack = {
          minutes: Math.round(parseFloat(cached.drive_minutes)),
          miles: parseFloat(cached.drive_miles),
          formatted: formatDriveTime(Math.round(parseFloat(cached.drive_minutes))),
          routeSummary: cached.route_summary,
        };
      } else {
        // Fetch from Mapbox
        const putInCoordsForDrive = putIn.location_snap?.coordinates || putIn.location_orig?.coordinates;
        const takeOutCoords = takeOut.location_snap?.coordinates || takeOut.location_orig?.coordinates;

        if (!putInCoordsForDrive || !takeOutCoords) {
          throw new Error('Missing coordinates');
        }

        const [putInLng, putInLat] = putInCoordsForDrive;
        const [takeOutLng, takeOutLat] = takeOutCoords;

        // Pass condition code to enable shorter cache for dangerous conditions
        const driveResult = await getDriveTime(
          takeOutLng,
          takeOutLat,
          putInLng,
          putInLat,
          conditionCode
        );

        // Cache the result
        await supabase.from('drive_time_cache').upsert({
          start_access_id: endId,
          end_access_id: startId,
          drive_minutes: driveResult.minutes,
          drive_miles: driveResult.miles,
          route_summary: driveResult.routeSummary,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        });

        driveBack = {
          minutes: driveResult.minutes,
          miles: driveResult.miles,
          formatted: formatDriveTime(driveResult.minutes),
          routeSummary: driveResult.routeSummary,
        };
      }
    } catch (error) {
      console.error('Error calculating drive time:', error);
      // Fallback to estimated drive time
      driveBack = {
        minutes: 0,
        miles: 0,
        formatted: 'Unknown',
        routeSummary: null,
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
            formatted: formatFloatTime(floatTimeResult.minutes),
            speedMph: floatTimeResult.speedMph,
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
