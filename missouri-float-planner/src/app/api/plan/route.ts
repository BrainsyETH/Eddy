// src/app/api/plan/route.ts
// GET /api/plan - Calculate a float plan with segment-aware gauge selection

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDriveTime, geocodeAddress } from '@/lib/mapbox/directions';
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
        console.log('[DriveTime] Using cached data:', cached);
        driveBack = {
          minutes: Math.round(parseFloat(cached.drive_minutes)),
          miles: parseFloat(cached.drive_miles),
          formatted: formatDriveTime(Math.round(parseFloat(cached.drive_minutes))),
          routeSummary: cached.route_summary,
        };
      } else {
        // Fetch from Mapbox
        // Use directions_override if available (geocode address to coordinates)
        // Otherwise fall back to location_snap or location_orig
        let putInLng: number, putInLat: number;
        let takeOutLng: number, takeOutLat: number;

        // Geocode put-in directions override if available
        if (putIn.directions_override) {
          console.log('[DriveTime] Geocoding put-in override:', putIn.directions_override);
          const geocoded = await geocodeAddress(putIn.directions_override);
          if (geocoded) {
            [putInLng, putInLat] = geocoded;
            console.log('[DriveTime] Geocoded put-in coords:', { putInLng, putInLat });
          } else {
            const fallback = putIn.location_snap?.coordinates || putIn.location_orig?.coordinates;
            if (!fallback) throw new Error('Missing put-in coordinates');
            [putInLng, putInLat] = fallback;
            console.log('[DriveTime] Geocoding failed, using fallback put-in coords:', { putInLng, putInLat });
          }
        } else {
          const coords = putIn.location_snap?.coordinates || putIn.location_orig?.coordinates;
          if (!coords) throw new Error('Missing put-in coordinates');
          [putInLng, putInLat] = coords;
          console.log('[DriveTime] Using database put-in coords:', { putInLng, putInLat });
        }

        // Geocode take-out directions override if available
        if (takeOut.directions_override) {
          console.log('[DriveTime] Geocoding take-out override:', takeOut.directions_override);
          const geocoded = await geocodeAddress(takeOut.directions_override);
          if (geocoded) {
            [takeOutLng, takeOutLat] = geocoded;
            console.log('[DriveTime] Geocoded take-out coords:', { takeOutLng, takeOutLat });
          } else {
            const fallback = takeOut.location_snap?.coordinates || takeOut.location_orig?.coordinates;
            if (!fallback) throw new Error('Missing take-out coordinates');
            [takeOutLng, takeOutLat] = fallback;
            console.log('[DriveTime] Geocoding failed, using fallback take-out coords:', { takeOutLng, takeOutLat });
          }
        } else {
          const coords = takeOut.location_snap?.coordinates || takeOut.location_orig?.coordinates;
          if (!coords) throw new Error('Missing take-out coordinates');
          [takeOutLng, takeOutLat] = coords;
          console.log('[DriveTime] Using database take-out coords:', { takeOutLng, takeOutLat });
        }

        console.log('[DriveTime] Calling Mapbox from', { takeOutLng, takeOutLat }, 'to', { putInLng, putInLat });

        // Pass condition code to enable shorter cache for dangerous conditions
        const driveResult = await getDriveTime(
          takeOutLng,
          takeOutLat,
          putInLng,
          putInLat,
          conditionCode
        );

        console.log('[DriveTime] Mapbox result:', driveResult);

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
