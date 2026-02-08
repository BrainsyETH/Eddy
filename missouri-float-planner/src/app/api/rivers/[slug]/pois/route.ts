// src/app/api/rivers/[slug]/pois/route.ts
// GET /api/rivers/[slug]/pois - Get points of interest for a river

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Get river ID
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json(
        { error: 'River not found' },
        { status: 404 }
      );
    }

    // Get active POIs for this river
    const { data: pois, error: poisError } = await supabase
      .from('points_of_interest')
      .select('*')
      .eq('river_id', river.id)
      .eq('active', true)
      .eq('is_on_water', true)
      .order('river_mile', { ascending: true, nullsFirst: false });

    if (poisError) {
      console.error('Error fetching POIs:', poisError);
      return NextResponse.json(
        { error: 'Could not fetch points of interest' },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedPois = (pois || []).map((poi: any) => {
      // images may be stored as JSON string — parse if needed
      let images = poi.images || [];
      if (typeof images === 'string') {
        try { images = JSON.parse(images); } catch { images = []; }
      }

      return {
        id: poi.id,
        riverId: poi.river_id,
        name: poi.name,
        slug: poi.slug,
        description: poi.description,
        bodyText: poi.body_text,
        type: poi.type,
        source: poi.source,
        npsUrl: poi.nps_url,
        latitude: poi.latitude,
        longitude: poi.longitude,
        riverMile: poi.river_mile,
        images,
        amenities: poi.amenities,
        active: poi.active,
        isOnWater: poi.is_on_water,
      };
    });

    return NextResponse.json({ pois: formattedPois });
  } catch (error) {
    console.error('Error in POIs endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
