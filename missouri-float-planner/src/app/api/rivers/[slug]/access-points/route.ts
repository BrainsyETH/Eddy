// src/app/api/rivers/[slug]/access-points/route.ts
// GET /api/rivers/[slug]/access-points - Get access points for a river

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AccessPointsResponse, NPSCampgroundInfo } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Get river ID
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json(
        { error: 'River not found' },
        { status: 404 }
      );
    }

    // Get approved access points
    const { data: accessPoints, error: accessError } = await supabase
      .from('access_points')
      .select('*')
      .eq('river_id', river.id)
      .eq('approved', true)
      // Note: river_mile_downstream now represents "mile from headwaters" 
      // (mile 0.0 = headwaters, increasing downstream)
      // ascending: true = upstream to downstream (natural float direction)
      .order('river_mile_downstream', { ascending: true });

    if (accessError) {
      console.error('Error fetching access points:', accessError);
      return NextResponse.json(
        { error: 'Could not fetch access points' },
        { status: 500 }
      );
    }

    // Batch-fetch NPS campground data for linked access points
    const npsIds = (accessPoints || [])
      .map(ap => ap.nps_campground_id)
      .filter((id): id is string => !!id);

    const npsMap = new Map<string, NPSCampgroundInfo>();
    if (npsIds.length > 0) {
      const { data: campgrounds } = await supabase
        .from('nps_campgrounds')
        .select('*')
        .in('id', npsIds);

      for (const cg of campgrounds || []) {
        const amenitiesData = typeof cg.amenities === 'string'
          ? JSON.parse(cg.amenities) : cg.amenities || {};
        const feesData = typeof cg.fees === 'string'
          ? JSON.parse(cg.fees) : cg.fees || [];
        const imagesData = typeof cg.images === 'string'
          ? JSON.parse(cg.images) : cg.images || [];
        const operatingHoursData = typeof cg.operating_hours === 'string'
          ? JSON.parse(cg.operating_hours) : cg.operating_hours || [];

        npsMap.set(cg.id, {
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
        });
      }
    }

    // Filter and format access points, excluding those with invalid coordinates
    const formattedPoints = (accessPoints || [])
      .map((ap) => {
        // Use original coordinates instead of snapped until river geometry is properly imported
        // The snap coordinates are currently snapped to simplified seed geometry
        // TODO: Revert to snap-first when NHD river data is imported
        const lng =
          ap.location_orig?.coordinates?.[0] ||
          ap.location_snap?.coordinates?.[0];
        const lat =
          ap.location_orig?.coordinates?.[1] ||
          ap.location_snap?.coordinates?.[1];

        // Skip points with missing or invalid coordinates
        if (lng === undefined || lat === undefined || lng === null || lat === null) {
          console.warn(`Access point ${ap.id} (${ap.name}) has invalid coordinates, skipping`);
          return null;
        }

        // Validate coordinates are within reasonable bounds (Missouri area)
        const isValidLng = lng >= -96.5 && lng <= -88.9;
        const isValidLat = lat >= 35.9 && lat <= 40.7;
        if (!isValidLng || !isValidLat) {
          console.warn(`Access point ${ap.id} (${ap.name}) has out-of-bounds coordinates (${lng}, ${lat}), skipping`);
          return null;
        }

        return {
          id: ap.id,
          riverId: ap.river_id,
          name: ap.name,
          slug: ap.slug,
          riverMile: ap.river_mile_downstream ? parseFloat(ap.river_mile_downstream) : 0,
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
          roadSurface: ap.road_surface || [],
          parkingCapacity: ap.parking_capacity || null,
          managingAgency: ap.managing_agency || null,
          officialSiteUrl: ap.official_site_url || null,
          localTips: ap.local_tips || null,
          nearbyServices: ap.nearby_services || [],
          // NPS campground data
          npsCampground: ap.nps_campground_id
            ? npsMap.get(ap.nps_campground_id) || null
            : null,
        };
      })
      .filter((ap): ap is NonNullable<typeof ap> => ap !== null);

    const response: AccessPointsResponse = {
      accessPoints: formattedPoints,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in access points endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
