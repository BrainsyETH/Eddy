// src/app/api/admin/access-points/route.ts
// GET /api/admin/access-points - List all access points for editing

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get all access points (including unapproved) for admin editing
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
        is_public,
        ownership,
        description,
        approved,
        rivers!inner(id, name, slug)
      `)
      .order('name', { ascending: true });

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

    const formatted = (accessPoints || []).map((ap) => {
      const riverData = getRiverData(ap.rivers);
      const origCoords = getCoordinates(ap.location_orig) || { lng: 0, lat: 0 };
      const snapCoords = ap.location_snap ? getCoordinates(ap.location_snap) : null;

      return {
        id: ap.id,
        riverId: ap.river_id,
        riverName: riverData?.name,
        riverSlug: riverData?.slug,
        name: ap.name,
        slug: ap.slug,
        coordinates: {
          orig: origCoords,
          snap: snapCoords,
        },
        riverMile: ap.river_mile_downstream ? parseFloat(ap.river_mile_downstream) : null,
        type: ap.type,
        isPublic: ap.is_public,
        ownership: ap.ownership,
        description: ap.description,
        approved: ap.approved,
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
