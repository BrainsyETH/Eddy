// src/app/api/rivers/[slug]/route.ts
// GET /api/rivers/[slug] - Get river details with geometry

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { withX402Route } from '@/lib/x402-config';
import type { RiverDetailResponse } from '@/types/api';
// Shared with /api/offline/bundle — see the header of shapes.ts.
import { toRiverDetail, type RiverRow } from '@/lib/offline/shapes';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

async function _GET(
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: geomData, error: geomError } = await (supabase.rpc as any)('get_river_geometry_json', {
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

    const response: RiverDetailResponse = {
      river: toRiverDetail(river as unknown as RiverRow, geometry),
    };

    return NextResponse.json(response, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error in river detail endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '/api/rivers/:slug');
