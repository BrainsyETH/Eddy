// src/app/api/subscribe/route.ts
// POST /api/subscribe — Save email to Supabase email_subscribers table

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 subscriptions per IP per 15 minutes
    const rateLimitResult = rateLimit(`subscribe:${getClientIp(request)}`, 5, 15 * 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const { email, source } = body as { email?: string; source?: string };

    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'A valid email is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('email_subscribers')
      .upsert(
        { email: email.trim().toLowerCase(), source: source || 'unknown' },
        { onConflict: 'email' }
      );

    if (error) {
      console.error('Email subscribe error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to subscribe. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
