// POST /api/admin/pois/[id]/compute-mile
// Computes river_mile for a POI by projecting its coordinates onto the river line

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();
    const { riverId, latitude, longitude } = body;

    if (!riverId || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'riverId, latitude, and longitude are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Try the RPC first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('compute_poi_river_mile', {
      p_poi_id: id,
      p_river_id: riverId,
      p_lat: latitude,
      p_lng: longitude,
    });

    if (!rpcError && rpcData?.[0]?.river_mile != null) {
      return NextResponse.json({ riverMile: Math.round(rpcData[0].river_mile * 10) / 10 });
    }

    // Fallback: compute directly via SQL
    const { data: sqlData, error: sqlError } = await supabase.rpc('snap_to_river' as string, {
      p_river_id: riverId,
      p_point: `SRID=4326;POINT(${longitude} ${latitude})`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (!sqlError && sqlData?.[0]?.river_mile != null) {
      return NextResponse.json({ riverMile: Math.round(parseFloat(sqlData[0].river_mile) * 10) / 10 });
    }

    // Last resort: manual calculation
    const { data: river } = await supabase
      .from('rivers')
      .select('id, length_miles, geometry_starts_at_headwaters')
      .eq('id', riverId)
      .single();

    if (!river) {
      return NextResponse.json({ error: 'River not found' }, { status: 404 });
    }

    // Use raw SQL query to compute fraction
    const { data: fractionData } = await supabase
      .rpc('get_line_locate_point' as string, {
        p_river_id: riverId,
        p_lng: longitude,
        p_lat: latitude,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    if (fractionData?.[0]?.fraction != null && river.length_miles) {
      const fraction = parseFloat(fractionData[0].fraction);
      const startsAtHead = river.geometry_starts_at_headwaters !== false;
      const mile = startsAtHead
        ? fraction * parseFloat(String(river.length_miles))
        : (1 - fraction) * parseFloat(String(river.length_miles));
      return NextResponse.json({ riverMile: Math.round(mile * 10) / 10 });
    }

    return NextResponse.json({ riverMile: null, error: 'Could not compute - RPC not available' });
  } catch (error) {
    console.error('Error computing POI river mile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
