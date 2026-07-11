// src/app/api/embed/widgets/[embedId]/route.ts
// GET /api/embed/widgets/{embedId} — public branding payload for co-branded
// widgets (?e=<embedId>). Returns only the partner's display identity; the
// business address/location on the row is never exposed.

import { NextRequest, NextResponse } from 'next/server';
import { getEmbedBranding } from '@/lib/embed/cards';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ embedId: string }> }
): Promise<Response> {
  try {
    const rateLimitResult = await rateLimit(`embed-branding:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const { embedId } = await params;
    const branding = await getEmbedBranding(embedId);
    if (!branding) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(
      { branding },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } }
    );
  } catch (error) {
    console.error('Error in embed branding endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
