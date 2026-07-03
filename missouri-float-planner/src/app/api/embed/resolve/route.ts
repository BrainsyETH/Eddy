// src/app/api/embed/resolve/route.ts
// POST /api/embed/resolve — onboarding step 1 for location-pinned embed cards.
// Geocodes the embedder's business address (or accepts raw coords) and returns
// candidate rivers + launch points for them to confirm. Tightly rate-limited:
// each call can cost a Mapbox geocode.

import { NextRequest, NextResponse } from 'next/server';
import { resolveEmbedLocation } from '@/lib/embed/cards';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 10 requests per IP per minute — onboarding is a handful of calls, ever.
    const rateLimitResult = await rateLimit(`embed-resolve:${getClientIp(request)}`, 10, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json().catch(() => null);
    const address = typeof body?.address === 'string' ? body.address.trim().slice(0, 300) : undefined;
    const lat = typeof body?.lat === 'number' && Number.isFinite(body.lat) ? body.lat : undefined;
    const lng = typeof body?.lng === 'number' && Number.isFinite(body.lng) ? body.lng : undefined;

    if (!address && (lat === undefined || lng === undefined)) {
      return NextResponse.json(
        { error: 'Provide an address or lat/lng' },
        { status: 400 }
      );
    }

    const resolved = await resolveEmbedLocation({ address, lat, lng });
    if (!resolved) {
      return NextResponse.json(
        { error: 'Could not resolve that location to a nearby float river' },
        { status: 404 }
      );
    }

    return NextResponse.json(resolved);
  } catch (error) {
    console.error('Error in embed resolve endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
