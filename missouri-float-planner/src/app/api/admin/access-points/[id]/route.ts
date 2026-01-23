// src/app/api/admin/access-points/[id]/route.ts
// PUT /api/admin/access-points/[id] - Update access point (location and all fields)
// DELETE /api/admin/access-points/[id] - Delete access point

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      latitude,
      longitude,
      name,
      type,
      isPublic,
      ownership,
      description,
      feeRequired,
      riverId,
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

    // Handle type update
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

    // Handle feeRequired update
    if (typeof feeRequired === 'boolean') {
      updateData.fee_required = feeRequired;
    }

    // Handle riverId update
    if (typeof riverId === 'string' && riverId.length > 0) {
      updateData.river_id = riverId;
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
        is_public,
        ownership,
        description,
        fee_required,
        approved,
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
      isPublic: data.is_public,
      ownership: data.ownership,
      description: data.description,
      feeRequired: data.fee_required,
      approved: data.approved,
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
