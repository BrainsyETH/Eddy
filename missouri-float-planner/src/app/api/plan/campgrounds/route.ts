// src/app/api/plan/campgrounds/route.ts
// GET /api/plan/campgrounds - Get campgrounds along route for multi-day trips

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AccessPoint, AccessPointType } from '@/types/api';

// Force dynamic rendering (uses cookies and searchParams)
export const dynamic = 'force-dynamic';

export interface CampgroundsResponse {
  campgrounds: AccessPoint[];
  totalDistance: number;
  recommendedStops: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const riverId = searchParams.get('riverId');
    const startId = searchParams.get('startId');
    const endId = searchParams.get('endId');
    const tripDurationDays = parseInt(searchParams.get('tripDurationDays') || '1', 10);
    const intervalMinMiles = parseFloat(searchParams.get('intervalMin') || '10');
    const intervalMaxMiles = parseFloat(searchParams.get('intervalMax') || '15');

    if (!riverId || !startId || !endId) {
      return NextResponse.json(
        { error: 'Missing required parameters: riverId, startId, endId' },
        { status: 400 }
      );
    }

    if (tripDurationDays < 2) {
      return NextResponse.json(
        { error: 'tripDurationDays must be at least 2 for multi-day planning' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get access points to determine river miles
    const { data: accessPoints, error: accessError } = await supabase
      .from('access_points')
      .select('id, river_mile_downstream')
      .in('id', [startId, endId])
      .eq('approved', true);

    if (accessError || !accessPoints || accessPoints.length !== 2) {
      return NextResponse.json(
        { error: 'Access points not found' },
        { status: 404 }
      );
    }

    const putIn = accessPoints.find(ap => ap.id === startId);
    const takeOut = accessPoints.find(ap => ap.id === endId);

    if (!putIn || !takeOut) {
      return NextResponse.json(
        { error: 'Invalid access points' },
        { status: 400 }
      );
    }

    const startMile = parseFloat(putIn.river_mile_downstream);
    const endMile = parseFloat(takeOut.river_mile_downstream);
    const totalDistance = Math.abs(endMile - startMile);

    // Call database function to get campgrounds along route
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campgroundData, error: campgroundError } = await (supabase.rpc as any)(
      'get_campgrounds_along_route',
      {
        p_river_id: riverId,
        p_start_mile: startMile,
        p_end_mile: endMile,
        p_interval_min_miles: intervalMinMiles,
        p_interval_max_miles: intervalMaxMiles,
      }
    );

    if (campgroundError) {
      console.error('Error fetching campgrounds:', campgroundError);
      return NextResponse.json(
        { error: 'Could not fetch campgrounds' },
        { status: 500 }
      );
    }

    // Transform to API format
    const campgrounds: AccessPoint[] = (campgroundData || []).map((cg: {
      id: string;
      name: string;
      slug: string;
      river_mile: number;
      coordinates: { coordinates: [number, number] };
      amenities: string[];
      distance_from_start: number;
    }) => ({
      id: cg.id,
      riverId: riverId,
      name: cg.name,
      slug: cg.slug,
      riverMile: parseFloat(cg.river_mile),
      type: 'campground' as AccessPointType,
      isPublic: true,
      ownership: null,
      description: null,
      amenities: cg.amenities || [],
      parkingInfo: null,
      feeRequired: false,
      feeNotes: null,
      coordinates: {
        lng: cg.coordinates?.coordinates?.[0] || 0,
        lat: cg.coordinates?.coordinates?.[1] || 0,
      },
    }));

    // Calculate recommended number of stops based on trip duration
    const recommendedStops = tripDurationDays - 1;

    const response: CampgroundsResponse = {
      campgrounds,
      totalDistance,
      recommendedStops,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error calculating campgrounds:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
