// src/app/api/admin/access-points/route.ts
// GET /api/admin/access-points - List all access points for editing
// POST /api/admin/access-points - Create a new access point

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    // Use admin client to bypass RLS and see all access points including unapproved
    const supabase = createAdminClient();

    // Get all access points (including unapproved) for admin editing
    // Note: Supabase has a default limit of 1000, so we explicitly set a higher limit
    const { data: accessPoints, error } = await supabase
      .from('access_points')
      .select(`
        id,
        river_id,
        name,
        slug,
        location_orig,
        location_snap,
        river_mile_downstream,
        type,
        types,
        is_public,
        ownership,
        description,
        parking_info,
        road_access,
        facilities,
        fee_required,
        directions_override,
        driving_lat,
        driving_lng,
        image_urls,
        google_maps_url,
        approved,
        rivers(id, name, slug)
      `)
      .order('name', { ascending: true })
      .limit(5000);

    if (error) {
      console.error('Error fetching access points:', error);
      return NextResponse.json(
        { error: 'Could not fetch access points' },
        { status: 500 }
      );
    }

    // Format response with coordinates
    // Type guard for GeoJSON Point
    const getCoordinates = (geom: unknown): { lng: number; lat: number } | null => {
      if (!geom || typeof geom !== 'object') return null;
      const geo = geom as { type?: string; coordinates?: [number, number] };
      if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
        return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
      }
      return null;
    };

    // Type guard for rivers relation
    const getRiverData = (rivers: unknown): { name?: string; slug?: string } | null => {
      if (!rivers || typeof rivers !== 'object') return null;
      return rivers as { name?: string; slug?: string };
    };

    // Format access points - for admin, include ALL points including those with missing coordinates
    const formatted = (accessPoints || [])
      .map((ap) => {
        const riverData = getRiverData(ap.rivers);
        const origCoords = getCoordinates(ap.location_orig);
        const snapCoords = ap.location_snap ? getCoordinates(ap.location_snap) : null;

        // For admin view, include points without coordinates but flag them
        const hasMissingCoords = !origCoords;

        // Validate coordinates are within reasonable bounds (Missouri area)
        let hasInvalidCoords = false;
        if (origCoords) {
          const isValidLng = origCoords.lng >= -96.5 && origCoords.lng <= -88.9;
          const isValidLat = origCoords.lat >= 35.9 && origCoords.lat <= 40.7;
          hasInvalidCoords = !isValidLng || !isValidLat;
        }

        return {
          id: ap.id,
          riverId: ap.river_id,
          riverName: riverData?.name || 'Unknown River',
          riverSlug: riverData?.slug,
          name: ap.name,
          slug: ap.slug,
          coordinates: {
            // Use placeholder coordinates for points without coords (center of Missouri)
            orig: origCoords || { lng: -92.5, lat: 38.5 },
            snap: snapCoords,
          },
          riverMile: ap.river_mile_downstream ? parseFloat(ap.river_mile_downstream) : null,
          type: ap.type,
          types: ap.types || (ap.type ? [ap.type] : []),
          isPublic: ap.is_public,
          ownership: ap.ownership,
          description: ap.description,
          parkingInfo: ap.parking_info,
          roadAccess: ap.road_access,
          facilities: ap.facilities,
          feeRequired: ap.fee_required,
          directionsOverride: ap.directions_override,
          drivingLat: ap.driving_lat ? parseFloat(ap.driving_lat) : null,
          drivingLng: ap.driving_lng ? parseFloat(ap.driving_lng) : null,
          imageUrls: ap.image_urls || [],
          googleMapsUrl: ap.google_maps_url,
          approved: ap.approved,
          hasInvalidCoords, // Flag for admin UI to show warning
          hasMissingCoords, // New flag for points without coordinates
        };
      });

    return NextResponse.json({ accessPoints: formatted });
  } catch (error) {
    console.error('Error in admin access points endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new access point
export async function POST(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const {
      name,
      riverId,
      latitude,
      longitude,
      type = 'access',
      isPublic = true,
      ownership = null,
      description = null,
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!riverId || typeof riverId !== 'string') {
      return NextResponse.json(
        { error: 'River ID is required' },
        { status: 400 }
      );
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Valid latitude and longitude are required' },
        { status: 400 }
      );
    }

    // Validate coordinates are in Missouri area (with buffer for border points)
    if (latitude < 35.9 || latitude > 40.7 || longitude < -96.5 || longitude > -88.9) {
      return NextResponse.json(
        { error: 'Coordinates must be within Missouri bounds' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['boat_ramp', 'gravel_bar', 'campground', 'bridge', 'access', 'park'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const supabase = createAdminClient();

    // Insert new access point
    const { data, error } = await supabase
      .from('access_points')
      .insert({
        name: name.trim(),
        slug,
        river_id: riverId,
        location_orig: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        type,
        is_public: isPublic,
        ownership,
        description,
        approved: true, // Auto-approve points created through admin panel
      })
      .select(`
        id,
        name,
        slug,
        river_id,
        location_orig,
        location_snap,
        river_mile_downstream,
        type,
        is_public,
        ownership,
        description,
        approved
      `)
      .single();

    if (error) {
      console.error('Error creating access point:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'An access point with this name already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Could not create access point' },
        { status: 500 }
      );
    }

    // Format response
    const getCoordinates = (geom: unknown): { lng: number; lat: number } | null => {
      if (!geom || typeof geom !== 'object') return null;
      const geo = geom as { type?: string; coordinates?: [number, number] };
      if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
        return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
      }
      return null;
    };

    const origCoords = getCoordinates(data.location_orig) || { lng: longitude, lat: latitude };
    const snapCoords = data.location_snap ? getCoordinates(data.location_snap) : null;

    const formatted = {
      id: data.id,
      riverId: data.river_id,
      name: data.name,
      slug: data.slug,
      coordinates: {
        orig: origCoords,
        snap: snapCoords,
      },
      riverMile: data.river_mile_downstream ? parseFloat(data.river_mile_downstream) : null,
      type: data.type,
      isPublic: data.is_public,
      ownership: data.ownership,
      description: data.description,
      approved: data.approved,
    };

    return NextResponse.json({ accessPoint: formatted }, { status: 201 });
  } catch (error) {
    console.error('Error in create access point endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
