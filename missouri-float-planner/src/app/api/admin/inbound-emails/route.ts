// src/app/api/admin/inbound-emails/route.ts
// GET /api/admin/inbound-emails — list mail received at *@eddy.guide (admin only).
//
// Rows are written by the Resend inbound webhook (POST /api/webhooks/resend);
// this endpoint is the admin-panel read side, surfaced in the Feedback tab.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  countUnreadInboundEmails,
  mapInboundEmailRow,
  parseBulkEmailUpdate,
} from '@/lib/email/inbound';
import { literalContains } from '@/lib/admin/list-filters';
import { withAdminMutation } from '@/lib/admin/mutation-audit';
import type { InboundEmail, InboundEmailListResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['unread', 'read', 'archived', 'spam'];

export async function GET(request: NextRequest) {
  try {
    // Admin-only: same shared-secret bearer token as the rest of /api/admin/*.
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    // Service-role client: RLS hides inbound_emails from the anon client.
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    let query = supabase
      .from('inbound_emails')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    // Literal search over who sent it and what it says.
    const search = (searchParams.get('q') ?? '').trim().slice(0, 200);
    if (search) {
      const value = literalContains(search);
      query = query.or(
        `subject.ilike.${value},from_address.ilike.${value},text_body.ilike.${value}`,
      );
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

/**
 * PATCH /api/admin/inbound-emails — set one triage status on several messages
 * at once ({ ids, status }). Returns how many changed and the unread count.
 */
async function handlePATCH(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;
    const parsed = parseBulkEmailUpdate(await request.json().catch(() => null));
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('inbound_emails')
      .update({ status: parsed.status })
      .in('id', parsed.ids)
      .select('id');
    if (error) {
      console.error('Error bulk-updating inbound emails:', error);
      return NextResponse.json({ error: 'Failed to update messages' }, { status: 500 });
    }
    return NextResponse.json({
      updated: data?.length ?? 0,
      unread: await countUnreadInboundEmails(supabase),
    });
  } catch (error) {
    console.error('Error bulk-updating inbound emails:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PATCH = withAdminMutation(handlePATCH);
