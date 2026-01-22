// src/app/api/rivers/[slug]/route.ts
// GET /api/rivers/[slug] - Get river details with geometry

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateBounds } from '@/lib/utils/geo';
import type { RiverDetailResponse } from '@/types/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Get river details
    const { data: river, error } = await supabase
      .from('rivers')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !river) {
      return NextResponse.json(
        { error: 'River not found' },
        { status: 404 }
      );
    }

    // Get geometry as GeoJSON using PostGIS function
    // Note: Supabase may return geometry in different formats
    // We'll handle it as GeoJSON or convert if needed
    let geometry: GeoJSON.LineString;
    
    if (river.geom && typeof river.geom === 'object' && 'type' in river.geom) {
      // Already in GeoJSON format
      geometry = river.geom as GeoJSON.LineString;
    } else {
      // Need to query with ST_AsGeoJSON - use a raw query approach
      // For now, return empty geometry - can be enhanced with proper PostGIS query
      geometry = {
        type: 'LineString',
        coordinates: [],
      };
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
