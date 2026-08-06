// src/app/api/rivers/[slug]/access-points/route.ts
// GET /api/rivers/[slug]/access-points - Get access points for a river

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import type { AccessPointsResponse, NPSCampgroundInfo } from '@/types/api';
import { withX402Route } from '@/lib/x402-config';
import { getServiceAreaBounds } from '@/lib/geo/region-bounds';
// Shared with /api/offline/bundle — see the header of shapes.ts.
import {
  toAccessPoint,
  toNpsCampground,
  type AccessPointRow,
} from '@/lib/offline/shapes';
import { loadLiveAvailabilityIndex } from '@/lib/camping/live-index';

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

    // Get approved access points
    const { data: accessPoints, error: accessError } = await supabase
      .from('access_points')
      .select('*')
      .eq('river_id', river.id)
      .eq('approved', true)
      // Note: river_mile_downstream now represents "mile from headwaters" 
      // (mile 0.0 = headwaters, increasing downstream)
      // ascending: true = upstream to downstream (natural float direction)
      .order('river_mile_downstream', { ascending: true });

    if (accessError) {
      console.error('Error fetching access points:', accessError);
      return NextResponse.json(
        { error: 'Could not fetch access points' },
        { status: 500 }
      );
    }

    // Batch-fetch NPS campground data for linked access points
    const npsIds = (accessPoints || [])
      .map(ap => ap.nps_campground_id)
      .filter((id): id is string => !!id);

    const npsMap = new Map<string, NPSCampgroundInfo>();
    if (npsIds.length > 0) {
      const { data: campgrounds } = await supabase
        .from('nps_campgrounds')
        .select('*')
        .in('id', npsIds);

      for (const cg of campgrounds || []) {
        npsMap.set(cg.id, toNpsCampground(cg as unknown as Record<string, unknown>));
      }
    }

    // Filter and format access points, excluding those with invalid coordinates
    const serviceBounds = await getServiceAreaBounds();
    // One small query for the whole river. See LiveAvailabilityIndex for why a
    // map payload carries a booking fact at all.
    const liveAvailability = await loadLiveAvailabilityIndex(supabase);

    const formattedPoints = (accessPoints || [])
      .map((ap) => {
        const point = toAccessPoint(
          ap as unknown as AccessPointRow,
          npsMap,
          serviceBounds,
          liveAvailability,
        );
        // Missing coordinates or coordinates outside the service area (active
        // rivers ∪ MO — a hardcoded Missouri box once silently dropped every
        // Arkansas Buffalo River point). Either way the point is not drawable,
        // and a put-in someone would drive to is the wrong thing to guess at.
        if (!point) {
          console.warn(`Access point ${ap.id} (${ap.name}) has unusable coordinates, skipping`);
        }
        return point;
      })
      .filter((ap): ap is NonNullable<typeof ap> => ap !== null);

    const response: AccessPointsResponse = {
      accessPoints: formattedPoints,
    };

    return NextResponse.json(response, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error in access points endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '/api/rivers/:slug/access-points');
