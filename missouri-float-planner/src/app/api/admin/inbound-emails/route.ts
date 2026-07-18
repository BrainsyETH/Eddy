// src/app/api/admin/inbound-emails/route.ts
// GET /api/admin/inbound-emails — list mail received at *@eddy.guide (admin only).
//
// Rows are written by the Resend inbound webhook (POST /api/webhooks/resend);
// this endpoint is the admin-panel read side, surfaced in the Feedback tab.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { mapInboundEmailRow } from '@/lib/email/inbound';
import type { InboundEmail, InboundEmailListResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['unread', 'read', 'archived', 'spam'];

export async function GET(request: NextRequest) {
  try {
    // Admin-only: same shared-secret bearer token as the rest of /api/admin/*.
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    // Service-role client: RLS hides inbound_emails from the anon client.
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = supabase
      .from('inbound_emails')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    // Unread count powers the sub-tab badge regardless of the active filter.
    const [{ data, count, error: fetchError }, { count: unreadCount }] = await Promise.all([
      query,
      supabase
        .from('inbound_emails')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'unread'),
    ]);

    if (fetchError) {
      console.error('Error fetching inbound emails:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch inbound emails' }, { status: 500 });
    }

    const emails: InboundEmail[] = (data || []).map(mapInboundEmailRow);

    return NextResponse.json({
      emails,
      total: count || 0,
      unread: unreadCount || 0,
    } as InboundEmailListResponse);
  } catch (error) {
    console.error('Error fetching inbound emails:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
