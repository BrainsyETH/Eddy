// src/app/api/campsites/route.ts
// GET /api/campsites?facility=<campsite_facilities.id> — individual sites.
//
// ── Why this is its own request ────────────────────────────────────────────
//
// The fortnight of COUNTS rides inline on the access-point and services
// responses, so the map sheet's strip paints on the first frame with nothing
// outstanding. The SITES do not: Meramec has 197 of them, and putting that on
// every pin tap would cost every reader who never opens the Camping tab.
//
// So the app asks for this only when that tab becomes active. Cached rows only,
// like every other camping read — a popular river page can never turn into
// traffic against a booking system.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { loadFacilitySites } from '@/lib/camping/sites';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimit(`campsites:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const facilityId = request.nextUrl.searchParams.get('facility');
    if (!facilityId) {
      return NextResponse.json({ error: 'facility is required' }, { status: 400 });
    }

    // The id comes from CampsiteAvailabilityInfo.facilityId, which the client
    // already holds by the time it can render a Camping tab. Validated rather
    // than trusted: it reaches a `.eq()` on a uuid column, and a malformed one
    // should be a 400 rather than a Postgres error surfacing as a 500.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facilityId)) {
      return NextResponse.json({ error: 'facility must be an id' }, { status: 400 });
    }

    const supabase = await createClient();
    const result = await loadFacilitySites(supabase, facilityId);

    // A facility Eddy does not track, or one whose sites have not been synced
    // yet, is a different question rather than a fault.
    if (!result) {
      return NextResponse.json({ error: 'No sites for this facility' }, { status: 404 });
    }

    return NextResponse.json(result, {
      // Same shape as the services route. The underlying rows change once a
      // night, so a five-minute browser cache costs nothing and an hour of
      // stale-while-revalidate keeps a popular weekend off the database.
      headers: cdnCacheHeaders(300, 3600),
    });
  } catch (error) {
    console.error('[api/campsites]', error);
    return NextResponse.json({ error: 'Failed to load campsites' }, { status: 500 });
  }
}
