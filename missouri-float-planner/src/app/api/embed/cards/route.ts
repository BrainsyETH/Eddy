// src/app/api/embed/cards/route.ts
// POST /api/embed/cards — onboarding step 2 for location-pinned embed cards.
// Persists the confirmed pin (river + access point chosen in the workbench),
// fetches drive time once (Mapbox, cached on the row), and mints the public
// embed_id used in the iframe URL.

import { NextRequest, NextResponse } from 'next/server';
import { createEmbedCard } from '@/lib/embed/cards';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 5 creates per IP per minute — one business creates one card.
    const rateLimitResult = await rateLimit(`embed-create:${getClientIp(request)}`, 5, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json().catch(() => null);
    const lat = typeof body?.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body?.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
    const riverId = typeof body?.riverId === 'string' && UUID.test(body.riverId) ? body.riverId : null;
    const accessPointId =
      typeof body?.accessPointId === 'string' && UUID.test(body.accessPointId) ? body.accessPointId : null;

    if (lat === null || lng === null || !riverId || !accessPointId) {
      return NextResponse.json(
        { error: 'lat, lng, riverId and accessPointId are required' },
        { status: 400 }
      );
    }

    const card = await createEmbedCard({
      lat,
      lng,
      riverId,
      accessPointId,
      address: typeof body?.address === 'string' ? body.address : undefined,
      businessName: typeof body?.businessName === 'string' ? body.businessName : undefined,
      logoUrl: typeof body?.logoUrl === 'string' ? body.logoUrl : undefined,
      accentColor: typeof body?.accentColor === 'string' ? body.accentColor : undefined,
      ctaUrl: typeof body?.ctaUrl === 'string' ? body.ctaUrl : undefined,
      ctaLabel: typeof body?.ctaLabel === 'string' ? body.ctaLabel : undefined,
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Could not create the embed card for that location' },
        { status: 422 }
      );
    }

    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    console.error('Error in embed card create endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
