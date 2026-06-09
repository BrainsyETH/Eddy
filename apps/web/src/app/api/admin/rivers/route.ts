// src/app/api/admin/rivers/route.ts
// GET /api/admin/rivers - List all rivers with geometries for editing

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    // Get all rivers (including inactive for admin)
    // Try with active column first, fall back without if column doesn't exist
    let rivers;
    let error;

    const withActiveResult = await supabase
      .from('rivers')
      .select('id, name, slug, length_miles, active')
      .order('name', { ascending: true });

    if (withActiveResult.error?.message?.includes('active')) {
      // Column doesn't exist yet, fetch without it
      const fallbackResult = await supabase
        .from('rivers')
        .select('id, name, slug, length_miles')
        .order('name', { ascending: true });

      rivers = fallbackResult.data?.map(r => ({ ...r, active: true }));
      error = fallbackResult.error;
    } else {
      rivers = withActiveResult.data;
      error = withActiveResult.error;
    }

    if (error) {
      console.error('Error fetching rivers:', error);
      return NextResponse.json(
        { error: 'Could not fetch rivers' },
        { status: 500 }
      );
    }

    // Get geometries for each river
    const riversWithGeometry = await Promise.all(
      (rivers || []).map(async (river) => {
        const { data: geomData, error: geomError } = await supabase.rpc('get_river_geometry_json', {
          p_slug: river.slug,
        });

        let geometry: GeoJSON.LineString | null = null;

        if (geomError?.code === 'PGRST202') {
          console.warn('get_river_geometry_json function missing; falling back to rivers.geom.');
        } else if (geomError) {
          console.error('Error fetching geometry for river:', river.slug, geomError);
        }

        if (geomData) {
          try {
            const geomJson = typeof geomData === 'string' ? JSON.parse(geomData) : geomData;
            geometry = geomJson as GeoJSON.LineString;
          } catch (parseError) {
            console.error('Error parsing geometry for river:', river.slug, parseError);
          }
        } else {
          const { data: riverWithGeom } = await supabase
            .from('rivers')
            .select('geom')
            .eq('id', river.id)
            .single();

          if (riverWithGeom?.geom && typeof riverWithGeom.geom === 'object' && 'type' in riverWithGeom.geom) {
            geometry = riverWithGeom.geom as GeoJSON.LineString;
          }
        }

        return {
          id: river.id,
          name: river.name,
          slug: river.slug,
          lengthMiles: parseFloat(river.length_miles),
          geometry,
          active: river.active ?? true,
        };
      })
    );

    return NextResponse.json({ rivers: riversWithGeometry });
  } catch (error) {
    console.error('Error in admin rivers endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
