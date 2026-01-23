// src/app/api/admin/access-points/[id]/route.ts
// PUT /api/admin/access-points/[id] - Update access point location
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
    const { latitude, longitude } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // Validate coordinates are in reasonable range (Missouri area with buffer)
    if (latitude < 35.9 || latitude > 40.7 || longitude < -96.5 || longitude > -88.9) {
      return NextResponse.json(
        { error: 'Coordinates out of bounds' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Update location_orig - this will trigger the auto-snap trigger
    const { error: updateError } = await supabase
      .from('access_points')
      .update({
        location_orig: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        updated_at: new Date().toISOString(),
      })
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
        location_orig,
        location_snap,
        river_mile_downstream,
        approved
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

    const formatted = {
      id: data.id,
      name: data.name,
      coordinates: {
        orig: origCoords,
        snap: snapCoords,
      },
      riverMile: data.river_mile_downstream ? parseFloat(data.river_mile_downstream) : null,
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
