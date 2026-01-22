// src/app/api/admin/access-points/[id]/route.ts
// PUT /api/admin/access-points/[id] - Update access point location

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

    // Validate coordinates are in reasonable range (Missouri area)
    if (latitude < 36 || latitude > 40 || longitude < -96 || longitude > -89) {
      return NextResponse.json(
        { error: 'Coordinates out of bounds' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Update location_orig - this will trigger the auto-snap trigger
    const { data, error } = await supabase
      .from('access_points')
      .update({
        location_orig: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        id,
        name,
        location_orig,
        location_snap,
        river_mile_downstream
      `)
      .single();

    if (error) {
      console.error('Error updating access point:', error);
      return NextResponse.json(
        { error: 'Could not update access point' },
        { status: 500 }
      );
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
    };

    return NextResponse.json({ accessPoint: formatted });
  } catch (error) {
    console.error('Error in update access point endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
