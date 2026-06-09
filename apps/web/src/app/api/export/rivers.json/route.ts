// GET /api/export/rivers.json
// Comprehensive JSON export of all public river data for RAG pipelines and data consumers.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // Cache for 24 hours

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all active rivers
    const { data: rivers, error: riversError } = await supabase
      .from('rivers')
      .select('id, name, slug, length_miles, description, difficulty_rating, region')
      .eq('active', true)
      .order('name');

    if (riversError || !rivers) {
      return NextResponse.json({ error: 'Failed to fetch rivers' }, { status: 500 });
    }

    // Fetch all data in parallel
    const [
      { data: accessPoints },
      { data: hazards },
      { data: gaugeStations },
      { data: pois },
      { data: vesselTypes },
    ] = await Promise.all([
      supabase
        .from('access_points')
        .select('id, river_id, name, slug, river_mile_downstream, type, types, is_public, ownership, description, amenities, parking_info, road_access, facilities, fee_required, fee_notes, location_snap, location_orig, road_surface, parking_capacity, managing_agency')
        .eq('approved', true)
        .order('river_mile_downstream'),
      supabase
        .from('river_hazards')
        .select('id, river_id, name, type, river_mile_downstream, description, severity, portage_required, portage_side, active, seasonal_notes, location')
        .eq('active', true),
      supabase
        .from('gauge_stations')
        .select('id, usgs_site_id, name, location, active')
        .eq('active', true),
      supabase
        .from('points_of_interest')
        .select('id, river_id, name, slug, description, type, latitude, longitude, river_mile, amenities')
        .eq('active', true),
      supabase
        .from('vessel_types')
        .select('id, name, slug, description, icon, speed_low_water, speed_normal, speed_high_water, sort_order')
        .order('sort_order'),
    ]);

    // Build river-centric export
    const riverExport = rivers.map((river) => {
      const riverAccessPoints = (accessPoints || [])
        .filter((ap) => ap.river_id === river.id)
        .map((ap) => {
          const lng = ap.location_snap?.coordinates?.[0] || ap.location_orig?.coordinates?.[0];
          const lat = ap.location_snap?.coordinates?.[1] || ap.location_orig?.coordinates?.[1];
          return {
            id: ap.id,
            name: ap.name,
            slug: ap.slug,
            riverMile: ap.river_mile_downstream ? parseFloat(ap.river_mile_downstream) : null,
            type: ap.type,
            types: ap.types || [],
            isPublic: ap.is_public,
            ownership: ap.ownership,
            description: ap.description,
            amenities: ap.amenities || [],
            parkingInfo: ap.parking_info,
            roadAccess: ap.road_access,
            facilities: ap.facilities,
            feeRequired: ap.fee_required,
            feeNotes: ap.fee_notes,
            coordinates: lat && lng ? { lat, lng } : null,
            roadSurface: ap.road_surface || [],
            parkingCapacity: ap.parking_capacity,
            managingAgency: ap.managing_agency,
          };
        });

      const riverHazards = (hazards || [])
        .filter((h) => h.river_id === river.id)
        .map((h) => ({
          id: h.id,
          name: h.name,
          type: h.type,
          riverMile: h.river_mile_downstream ? parseFloat(h.river_mile_downstream) : null,
          description: h.description,
          severity: h.severity,
          portageRequired: h.portage_required,
          portageSide: h.portage_side,
          seasonalNotes: h.seasonal_notes,
          coordinates: h.location?.coordinates
            ? { lat: h.location.coordinates[1], lng: h.location.coordinates[0] }
            : null,
        }));

      const riverPois = (pois || [])
        .filter((p) => p.river_id === river.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          type: p.type,
          riverMile: p.river_mile ? parseFloat(String(p.river_mile)) : null,
          coordinates:
            p.latitude && p.longitude
              ? { lat: parseFloat(String(p.latitude)), lng: parseFloat(String(p.longitude)) }
              : null,
          amenities: p.amenities || [],
        }));

      return {
        id: river.id,
        name: river.name,
        slug: river.slug,
        lengthMiles: river.length_miles ? parseFloat(river.length_miles) : null,
        description: river.description,
        difficultyRating: river.difficulty_rating,
        region: river.region,
        accessPoints: riverAccessPoints,
        hazards: riverHazards,
        pointsOfInterest: riverPois,
      };
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      source: 'https://eddy.guide',
      description:
        'Comprehensive export of Missouri Ozarks float trip data from Eddy. Includes rivers, access points, hazards, points of interest, gauge stations, and vessel types.',
      license: 'Data provided by eddy.guide. Please attribute when using this data.',
      rivers: riverExport,
      gaugeStations: (gaugeStations || []).map((g) => ({
        id: g.id,
        usgsSiteId: g.usgs_site_id,
        name: g.name,
        coordinates: g.location?.coordinates
          ? { lat: g.location.coordinates[1], lng: g.location.coordinates[0] }
          : null,
      })),
      vesselTypes: (vesselTypes || []).map((v) => ({
        id: v.id,
        name: v.name,
        slug: v.slug,
        description: v.description,
        icon: v.icon,
        speeds: {
          lowWater: v.speed_low_water ? parseFloat(v.speed_low_water) : null,
          normal: v.speed_normal ? parseFloat(v.speed_normal) : null,
          highWater: v.speed_high_water ? parseFloat(v.speed_high_water) : null,
        },
      })),
    };

    return NextResponse.json(exportData, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error generating data export:', error);
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
  }
}
