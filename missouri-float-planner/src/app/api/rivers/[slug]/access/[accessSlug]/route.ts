// src/app/api/rivers/[slug]/access/[accessSlug]/route.ts
// GET /api/rivers/[slug]/access/[accessSlug] - Get access point detail

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  AccessPointDetail,
  AccessPointDetailResponse,
  NearbyAccessPoint,
  AccessPointGaugeStatus,
  RoadSurface,
  ManagingAgency,
  ParkingCapacity,
  NearbyService,
} from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; accessSlug: string }> }
) {
  try {
    const { slug: riverSlug, accessSlug } = await params;
    const supabase = await createClient();

    // Get river info
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, name, slug')
      .eq('slug', riverSlug)
      .single();

    if (riverError || !river) {
      return NextResponse.json(
        { error: 'River not found' },
        { status: 404 }
      );
    }

    // Get access point with all detail fields
    const { data: ap, error: apError } = await supabase
      .from('access_points')
      .select('*')
      .eq('river_id', river.id)
      .eq('slug', accessSlug)
      .eq('approved', true)
      .single();

    if (apError || !ap) {
      return NextResponse.json(
        { error: 'Access point not found' },
        { status: 404 }
      );
    }

    // Extract coordinates
    const lng =
      ap.location_orig?.coordinates?.[0] ||
      ap.location_snap?.coordinates?.[0];
    const lat =
      ap.location_orig?.coordinates?.[1] ||
      ap.location_snap?.coordinates?.[1];

    if (!lng || !lat) {
      return NextResponse.json(
        { error: 'Access point has invalid coordinates' },
        { status: 500 }
      );
    }

    // Get nearby access points (upstream and downstream)
    const { data: allAccessPoints } = await supabase
      .from('access_points')
      .select('id, name, slug, river_mile_downstream')
      .eq('river_id', river.id)
      .eq('approved', true)
      .order('river_mile_downstream', { ascending: true });

    const currentMile = ap.river_mile_downstream
      ? parseFloat(ap.river_mile_downstream)
      : 0;

    const nearbyAccessPoints: NearbyAccessPoint[] = [];

    if (allAccessPoints) {
      // Find upstream (lower river mile = closer to headwaters)
      const upstream = allAccessPoints
        .filter(
          (p) =>
            p.id !== ap.id &&
            p.river_mile_downstream &&
            parseFloat(p.river_mile_downstream) < currentMile
        )
        .sort(
          (a, b) =>
            parseFloat(b.river_mile_downstream!) -
            parseFloat(a.river_mile_downstream!)
        )[0];

      // Find downstream (higher river mile = further from headwaters)
      const downstream = allAccessPoints
        .filter(
          (p) =>
            p.id !== ap.id &&
            p.river_mile_downstream &&
            parseFloat(p.river_mile_downstream) > currentMile
        )
        .sort(
          (a, b) =>
            parseFloat(a.river_mile_downstream!) -
            parseFloat(b.river_mile_downstream!)
        )[0];

      if (upstream) {
        const distance = currentMile - parseFloat(upstream.river_mile_downstream!);
        nearbyAccessPoints.push({
          id: upstream.id,
          name: upstream.name,
          slug: upstream.slug,
          direction: 'upstream',
          distanceMiles: Math.round(distance * 10) / 10,
          estimatedFloatTime: estimateFloatTime(distance),
          riverMile: parseFloat(upstream.river_mile_downstream!),
        });
      }

      if (downstream) {
        const distance = parseFloat(downstream.river_mile_downstream!) - currentMile;
        nearbyAccessPoints.push({
          id: downstream.id,
          name: downstream.name,
          slug: downstream.slug,
          direction: 'downstream',
          distanceMiles: Math.round(distance * 10) / 10,
          estimatedFloatTime: estimateFloatTime(distance),
          riverMile: parseFloat(downstream.river_mile_downstream!),
        });
      }
    }

    // Get gauge status for this river/access point
    const gaugeStatus = await getGaugeStatus(supabase, river.id, ap.id);

    // Format the access point detail
    const accessPoint: AccessPointDetail = {
      id: ap.id,
      riverId: ap.river_id,
      name: ap.name,
      slug: ap.slug,
      riverMile: currentMile,
      type: ap.type,
      types: ap.types || (ap.type ? [ap.type] : []),
      isPublic: ap.is_public,
      ownership: ap.ownership,
      description: ap.description,
      amenities: ap.amenities || [],
      parkingInfo: ap.parking_info,
      roadAccess: ap.road_access,
      facilities: ap.facilities,
      feeRequired: ap.fee_required,
      feeNotes: ap.fee_notes,
      directionsOverride: ap.directions_override,
      imageUrls: ap.image_urls || [],
      googleMapsUrl: ap.google_maps_url,
      coordinates: { lng, lat },
      // New detail fields
      roadSurface: (ap.road_surface as RoadSurface[]) || [],
      parkingCapacity: ap.parking_capacity as ParkingCapacity | null,
      managingAgency: ap.managing_agency as ManagingAgency | null,
      officialSiteUrl: ap.official_site_url,
      localTips: ap.local_tips,
      nearbyServices: (ap.nearby_services as NearbyService[]) || [],
      drivingLat: ap.driving_lat ? parseFloat(ap.driving_lat) : null,
      drivingLng: ap.driving_lng ? parseFloat(ap.driving_lng) : null,
      river: {
        id: river.id,
        name: river.name,
        slug: river.slug,
      },
    };

    const response: AccessPointDetailResponse = {
      accessPoint,
      nearbyAccessPoints,
      gaugeStatus,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in access point detail endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper to estimate float time based on distance
function estimateFloatTime(miles: number): string | null {
  if (miles <= 0) return null;
  // Assume average 2 mph float speed
  const hours = miles / 2;
  if (hours < 1) {
    return `~${Math.round(hours * 60)} min`;
  }
  return `~${Math.round(hours * 10) / 10} hr`;
}

// Helper to get gauge status for the access point
async function getGaugeStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  riverId: string,
  _accessPointId: string // Reserved for future: find nearest gauge to access point
): Promise<AccessPointGaugeStatus | null> {
  try {
    // Get the primary gauge for this river
    const { data: riverGauge } = await supabase
      .from('river_gauges')
      .select(
        `
        gauge_station_id,
        is_primary,
        too_low_below,
        low_below,
        optimal_min,
        optimal_max,
        high_above,
        dangerous_above,
        gauge_stations (
          id,
          usgs_site_id,
          name,
          latest_reading_cfs,
          latest_reading_height_ft,
          latest_reading_at
        )
      `
      )
      .eq('river_id', riverId)
      .eq('is_primary', true)
      .single();

    if (!riverGauge || !riverGauge.gauge_stations) {
      return null;
    }

    const gauge = riverGauge.gauge_stations as {
      id: string;
      usgs_site_id: string;
      name: string;
      latest_reading_cfs: number | null;
      latest_reading_height_ft: number | null;
      latest_reading_at: string | null;
    };

    const cfs = gauge.latest_reading_cfs;

    // Determine level based on thresholds
    let level: AccessPointGaugeStatus['level'] = 'unknown';
    let label = 'Unknown conditions';

    if (cfs !== null) {
      if (riverGauge.dangerous_above && cfs >= riverGauge.dangerous_above) {
        level = 'flood';
        label = 'Flood stage - Do not float';
      } else if (riverGauge.high_above && cfs >= riverGauge.high_above) {
        level = 'high';
        label = 'High water - Use caution';
      } else if (
        riverGauge.optimal_min &&
        riverGauge.optimal_max &&
        cfs >= riverGauge.optimal_min &&
        cfs <= riverGauge.optimal_max
      ) {
        level = 'optimal';
        label = 'Optimal for floating';
      } else if (riverGauge.low_below && cfs <= riverGauge.low_below) {
        level = 'low';
        label = 'Low water - Expect to walk';
      } else if (riverGauge.too_low_below && cfs <= riverGauge.too_low_below) {
        level = 'too_low';
        label = 'Too low to float';
      } else if (riverGauge.optimal_min && cfs < riverGauge.optimal_min) {
        level = 'low';
        label = 'Below optimal';
      } else if (riverGauge.optimal_max && cfs > riverGauge.optimal_max) {
        level = 'high';
        label = 'Above optimal';
      }
    }

    return {
      level,
      cfs,
      heightFt: gauge.latest_reading_height_ft,
      label,
      trend: null, // TODO: Calculate trend from historical data
      lastUpdated: gauge.latest_reading_at,
      gaugeId: gauge.id,
      gaugeName: gauge.name,
      usgsId: gauge.usgs_site_id,
    };
  } catch (error) {
    console.error('Error fetching gauge status:', error);
    return null;
  }
}
