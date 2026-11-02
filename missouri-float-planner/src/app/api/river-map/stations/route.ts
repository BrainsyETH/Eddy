// src/app/api/river-map/stations/route.ts
// GET /api/river-map/stations — the national map's station catalog: every
// in-scope USGS gauge's position, name and state. See
// src/lib/national-map/catalog.ts for the format and why it is not
// /api/gauges/points.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { buildCatalog } from '@/lib/national-map/catalog';
import { loadNationalStations } from '@/lib/national-map/station-source';

export const dynamic = 'force-dynamic';

async function _GET(request: NextRequest) {
  const limited = await rateLimit(`river-map-stations:${getClientIp(request)}`, 20, 60 * 1000);
  if (limited) return limited;
  try {
    const stations = await loadNationalStations(createAdminClient());
    // Metadata syncs weekly; six hours at the CDN is invisible, and a day of
    // stale-while-revalidate keeps the map drawable through a database blip.
    return NextResponse.json(buildCatalog(stations), { headers: cdnCacheHeaders(21600, 86400) });
  } catch (err) {
    console.error('[river-map/stations] failed:', err);
    return NextResponse.json({ error: 'Station catalog temporarily unavailable' }, { status: 503 });
  }
}

export const GET = withX402Route(_GET, '/api/river-map/stations');
