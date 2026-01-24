// src/app/api/admin/rivers/route.ts
// GET /api/admin/rivers - List all rivers with geometries for editing

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Get all rivers (including inactive for admin)
    const { data: rivers, error } = await supabase
      .from('rivers')
      .select('id, name, slug, length_miles, active')
      .order('name', { ascending: true });

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
