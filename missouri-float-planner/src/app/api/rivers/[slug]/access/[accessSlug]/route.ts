// src/app/api/rivers/[slug]/access/[accessSlug]/route.ts
// GET /api/rivers/[slug]/access/[accessSlug] - Get access point detail

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type {
  AccessPointDetail,
  AccessPointDetailResponse,
  NearbyAccessPoint,
  AccessPointGaugeStatus,
  NPSCampgroundInfo,
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

    // Get gauge status for this river (using access point's river mile for segment-aware selection)
    const gaugeStatus = await getGaugeStatus(supabase, river.id, currentMile);

    // Get NPS campground data if linked
    let npsCampground: NPSCampgroundInfo | null = null;
    if (ap.nps_campground_id) {
      npsCampground = await getNPSCampgroundInfo(supabase, ap.nps_campground_id);
    }

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
      npsCampground,
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

// Helper to get gauge status for the river (segment-aware based on access point river mile)
async function getGaugeStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  riverId: string,
  accessPointRiverMile: number
): Promise<AccessPointGaugeStatus | null> {
  try {
    // First, try to find the nearest gauge at or upstream of the access point
    // (largest river_mile that is <= access point's river mile)
    let riverGauge = null;

    if (accessPointRiverMile > 0) {
      const { data: nearestGauge } = await supabase
        .from('river_gauges')
        .select(
          `
          gauge_station_id,
          is_primary,
          river_mile,
          threshold_unit,
          level_too_low,
          level_low,
          level_optimal_min,
          level_optimal_max,
          level_high,
          level_dangerous,
          gauge_stations (
            id,
            usgs_site_id,
            name
          )
        `
        )
        .eq('river_id', riverId)
        .not('river_mile', 'is', null)
        .lte('river_mile', accessPointRiverMile)
        .order('river_mile', { ascending: false })
        .limit(1)
        .single();

      if (nearestGauge) {
        riverGauge = nearestGauge;
      }
    }

    // Fall back to primary gauge if no segment-specific gauge found
    if (!riverGauge) {
      const { data: primaryGauge } = await supabase
        .from('river_gauges')
        .select(
          `
          gauge_station_id,
          is_primary,
          river_mile,
          threshold_unit,
          level_too_low,
          level_low,
          level_optimal_min,
          level_optimal_max,
          level_high,
          level_dangerous,
          gauge_stations (
            id,
            usgs_site_id,
            name
          )
        `
        )
        .eq('river_id', riverId)
        .eq('is_primary', true)
        .single();

      riverGauge = primaryGauge;
    }

    if (!riverGauge || !riverGauge.gauge_stations) {
      return null;
    }

    // Supabase returns joined relations - handle both array and single object cases
    const gaugeData = riverGauge.gauge_stations;
    const gauge = (Array.isArray(gaugeData) ? gaugeData[0] : gaugeData) as {
      id: string;
      usgs_site_id: string;
      name: string;
    } | undefined;

    if (!gauge) {
      return null;
    }

    // Fetch the latest reading for this gauge from gauge_readings
    const { data: latestReading } = await supabase
      .from('gauge_readings')
      .select('gauge_height_ft, discharge_cfs, reading_timestamp')
      .eq('gauge_station_id', gauge.id)
      .order('reading_timestamp', { ascending: false })
      .limit(1)
      .single();

    const heightFt = latestReading?.gauge_height_ft ?? null;
    const cfs = latestReading?.discharge_cfs ?? null;

    // Use computeCondition for consistent condition evaluation
    const thresholds: ConditionThresholds = {
      levelTooLow: riverGauge.level_too_low,
      levelLow: riverGauge.level_low,
      levelOptimalMin: riverGauge.level_optimal_min,
      levelOptimalMax: riverGauge.level_optimal_max,
      levelHigh: riverGauge.level_high,
      levelDangerous: riverGauge.level_dangerous,
      thresholdUnit: (riverGauge.threshold_unit || 'ft') as 'ft' | 'cfs',
    };

    const condition = computeCondition(heightFt, thresholds, cfs);

    return {
      level: condition.code,
      cfs,
      heightFt,
      label: getConditionShortLabel(condition.code),
      trend: null,
      lastUpdated: latestReading?.reading_timestamp ?? null,
      gaugeId: gauge.id,
      gaugeName: gauge.name,
      usgsId: gauge.usgs_site_id,
    };
  } catch (error) {
    console.error('Error fetching gauge status:', error);
    return null;
  }
}

// Helper to get NPS campground info for an access point
async function getNPSCampgroundInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  npsCampgroundId: string
): Promise<NPSCampgroundInfo | null> {
  try {
    const { data: cg, error } = await supabase
      .from('nps_campgrounds')
      .select('*')
      .eq('id', npsCampgroundId)
      .single();

    if (error || !cg) return null;

    const amenitiesData = typeof cg.amenities === 'string'
      ? JSON.parse(cg.amenities)
      : cg.amenities || {};

    const feesData = typeof cg.fees === 'string'
      ? JSON.parse(cg.fees)
      : cg.fees || [];

    const imagesData = typeof cg.images === 'string'
      ? JSON.parse(cg.images)
      : cg.images || [];

    const operatingHoursData = typeof cg.operating_hours === 'string'
      ? JSON.parse(cg.operating_hours)
      : cg.operating_hours || [];

    return {
      npsId: cg.nps_id,
      name: cg.name,
      npsUrl: cg.nps_url,
      reservationInfo: cg.reservation_info,
      reservationUrl: cg.reservation_url,
      fees: feesData.map((f: { cost?: string; description?: string; title?: string }) => ({
        cost: f.cost || '0.00',
        description: f.description || '',
        title: f.title || 'Camping Fee',
      })),
      totalSites: cg.total_sites || 0,
      sitesReservable: cg.sites_reservable || 0,
      sitesFirstCome: cg.sites_first_come || 0,
      sitesGroup: cg.sites_group || 0,
      sitesTentOnly: cg.sites_tent_only || 0,
      sitesElectrical: cg.sites_electrical || 0,
      sitesRvOnly: cg.sites_rv_only || 0,
      sitesWalkBoatTo: cg.sites_walk_boat_to || 0,
      amenities: {
        toilets: amenitiesData.toilets || [],
        showers: amenitiesData.showers || [],
        cellPhoneReception: amenitiesData.cellPhoneReception || 'Unknown',
        potableWater: amenitiesData.potableWater || [],
        campStore: amenitiesData.campStore || 'No',
        firewoodForSale: amenitiesData.firewoodForSale || 'No',
        dumpStation: amenitiesData.dumpStation || 'No',
        trashCollection: amenitiesData.trashRecyclingCollection || 'Unknown',
      },
      operatingHours: operatingHoursData.map((oh: { description?: string; name?: string }) => ({
        description: oh.description || '',
        name: oh.name || '',
      })),
      classification: cg.classification,
      weatherOverview: cg.weather_overview,
      images: imagesData,
    };
  } catch (error) {
    console.error('Error fetching NPS campground info:', error);
    return null;
  }
}
