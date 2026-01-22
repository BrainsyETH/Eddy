// src/app/api/rivers/[slug]/route.ts
// GET /api/rivers/[slug] - Get river details with geometry

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateBounds } from '@/lib/utils/geo';
import type { RiverDetailResponse } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Get river details
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, name, slug, length_miles, description, difficulty_rating, region, nhd_feature_id')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json(
        { error: 'River not found' },
        { status: 404 }
      );
    }

    // Get geometry as GeoJSON using PostGIS function
    const { data: geomData, error: geomError } = await supabase.rpc('get_river_geometry_json', {
      p_slug: slug,
    });

    let geometry: GeoJSON.LineString;

    if (geomError || !geomData) {
      if (geomError?.code === 'PGRST202') {
        console.warn('get_river_geometry_json function missing; falling back to rivers.geom.');
      } else if (geomError) {
        console.error('Error fetching river geometry:', geomError);
      }
      // Fallback: try to get geometry directly (may work if Supabase auto-converts)
      const { data: riverWithGeom } = await supabase
        .from('rivers')
        .select('geom')
        .eq('slug', slug)
        .single();

      if (riverWithGeom?.geom && typeof riverWithGeom.geom === 'object' && 'type' in riverWithGeom.geom) {
        geometry = riverWithGeom.geom as GeoJSON.LineString;
      } else {
        // Last resort: empty geometry
        console.warn('Could not fetch river geometry for:', slug);
        geometry = {
          type: 'LineString',
          coordinates: [],
        };
      }
    } else {
      // Parse the GeoJSON returned from PostGIS function
      try {
        // The function returns JSONB, which Supabase should parse automatically
        const geomJson = typeof geomData === 'string' ? JSON.parse(geomData) : geomData;
        geometry = geomJson as GeoJSON.LineString;
      } catch (parseError) {
        console.error('Error parsing geometry JSON:', parseError);
        geometry = {
          type: 'LineString',
          coordinates: [],
        };
      }
    }

    const bounds = calculateBounds(geometry);

    const response: RiverDetailResponse = {
      river: {
        id: river.id,
        name: river.name,
        slug: river.slug,
        lengthMiles: parseFloat(river.length_miles),
        description: river.description,
        difficultyRating: river.difficulty_rating,
        region: river.region,
        geometry,
        bounds,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in river detail endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
