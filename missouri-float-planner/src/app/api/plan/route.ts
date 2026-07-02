// src/app/api/plan/route.ts
// GET /api/plan - Calculate a float plan with segment-aware gauge selection

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDriveTime, geocodeAddress } from '@/lib/mapbox/directions';
import { calculateFloatTime, formatFloatTime, formatFloatTimeRange, formatDistance, formatDriveTime } from '@/lib/calculations/floatTime';
import {
  fetchGaugeReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';
import { computeConditionFromDbRow } from '@/lib/conditions';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { conditionCodeToFlowRating, FLOW_DESCRIPTIONS, type FlowRating } from '@/lib/calculations/conditions';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { PlanResponse, FloatPlan, AccessPointType, HazardType, HazardSeverity, ConditionCode } from '@/types/api';
import { withX402Route } from '@/lib/x402-config';
import { toNum } from '@/lib/utils/num';

// Reading age beyond which we surface an accuracy warning (mirrors the DB RPC).
const STALE_READING_HOURS = 6;

// Published float times in float_segments assume NORMAL flow. Never serve them raw:
// scale by the current condition so low water doesn't advertise a normal-flow time
// (the stranded-after-dark failure mode). Mirrors the calculator's band multipliers;
// superseded by the flow-factor model once per-segment calibration lands.
function scaleKnownTimeForCondition(minutes: number, code: ConditionCode): number {
  const factor =
    code === 'too_low' ? 2.0 :
    code === 'low' ? 1.33 :
    code === 'high' ? 0.85 :
    1.0; // good / flowing / unknown → published normal-flow time
  return Math.round(minutes * factor);
}

// Force dynamic rendering (uses cookies and searchParams)
export const dynamic = 'force-dynamic';

async function _GET(request: NextRequest) {
  try {
    // Rate limit: 30 plan calculations per IP per minute
    // Each request can trigger multiple external API calls (USGS, Mapbox)
    const rateLimitResult = rateLimit(`plan:${getClientIp(request)}`, 30, 60 * 1000);
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
    const distanceMiles = segmentData.distance_miles != null ? parseFloat(segmentData.distance_miles) : NaN;
    const putInMile = segmentData.start_river_mile != null ? parseFloat(segmentData.start_river_mile) : NaN;

    if (isNaN(distanceMiles) || distanceMiles <= 0) {
      return NextResponse.json(
        { error: 'Could not calculate distance between access points' },
        { status: 500 }
      );
    }

    // Get put-in coordinates for segment-aware gauge selection (fallback)
    // Use location_orig first — location_snap is snapped to simplified seed geometry
    const putInCoords = (putIn.location_orig as { coordinates?: number[] } | null)?.coordinates
      || (putIn.location_snap as { coordinates?: number[] } | null)?.coordinates;

    // Get river condition using position-based gauge selection
    // Logic: Use gauge at or upstream of put-in mile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conditionData } = await (supabase.rpc as any)('get_river_condition_segment', {
      p_river_id: riverId,
      p_put_in_mile: putInMile,
      p_put_in_point: putInCoords
        ? `SRID=4326;POINT(${putInCoords[0]} ${putInCoords[1]})`
        : null,
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
              threshold_unit,
              gauge_stations!inner (usgs_site_id)
            `)
            .eq('river_id', riverId)
            .eq('gauge_stations.usgs_site_id', gaugeUsgsSiteId)
            .limit(1)
            .maybeSingle();

          if (gaugeThresholds) {
            // Thread threshold_unit + discharge so stage/CFS are never conflated (F7).
            const computed = computeConditionFromDbRow(
              usgsReading.gaugeHeightFt,
              gaugeThresholds,
              usgsReading.dischargeCfs
            );

            const readingAgeHours = usgsReading.readingTimestamp
              ? (Date.now() - new Date(usgsReading.readingTimestamp).getTime()) / (1000 * 60 * 60)
              : null;
            const stale = readingAgeHours != null && readingAgeHours > STALE_READING_HOURS;
            const qual = classifyQualifiers(usgsReading.qualifiers);

            // Update condition with live USGS data
            condition = {
              ...condition,
              condition_label: computed.label,
              condition_code: computed.code,
              gauge_height_ft: usgsReading.gaugeHeightFt,
              discharge_cfs: usgsReading.dischargeCfs,
              reading_timestamp: usgsReading.readingTimestamp,
              reading_age_hours: readingAgeHours,
              accuracy_warning: stale || qual.suspect,
              accuracy_warning_reason: qual.suspect
                ? qual.note
                : stale ? `Reading is ${Math.round(readingAgeHours!)} hours old` : null,
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
            threshold_unit,
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
              const computed = computeConditionFromDbRow(
                usgsReading.gaugeHeightFt,
                primaryGauge,
                usgsReading.dischargeCfs
              );

              const readingAgeHours = usgsReading.readingTimestamp
                ? (Date.now() - new Date(usgsReading.readingTimestamp).getTime()) / (1000 * 60 * 60)
                : null;
              const stale = readingAgeHours != null && readingAgeHours > STALE_READING_HOURS;
              const qual = classifyQualifiers(usgsReading.qualifiers);

              condition = {
                condition_label: computed.label,
                condition_code: computed.code,
                gauge_height_ft: usgsReading.gaugeHeightFt,
                discharge_cfs: usgsReading.dischargeCfs,
                reading_timestamp: usgsReading.readingTimestamp,
                reading_age_hours: readingAgeHours,
                gauge_name: gaugeStation?.name,
                gauge_usgs_id: usgsSiteId,
                accuracy_warning: stale || qual.suspect,
                accuracy_warning_reason: qual.suspect
                  ? qual.note
                  : stale ? `Reading is ${Math.round(readingAgeHours!)} hours old` : null,
              };
              conditionCode = computed.code;
            }
          }
        }
      }
    }

    // --- Within-span multi-gauge check (gauge-to-segment representativeness) ---
    // The anchor gauge sits at/upstream of the put-in, but a long float can pass
    // other gauges reading very different water (tributaries and big springs add
    // flow between gauges). If another gauge INSIDE the float span classifies
    // worse than the anchor (high/dangerous), the trip passes through that water:
    // escalate the condition. A too-low in-span gauge gets a scraping warning.
    const spanWarnings: string[] = [];
    try {
      const spanMinMile = Math.min(parseFloat(segmentData.start_river_mile), parseFloat(segmentData.end_river_mile));
      const spanMaxMile = Math.max(parseFloat(segmentData.start_river_mile), parseFloat(segmentData.end_river_mile));

      const { data: riverGaugeRows } = await supabase
        .from('river_gauges')
        .select(`
          level_too_low, level_low, level_optimal_min, level_optimal_max,
          level_high, level_dangerous, threshold_unit, river_mile,
          gauge_stations!inner (id, name, usgs_site_id, active)
        `)
        .eq('river_id', riverId)
        .not('river_mile', 'is', null);

      const inSpanGauges = (riverGaugeRows || [])
        .map((g) => ({
          row: g,
          mile: toNum(g.river_mile),
          station: Array.isArray(g.gauge_stations) ? g.gauge_stations[0] : g.gauge_stations,
        }))
        .filter(({ mile, station }) =>
          mile != null && mile >= spanMinMile && mile <= spanMaxMile &&
          station?.active &&
          station?.usgs_site_id !== condition?.gauge_usgs_id
        );

      if (inSpanGauges.length > 0) {
        const latestReadings = await Promise.all(
          inSpanGauges.map(({ station }) =>
            supabase
              .from('gauge_readings')
              .select('gauge_height_ft, discharge_cfs, reading_timestamp')
              .eq('gauge_station_id', station.id)
              .order('reading_timestamp', { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        );

        const SEVERITY_RANK: Record<string, number> = { high: 1, dangerous: 2 };
        for (let i = 0; i < inSpanGauges.length; i++) {
          const { row, station, mile } = inSpanGauges[i];
          const reading = latestReadings[i]?.data;
          if (!reading) continue;
          const ageHours = reading.reading_timestamp
            ? (Date.now() - new Date(reading.reading_timestamp).getTime()) / (1000 * 60 * 60)
            : Infinity;
          if (ageHours > 12) continue; // never escalate off stale data

          const spanCondition = computeConditionFromDbRow(
            toNum(reading.gauge_height_ft),
            row,
            toNum(reading.discharge_cfs)
          );

          if ((SEVERITY_RANK[spanCondition.code] ?? 0) > (SEVERITY_RANK[conditionCode] ?? 0)) {
            conditionCode = spanCondition.code as ConditionCode;
            condition = {
              ...condition,
              condition_code: spanCondition.code,
              condition_label: spanCondition.label,
            };
            spanWarnings.push(
              `${station.name} (mile ${mile}) reads "${spanCondition.label}" within this float — conditions reflect the worst gauge on your route`
            );
          } else if (spanCondition.code === 'too_low' && conditionCode !== 'too_low' && conditionCode !== 'unknown') {
            spanWarnings.push(
              `${station.name} (mile ${mile}) reads very low — expect dragging on that stretch`
            );
          }
        }
      }
    } catch (spanError) {
      console.warn('Span gauge check failed (non-fatal):', spanError);
    }

    // Fetch daily discharge statistics once. Used as the reference flow (Q_ref) for
    // the flow-dependent speed model, and reused for the supplementary percentile below.
    let dailyStats: Awaited<ReturnType<typeof fetchDailyStatistics>> = null;
    if (condition?.gauge_usgs_id) {
      try {
        dailyStats = await fetchDailyStatistics(condition.gauge_usgs_id);
      } catch (statsError) {
        console.warn('Failed to fetch statistics for plan:', statsError);
      }
    }
    const refCfs = dailyStats?.p50 ?? null;
    const dischargeCfs = toNum(condition?.discharge_cfs);

    const speedLowWater = vesselType.speed_low_water != null ? parseFloat(String(vesselType.speed_low_water)) : 0;
    const speedNormal = vesselType.speed_normal != null ? parseFloat(String(vesselType.speed_normal)) : 0;
    const speedHighWater = vesselType.speed_high_water != null ? parseFloat(String(vesselType.speed_high_water)) : 0;

    // Try to get known float time from float_segments table first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: segmentTime } = await (supabase.rpc as any)('get_segment_float_time', {
      p_put_in_id: startId,
      p_take_out_id: endId,
      p_vessel_type: vesselType.slug,
    });

    let floatTimeResult: {
      minutes: number;
      speedMph: number;
      isEstimate: boolean;
      basis: 'trip' | 'moving';
      timeRange?: { min: number; max: number };
    } | null = null;

    // Dangerous water gets NO float time (neither known nor estimated).
    const isDangerous = conditionCode === 'dangerous';

    if (!isDangerous && segmentTime && segmentTime.length > 0 && segmentTime[0].time_avg_minutes) {
      // Known, published (trip-basis) times — scale by current flow, never serve raw.
      const st = segmentTime[0];
      const avg = scaleKnownTimeForCondition(st.time_avg_minutes, conditionCode);
      const rMin = st.time_min_minutes ? scaleKnownTimeForCondition(st.time_min_minutes, conditionCode) : undefined;
      const rMax = st.time_max_minutes ? scaleKnownTimeForCondition(st.time_max_minutes, conditionCode) : undefined;
      floatTimeResult = {
        minutes: avg,
        speedMph: avg > 0 ? distanceMiles / (avg / 60) : 0,
        isEstimate: false,
        basis: 'trip',
        timeRange: rMin != null && rMax != null ? { min: rMin, max: rMax } : undefined,
      };
    } else if (!isDangerous) {
      // Flow-dependent estimate (falls back to the condition-band step if no discharge).
      const calcResult = calculateFloatTime(
        distanceMiles,
        { speedLowWater, speedNormal, speedHighWater },
        conditionCode,
        { dischargeCfs, refCfs, basis: 'trip' }
      );

      if (calcResult) {
        floatTimeResult = {
          minutes: calcResult.minutes,
          speedMph: calcResult.speedMph,
          isEstimate: true,
          basis: calcResult.basis,
          timeRange: { min: calcResult.minMinutes, max: calcResult.maxMinutes },
        };
      }
    }

    // Get shuttle drive time using Mapbox Directions API
    // Priority: directions_override (geocoded) > driving_lat/lng > location_snap > location_orig
    let driveBack: {
      minutes: number;
      miles: number;
      formatted: string;
      routeSummary: string | null;
      routeGeometry: GeoJSON.LineString | null;
    };
    try {
      // Get put-in driving coordinates
      // Priority: directions_override (geocode) > driving_lat/lng > location_snap > location_orig
      let putInLng: number, putInLat: number;
      if (putIn.directions_override) {
        const geocoded = await geocodeAddress(putIn.directions_override);
        if (geocoded) {
          [putInLng, putInLat] = geocoded;
        } else if (putIn.driving_lat && putIn.driving_lng) {
          putInLng = parseFloat(String(putIn.driving_lng));
          putInLat = parseFloat(String(putIn.driving_lat));
        } else {
          const coords = (putIn.location_snap as { coordinates?: number[] } | null)?.coordinates || (putIn.location_orig as { coordinates?: number[] } | null)?.coordinates;
          if (!coords) throw new Error('Missing put-in coordinates');
          [putInLng, putInLat] = coords;
        }
      } else if (putIn.driving_lat && putIn.driving_lng) {
        putInLng = parseFloat(String(putIn.driving_lng));
        putInLat = parseFloat(String(putIn.driving_lat));
      } else {
        const coords = (putIn.location_snap as { coordinates?: number[] } | null)?.coordinates || (putIn.location_orig as { coordinates?: number[] } | null)?.coordinates;
        if (!coords) throw new Error('Missing put-in coordinates');
        [putInLng, putInLat] = coords;
      }

      // Get take-out driving coordinates
      // Priority: directions_override (geocode) > driving_lat/lng > location_snap > location_orig
      let takeOutLng: number, takeOutLat: number;
      if (takeOut.directions_override) {
        const geocoded = await geocodeAddress(takeOut.directions_override);
        if (geocoded) {
          [takeOutLng, takeOutLat] = geocoded;
        } else if (takeOut.driving_lat && takeOut.driving_lng) {
          takeOutLng = parseFloat(String(takeOut.driving_lng));
          takeOutLat = parseFloat(String(takeOut.driving_lat));
        } else {
          const coords = (takeOut.location_snap as { coordinates?: number[] } | null)?.coordinates || (takeOut.location_orig as { coordinates?: number[] } | null)?.coordinates;
          if (!coords) throw new Error('Missing take-out coordinates');
          [takeOutLng, takeOutLat] = coords;
        }
      } else if (takeOut.driving_lat && takeOut.driving_lng) {
        takeOutLng = parseFloat(String(takeOut.driving_lng));
        takeOutLat = parseFloat(String(takeOut.driving_lat));
      } else {
        const coords = (takeOut.location_snap as { coordinates?: number[] } | null)?.coordinates || (takeOut.location_orig as { coordinates?: number[] } | null)?.coordinates;
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
      driveBack,
      condition: {
        label: condition?.condition_label || 'Unknown Conditions',
        code: conditionCode,
        gaugeHeightFt: toNum(condition?.gauge_height_ft),
        dischargeCfs: toNum(condition?.discharge_cfs),
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
    console.error('Error calculating float plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '$0.02', 'Float plan data');
