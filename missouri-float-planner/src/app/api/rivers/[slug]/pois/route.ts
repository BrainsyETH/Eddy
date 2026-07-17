// src/app/api/rivers/[slug]/pois/route.ts
// GET /api/rivers/[slug]/pois - Get points of interest for a river

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { withX402Route } from '@/lib/x402-config';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

async function _GET(
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
      // On-water features only — except outfitters, which are streamside by
      // nature (the OSM import stores them with is_on_water=false) and are
      // exactly what a planner wants to see.
      .or('is_on_water.eq.true,type.eq.outfitter')
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

      // Contact details (outfitters): the OSM import keeps original tags in
      // raw_data; expose the useful ones so the planner can offer
      // tap-to-call / website without shipping the whole blob.
      const raw = (poi.raw_data ?? {}) as Record<string, unknown>;
      const rawStr = (k: string): string | null =>
        typeof raw[k] === 'string' && (raw[k] as string).length > 0 ? (raw[k] as string) : null;
      const website = rawStr('website') ?? rawStr('contact:website') ?? rawStr('url');
      const phone = rawStr('phone') ?? rawStr('contact:phone');

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
        website,
        phone,
      };
    });

    return NextResponse.json({ pois: formattedPois }, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error in POIs endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '/api/rivers/:slug/pois');
