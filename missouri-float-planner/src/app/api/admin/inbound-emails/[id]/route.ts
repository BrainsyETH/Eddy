// src/app/api/admin/inbound-emails/[id]/route.ts
// PATCH /api/admin/inbound-emails/[id] — update an inbound email's triage status.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import type { InboundEmail } from '@/types/api';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['unread', 'read', 'archived', 'spam'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();

    const body = await request.json();
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('inbound_emails')
      .update({ status: body.status })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error updating inbound email:', error);
      return NextResponse.json({ error: 'Failed to update inbound email' }, { status: 500 });
    }

    const email: InboundEmail = {
      id: data.id,
      emailId: data.email_id,
      messageId: data.message_id,
      fromAddress: data.from_address,
      toAddresses: data.to_addresses ?? [],
      ccAddresses: data.cc_addresses ?? [],
      bccAddresses: data.bcc_addresses ?? [],
      receivedFor: data.received_for ?? [],
      replyTo: data.reply_to ?? [],
      subject: data.subject,
      textBody: data.text_body,
      htmlBody: data.html_body,
      attachments: data.attachments ?? [],
      bodyFetched: data.body_fetched ?? false,
      status: data.status,
      resendCreatedAt: data.resend_created_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ email });
  } catch (error) {
    console.error('Error updating inbound email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
