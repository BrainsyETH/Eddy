// src/app/api/rivers/[slug]/access-points/route.ts
// GET /api/rivers/[slug]/access-points - Get access points for a river

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AccessPointsResponse } from '@/types/api';

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

    // Get approved access points
    const { data: accessPoints, error: accessError } = await supabase
      .from('access_points')
      .select('*')
      .eq('river_id', river.id)
      .eq('approved', true)
      // Note: river_mile_downstream now represents "mile from headwaters" 
      // (mile 0.0 = headwaters, increasing downstream)
      // ascending: false = downstream to upstream, ascending: true = upstream to downstream
      .order('river_mile_downstream', { ascending: false });

    if (accessError) {
      console.error('Error fetching access points:', accessError);
      return NextResponse.json(
        { error: 'Could not fetch access points' },
        { status: 500 }
      );
    }

    // Filter and format access points, excluding those with invalid coordinates
    const formattedPoints = (accessPoints || [])
      .map((ap) => {
        const lng =
          ap.location_snap?.coordinates?.[0] ||
          ap.location_orig?.coordinates?.[0];
        const lat =
          ap.location_snap?.coordinates?.[1] ||
          ap.location_orig?.coordinates?.[1];

        // Skip points with missing or invalid coordinates
        if (lng === undefined || lat === undefined || lng === null || lat === null) {
          console.warn(`Access point ${ap.id} (${ap.name}) has invalid coordinates, skipping`);
          return null;
        }

        // Validate coordinates are within reasonable bounds (Missouri area)
        const isValidLng = lng >= -96.5 && lng <= -88.9;
        const isValidLat = lat >= 35.9 && lat <= 40.7;
        if (!isValidLng || !isValidLat) {
          console.warn(`Access point ${ap.id} (${ap.name}) has out-of-bounds coordinates (${lng}, ${lat}), skipping`);
          return null;
        }

        return {
          id: ap.id,
          riverId: ap.river_id,
          name: ap.name,
          slug: ap.slug,
          riverMile: parseFloat(ap.river_mile_downstream),
          type: ap.type,
          isPublic: ap.is_public,
          ownership: ap.ownership,
          description: ap.description,
          amenities: ap.amenities || [],
          parkingInfo: ap.parking_info,
          feeRequired: ap.fee_required,
          feeNotes: ap.fee_notes,
          coordinates: { lng, lat },
        };
      })
      .filter((ap): ap is NonNullable<typeof ap> => ap !== null);

    const response: AccessPointsResponse = {
      accessPoints: formattedPoints,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in access points endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
