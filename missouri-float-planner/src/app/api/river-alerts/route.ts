// src/app/api/river-alerts/route.ts
// GET /api/river-alerts — what the agencies are saying about these rivers.
//
// ── Two feeds that had no way out ──────────────────────────────────────────
// src/lib/nws/alerts.ts has fetched flood warnings since early on and fed them
// to exactly one consumer: the LLM prompt. src/lib/nps/client.ts has talked to
// the Park Service for as long, and never called /alerts at all. So Eddy has
// been reading closures and flood warnings to itself and showing users neither.
//
// The gathering lives in src/lib/alerts/river-alerts.ts because the river hub
// page needs the same data server-side and should not make an HTTP hop to its
// own API to get it. This route is the app's door to it.
//
// Public and unauthenticated, like /api/high-water: a closure is safety
// information and is never behind an account.

import { NextRequest, NextResponse } from 'next/server';
import type { RiverAlertsResponse } from '@/types/api';
import { getRiverAlerts } from '@/lib/alerts/river-alerts';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(`river-alerts:${getClientIp(request)}`, 60, 60 * 1000);
    if (limited) return limited;

    const riverSlug = request.nextUrl.searchParams.get('riverSlug') ?? undefined;
    const alerts = await getRiverAlerts(riverSlug);

    return NextResponse.json<RiverAlertsResponse>(
      { alerts, asOf: new Date().toISOString() },
      { headers: cdnCacheHeaders(300, 900) },
    );
  } catch (err) {
    console.error('[river-alerts] failed:', err);
    // Degrade to an empty list at 200, like /api/gauges/map. A river page must
    // still render when the alert half is unavailable — and the note shipped
    // with this type tells the reader an empty list is not a guarantee.
    return NextResponse.json<RiverAlertsResponse>(
      { alerts: [], asOf: new Date().toISOString() },
      { headers: cdnCacheHeaders(60, 300) },
    );
  }
}
