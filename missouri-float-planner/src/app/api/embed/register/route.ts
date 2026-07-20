// src/app/api/embed/register/route.ts
// POST /api/embed/register — branding-only registration for co-branded
// widgets. No address/pin needed (that's the card's onboarding); a business
// name is enough to mint an embed_id that any widget accepts via ?e=.

import { NextRequest, NextResponse } from 'next/server';
import { createEmbedBranding } from '@/lib/embed/cards';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 5 registrations per IP per minute — one business registers once.
    const rateLimitResult = await rateLimit(`embed-register:${getClientIp(request)}`, 5, 60 * 1000, { failClosed: true });
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json().catch(() => null);
    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : '';
    if (!businessName) {
      return NextResponse.json({ error: 'businessName is required' }, { status: 400 });
    }

    const result = await createEmbedBranding({
      businessName,
      siteUrl: typeof body?.siteUrl === 'string' ? body.siteUrl : undefined,
      logoUrl: typeof body?.logoUrl === 'string' ? body.logoUrl : undefined,
      accentColor: typeof body?.accentColor === 'string' ? body.accentColor : undefined,
    });

    if (!result) {
      return NextResponse.json({ error: 'Could not create your branding' }, { status: 422 });
    }

    return NextResponse.json({ branding: result }, { status: 201 });
  } catch (error) {
    console.error('Error in embed register endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
