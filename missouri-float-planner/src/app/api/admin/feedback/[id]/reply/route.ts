import { withAdminMutation } from '@/lib/admin/mutation-audit';
// src/app/api/admin/feedback/[id]/reply/route.ts
// POST /api/admin/feedback/[id]/reply — email the person who submitted feedback.
//
// Same sending path as inbound-email replies (sanitized rich text in the Eddy
// shell, plain-text fallback, their message quoted). From is RESEND_REPLY_FROM
// or the published support address, so their answer lands in the Inbox.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAdminIdentity,
  requireAdminAuth,
  isValidUUID,
  invalidIdResponse,
} from '@/lib/admin-auth';
import { getResendClient, hasResendApiKey } from '@/lib/email/resend';
import { sanitizeRichText } from '@/lib/sanitize';
import { renderReplyEmail, buildReplyText, htmlToText } from '@/lib/email/render';
import {
  FEEDBACK_REPLY_SUBJECT,
  feedbackReplyFrom,
  mapFeedbackRow,
} from '@/lib/feedback/admin';

export const dynamic = 'force-dynamic';

const MAX_REPLY_LENGTH = 50000;

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    if (!hasResendApiKey()) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured — cannot send replies.' },
        { status: 500 }
      );
    }

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();

    const body = await request.json().catch(() => null);
    const rawHtml = typeof body?.html === 'string' ? body.html : '';
    if (!htmlToText(rawHtml).trim()) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }
    const safeHtml = sanitizeRichText(rawHtml) || '';
    const contentText = htmlToText(safeHtml);
    if (!contentText.trim()) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }
    if (contentText.length > MAX_REPLY_LENGTH) {
      return NextResponse.json({ error: 'Reply is too long' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row, error: fetchError } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) {
      return NextResponse.json({ error: 'Could not load feedback' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    const from = feedbackReplyFrom();
    const original = {
      from: row.user_name ? `${row.user_name} <${row.user_email}>` : row.user_email,
      date: row.created_at,
      text: row.message,
    };

    const { data: sent, error: sendError } = await getResendClient().emails.send({
      from,
      to: row.user_email,
      subject: FEEDBACK_REPLY_SUBJECT,
      replyTo: from,
      html: renderReplyEmail(safeHtml, original),
      text: buildReplyText(contentText, original),
    });
    if (sendError) {
      console.error('[FeedbackReply] Resend send failed:', sendError);
      return NextResponse.json(
        { error: `Failed to send reply: ${sendError.message || 'unknown error'}` },
        { status: 502 }
      );
    }

    // The email is out. Record it; a reply means a pending item has been seen.
    const reviewer = getAdminIdentity(request)?.name ?? 'Owner recovery';
    const now = new Date().toISOString();
    const reviewed =
      row.status === 'pending'
        ? { status: 'reviewed', reviewed_at: now, reviewed_by: reviewer }
        : {};
    const { data: recorded, error: updateError } = await supabase
      .from('feedback')
      .update({ ...reviewed, last_replied_at: now, last_replied_by: reviewer, updated_at: now })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    let updated = recorded;
    let warning: string | null = null;
    if (updateError) {
      // Most likely the reply-tracking migration is not applied yet. Never
      // report a sent email as failed: keep the status change and say so.
      console.error('[FeedbackReply] Could not record reply:', updateError);
      warning = 'Reply sent, but the reply time could not be recorded.';
      ({ data: updated } = await supabase
        .from('feedback')
        .update({ ...reviewed, updated_at: now })
        .eq('id', id)
        .select('*')
        .maybeSingle());
    }

    return NextResponse.json({
      feedback: mapFeedbackRow(updated ?? row),
      sendId: sent?.id ?? null,
      from,
      warning,
    });
  } catch (error) {
    console.error('[FeedbackReply] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAdminMutation(handlePOST);
