// src/app/api/admin/access-points/[id]/route.ts
// GET /api/admin/access-points/[id] - Get single access point for editing
// PUT /api/admin/access-points/[id] - Update access point (location and all fields)
// DELETE /api/admin/access-points/[id] - Delete access point

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { sanitizeRichText } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

// GET - Fetch a single access point for editing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('access_points')
      .select(`
        id,
        name,
        slug,
        river_id,
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
        road_surface,
        parking_capacity,
        managing_agency,
        official_site_url,
        local_tips,
        nearby_services,
        rivers(id, name, slug)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Access point not found' },
        { status: 404 }
      );
    }

    // Type guard for rivers relation
    const getRiverData = (rivers: unknown): { id?: string; name?: string; slug?: string } | null => {
      if (!rivers || typeof rivers !== 'object') return null;
      return rivers as { id?: string; name?: string; slug?: string };
    };

    // Type guard for GeoJSON Point
    const getCoordinates = (geom: unknown): { lng: number; lat: number } | null => {
      if (!geom || typeof geom !== 'object') return null;
      const geo = geom as { type?: string; coordinates?: [number, number] };
      if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
        return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
      }
      return null;
    };

    const origCoords = getCoordinates(data.location_orig) || { lng: 0, lat: 0 };
    const snapCoords = data.location_snap ? getCoordinates(data.location_snap) : null;
    const riverData = getRiverData(data.rivers);

    const formatted = {
      id: data.id,
      riverId: data.river_id,
      riverName: riverData?.name || 'Unknown River',
      riverSlug: riverData?.slug,
      name: data.name,
      slug: data.slug,
      coordinates: {
        orig: origCoords,
        snap: snapCoords,
      },
      riverMile: data.river_mile_downstream ? parseFloat(data.river_mile_downstream) : null,
      type: data.type,
      types: data.types || (data.type ? [data.type] : []),
      isPublic: data.is_public,
      ownership: data.ownership,
      description: data.description,
      parkingInfo: data.parking_info,
      roadAccess: data.road_access,
      facilities: data.facilities,
      feeRequired: data.fee_required,
      directionsOverride: data.directions_override,
      drivingLat: data.driving_lat ? parseFloat(data.driving_lat) : null,
      drivingLng: data.driving_lng ? parseFloat(data.driving_lng) : null,
      imageUrls: data.image_urls || [],
      googleMapsUrl: data.google_maps_url,
      approved: data.approved,
      // New detail fields
      roadSurface: data.road_surface || [],
      parkingCapacity: data.parking_capacity,
      managingAgency: data.managing_agency,
      officialSiteUrl: data.official_site_url,
      localTips: data.local_tips,
      nearbyServices: data.nearby_services || [],
    };

    return NextResponse.json({ accessPoint: formatted });
  } catch (error) {
    console.error('Error fetching access point:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();
    const {
      latitude,
      longitude,
      name,
      type,
      types,
      isPublic,
      ownership,
      description,
      parkingInfo,
      roadAccess,
      facilities,
      feeRequired,
      riverMile,
      riverId,
      directionsOverride,
      drivingLat,
      drivingLng,
      imageUrls,
      googleMapsUrl,
      // New detail fields
      roadSurface,
      parkingCapacity,
      managingAgency,
      officialSiteUrl,
      localTips,
      nearbyServices,
    } = body;

    const supabase = createAdminClient();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Handle coordinate updates if provided
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      // Validate coordinates are in reasonable range (Missouri area with buffer)
      if (latitude < 35.9 || latitude > 40.7 || longitude < -96.5 || longitude > -88.9) {
        return NextResponse.json(
          { error: 'Coordinates out of bounds' },
          { status: 400 }
        );
      }
      updateData.location_orig = {
        type: 'Point',
        coordinates: [longitude, latitude],
      };
    }

    // Handle name update
    if (typeof name === 'string' && name.trim().length > 0) {
      updateData.name = name.trim();
      // Generate new slug from name
      updateData.slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    // Handle type update (single - for backwards compatibility)
    if (typeof type === 'string') {
      const validTypes = ['boat_ramp', 'gravel_bar', 'campground', 'bridge', 'access', 'park'];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.type = type;
    }

    // Handle types update (array - new multi-select)
    if (Array.isArray(types)) {
      const validTypes = ['boat_ramp', 'gravel_bar', 'campground', 'bridge', 'access', 'park'];
      const filteredTypes = types.filter((t: string) => validTypes.includes(t));
      updateData.types = filteredTypes;
      // Also update primary type for backwards compatibility
      if (filteredTypes.length > 0 && !updateData.type) {
        updateData.type = filteredTypes[0];
      }
    }

    // Handle isPublic update
    if (typeof isPublic === 'boolean') {
      updateData.is_public = isPublic;
    }

    // Handle ownership update
    if (ownership !== undefined) {
      updateData.ownership = ownership === '' ? null : ownership;
    }

    // Handle description update
    if (description !== undefined) {
      updateData.description = description === '' ? null : description;
    }

    // Handle parkingInfo update
    if (parkingInfo !== undefined) {
      updateData.parking_info = parkingInfo === '' ? null : parkingInfo;
    }

    // Handle roadAccess update
    if (roadAccess !== undefined) {
      updateData.road_access = roadAccess === '' ? null : roadAccess;
    }

    // Handle facilities update
    if (facilities !== undefined) {
      updateData.facilities = facilities === '' ? null : facilities;
    }

    // Handle feeRequired update
    if (typeof feeRequired === 'boolean') {
      updateData.fee_required = feeRequired;
    }

    // Handle riverMile update (manual override of calculated mile marker)
    if (riverMile !== undefined) {
      updateData.river_mile_downstream = riverMile === null || riverMile === '' ? null : parseFloat(String(riverMile));
    }

    // Handle riverId update
    if (typeof riverId === 'string' && riverId.length > 0) {
      updateData.river_id = riverId;
    }

    // Handle directionsOverride update (can be set to empty string to clear)
    if (directionsOverride !== undefined) {
      updateData.directions_override = directionsOverride === '' ? null : directionsOverride;
    }

    // Handle driving coordinates (for accurate shuttle time calculation)
    if (drivingLat !== undefined) {
      updateData.driving_lat = drivingLat === '' || drivingLat === null ? null : parseFloat(drivingLat);
    }
    if (drivingLng !== undefined) {
      updateData.driving_lng = drivingLng === '' || drivingLng === null ? null : parseFloat(drivingLng);
    }

    // Handle imageUrls update (array of image URLs)
    if (imageUrls !== undefined) {
      updateData.image_urls = Array.isArray(imageUrls) ? imageUrls.filter((url: string) => url && url.trim()) : [];
    }

    // Handle googleMapsUrl update
    if (googleMapsUrl !== undefined) {
      updateData.google_maps_url = googleMapsUrl === '' ? null : googleMapsUrl;
    }

    // Handle roadSurface update (array of road surface types)
    if (roadSurface !== undefined) {
      const validSurfaces = ['paved', 'gravel_maintained', 'gravel_unmaintained', 'dirt', 'seasonal', '4wd_required'];
      if (Array.isArray(roadSurface)) {
        updateData.road_surface = roadSurface.filter((s: string) => validSurfaces.includes(s));
      } else {
        updateData.road_surface = [];
      }
    }

    // Handle parkingCapacity update
    if (parkingCapacity !== undefined) {
      const validCapacities = ['5', '10', '15', '20', '25', '30', '50+', 'roadside', 'limited', 'unknown'];
      if (parkingCapacity === '' || parkingCapacity === null) {
        updateData.parking_capacity = null;
      } else if (validCapacities.includes(parkingCapacity)) {
        updateData.parking_capacity = parkingCapacity;
      }
    }

    // Handle managingAgency update
    if (managingAgency !== undefined) {
      const validAgencies = ['MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private'];
      if (managingAgency === '' || managingAgency === null) {
        updateData.managing_agency = null;
      } else if (validAgencies.includes(managingAgency)) {
        updateData.managing_agency = managingAgency;
      }
    }

    // Handle officialSiteUrl update
    if (officialSiteUrl !== undefined) {
      updateData.official_site_url = officialSiteUrl === '' ? null : officialSiteUrl;
    }

    // Handle localTips update (rich text HTML — sanitize to prevent XSS)
    if (localTips !== undefined) {
      updateData.local_tips = localTips === '' ? null : sanitizeRichText(localTips);
    }

    // Handle nearbyServices update (JSONB array)
    if (nearbyServices !== undefined) {
      if (Array.isArray(nearbyServices)) {
        // Validate each service has required fields
        const validTypes = ['outfitter', 'campground', 'canoe_rental', 'shuttle', 'lodging'];
        const validatedServices = nearbyServices
          .filter((s: { name?: string; type?: string }) =>
            s && typeof s.name === 'string' && s.name.trim() &&
            typeof s.type === 'string' && validTypes.includes(s.type)
          )
          .map((s: { name: string; type: string; phone?: string; website?: string; distance?: string; notes?: string }) => ({
            name: s.name.trim(),
            type: s.type,
            phone: s.phone || undefined,
            website: s.website || undefined,
            distance: s.distance || undefined,
            notes: s.notes || undefined,
          }));
        updateData.nearby_services = validatedServices;
      } else {
        updateData.nearby_services = [];
      }
    }

    // Check if we have anything to update
    if (Object.keys(updateData).length === 1) {
      // Only updated_at, no actual changes
      return NextResponse.json(
        { error: 'No valid fields provided to update' },
        { status: 400 }
      );
    }

    // Update access point
    const { error: updateError } = await supabase
      .from('access_points')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Error updating access point:', updateError);
      return NextResponse.json(
        { error: 'Could not update access point' },
        { status: 500 }
      );
    }

    // Re-fetch to ensure we get trigger-updated values (location_snap, river_mile_downstream)
    const { data, error: fetchError } = await supabase
      .from('access_points')
      .select(`
        id,
        name,
        slug,
        river_id,
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
        road_surface,
        parking_capacity,
        managing_agency,
        official_site_url,
        local_tips,
        nearby_services,
        rivers(id, name, slug)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !data) {
      console.error('Error fetching updated access point:', fetchError);
      return NextResponse.json(
        { error: 'Could not fetch updated access point' },
        { status: 500 }
      );
    }

    // Log for debugging - helps identify if trigger is working
    console.log('Access point updated:', {
      id: data.id,
      name: data.name,
      riverMile: data.river_mile_downstream,
      approved: data.approved,
      hasSnappedLocation: !!data.location_snap,
    });

    // Type guard for rivers relation
    const getRiverData = (rivers: unknown): { id?: string; name?: string; slug?: string } | null => {
      if (!rivers || typeof rivers !== 'object') return null;
      return rivers as { id?: string; name?: string; slug?: string };
    };

    // Invalidate segment cache for this access point
    // This ensures float plans are recalculated with the new position
    try {
      await supabase.rpc('invalidate_segment_cache', {
        p_access_point_id: id,
      });
    } catch (cacheError) {
      // Log but don't fail the request if cache invalidation fails
      console.warn('Failed to invalidate segment cache:', cacheError);
    }

    // Format response
    // Type guard for GeoJSON Point
    const getCoordinates = (geom: unknown): { lng: number; lat: number } | null => {
      if (!geom || typeof geom !== 'object') return null;
      const geo = geom as { type?: string; coordinates?: [number, number] };
      if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
        return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
      }
      return null;
    };

    const origCoords = getCoordinates(data.location_orig) || { lng: 0, lat: 0 };
    const snapCoords = data.location_snap ? getCoordinates(data.location_snap) : null;
    const riverData = getRiverData(data.rivers);

    const formatted = {
      id: data.id,
      riverId: data.river_id,
      riverName: riverData?.name || 'Unknown River',
      riverSlug: riverData?.slug,
      name: data.name,
      slug: data.slug,
      coordinates: {
        orig: origCoords,
        snap: snapCoords,
      },
      riverMile: data.river_mile_downstream ? parseFloat(data.river_mile_downstream) : null,
      type: data.type,
      types: data.types || (data.type ? [data.type] : []),
      isPublic: data.is_public,
      ownership: data.ownership,
      description: data.description,
      parkingInfo: data.parking_info,
      roadAccess: data.road_access,
      facilities: data.facilities,
      feeRequired: data.fee_required,
      directionsOverride: data.directions_override,
      drivingLat: data.driving_lat ? parseFloat(data.driving_lat) : null,
      drivingLng: data.driving_lng ? parseFloat(data.driving_lng) : null,
      imageUrls: data.image_urls || [],
      googleMapsUrl: data.google_maps_url,
      approved: data.approved,
      // New detail fields
      roadSurface: data.road_surface || [],
      parkingCapacity: data.parking_capacity,
      managingAgency: data.managing_agency,
      officialSiteUrl: data.official_site_url,
      localTips: data.local_tips,
      nearbyServices: data.nearby_services || [],
    };

    return NextResponse.json({
      accessPoint: formatted,
      // Include a warning if the point is not approved (won't show in production)
      warning: !data.approved ? 'This access point is not approved and will not appear in the public app until approved.' : undefined,
    });
  } catch (error) {
    console.error('Error in update access point endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove an access point
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const supabase = createAdminClient();

    // Invalidate segment cache before deletion
    try {
      await supabase.rpc('invalidate_segment_cache', {
        p_access_point_id: id,
      });
    } catch (cacheError) {
      console.warn('Failed to invalidate segment cache:', cacheError);
    }

    const { error } = await supabase
      .from('access_points')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting access point:', error);
      return NextResponse.json(
        { error: 'Could not delete access point' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in delete access point endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
