// GET /api/admin/hazards/mile-hint?river=<id>&lat=<n>&lng=<n>
// An estimated river mile for a location, interpolated between the river's
// approved access points (see estimateRiverMile for why not a geometric snap).
// Read-only; the admin reviews the estimate before saving it.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID } from '@/lib/admin-auth';
import { getCoordinates } from '@/lib/api-utils';
import { estimateRiverMile, type MileControlPoint } from '@/lib/admin/hazards';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const river = params.get('river') ?? '';
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (
      !isValidUUID(river) ||
      !params.get('lat') ||
      !params.get('lng') ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return NextResponse.json({ error: 'A river and a valid location are required' }, { status: 400 });
    }

    const { data, error } = await createAdminClient()
      .from('access_points')
      .select('name, river_mile_downstream, location_snap, location_orig')
      .eq('river_id', river)
      .eq('approved', true)
      .not('river_mile_downstream', 'is', null)
      .limit(1000);
    if (error) {
      console.error('Error loading access points for mile hint:', error);
      return NextResponse.json({ error: 'Could not load this river’s access points' }, { status: 500 });
    }

    const controls: MileControlPoint[] = [];
    for (const row of data ?? []) {
      const coords = getCoordinates(row.location_snap) ?? getCoordinates(row.location_orig);
      const mile = Number(row.river_mile_downstream);
      if (coords && Number.isFinite(mile)) controls.push({ name: row.name, mile, lat: coords.lat, lng: coords.lng });
    }

    return NextResponse.json({ estimate: estimateRiverMile({ lat, lng }, controls), accessPoints: controls.length });
  } catch (error) {
    console.error('Error in hazard mile hint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
