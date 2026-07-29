// src/app/api/rivers/[slug]/hazards/route.ts
// GET /api/rivers/[slug]/hazards - Get hazards for a river

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import type { HazardsResponse } from '@/types/api';
import { withX402Route } from '@/lib/x402-config';
// Shared with /api/offline/bundle, which seeds the same hazards into the iOS
// cache this route later writes through to. See the header of shapes.ts.
import { toHazard, type HazardRow } from '@/lib/offline/shapes';

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

    // Get active hazards
    const { data: hazards, error: hazardsError } = await supabase
      .from('river_hazards')
      .select('*')
      .eq('river_id', river.id)
      .eq('active', true)
      .order('river_mile_downstream', { ascending: false });

    if (hazardsError) {
      console.error('Error fetching hazards:', hazardsError);
      return NextResponse.json(
        { error: 'Could not fetch hazards' },
        { status: 500 }
      );
    }

    const response: HazardsResponse = {
      hazards: (hazards || []).map((h) => toHazard(h as unknown as HazardRow)),
    };

    return NextResponse.json(response, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error in hazards endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
    }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '/api/rivers/:slug/hazards');
