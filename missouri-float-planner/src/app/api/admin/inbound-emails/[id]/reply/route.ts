// src/app/api/admin/inbound-emails/[id]/reply/route.ts
// POST /api/admin/inbound-emails/[id]/reply — send a reply to a received message
// from eddy.guide via Resend, threaded to the original, as branded HTML.
//
// Accepts either `html` (rich text from the admin editor) or `body` (plain
// text). The content is sanitized, wrapped in the Eddy email shell, and sent
// with a plain-text fallback. Requires the domain verified for SENDING and
// RESEND_API_KEY set. From defaults to the eddy.guide address the message was
// delivered to; override with RESEND_REPLY_FROM.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import { getResendClient, hasResendApiKey, pickReplyFromAddress } from '@/lib/email/resend';
import { mapInboundEmailRow } from '@/lib/email/inbound';
import { sanitizeRichText } from '@/lib/sanitize';
import { renderReplyEmail, buildReplyText, htmlToText, escapeHtml, type OriginalMessage } from '@/lib/email/render';

export const dynamic = 'force-dynamic';

const MAX_REPLY_LENGTH = 50000;

/** Prefix a subject with "Re: " unless it already has one. */
function replySubject(subject: string | null): string {
  const base = (subject || '').trim();
  if (!base) return 'Re:';
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

/** Turn a plain-text reply into simple paragraph HTML. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
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
    const rawHtml: string | undefined = typeof body?.html === 'string' ? body.html : undefined;
    const rawText: string | undefined = typeof body?.body === 'string' ? body.body : undefined;
    const fromOverride: string | undefined = body?.from;

    // Resolve the reply content into sanitized HTML + a plain-text version.
    let safeHtml: string;
    let contentText: string;
    if (rawHtml && htmlToText(rawHtml).trim()) {
      safeHtml = sanitizeRichText(rawHtml) || '';
      contentText = htmlToText(safeHtml);
    } else if (rawText && rawText.trim()) {
      safeHtml = textToHtml(rawText);
      contentText = rawText;
    } else {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }

    if (contentText.length > MAX_REPLY_LENGTH) {
      return NextResponse.json({ error: 'Reply is too long' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: row, error: fetchError } = await supabase
      .from('inbound_emails')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const to: string | null = row.from_address;
    if (!to) {
      return NextResponse.json(
        { error: 'Original message has no sender address to reply to.' },
        { status: 422 }
      );
    }

    const from =
      (fromOverride && fromOverride.includes('@') ? fromOverride : null) ||
      pickReplyFromAddress([...(row.received_for ?? []), ...(row.to_addresses ?? [])]);

    if (!from) {
      return NextResponse.json(
        {
          error:
            'No eddy.guide From address found for this message. Set RESEND_REPLY_FROM (e.g. hello@eddy.guide).',
        },
        { status: 422 }
      );
    }

    const original: OriginalMessage = {
      from: row.from_address,
      date: row.resend_created_at || row.created_at,
      text: row.text_body,
    };

    // Thread the reply to the original via standard headers.
    const headers: Record<string, string> = {};
    if (row.message_id) {
      headers['In-Reply-To'] = row.message_id;
      headers['References'] = row.message_id;
    }

    const resend = getResendClient();
    const { data: sent, error: sendError } = await resend.emails.send({
      from,
      to,
      subject: replySubject(row.subject),
      replyTo: from,
      html: renderReplyEmail(safeHtml, original),
      text: buildReplyText(contentText, original),
      ...(Object.keys(headers).length ? { headers } : {}),
    });

    if (sendError) {
      console.error('[InboundReply] Resend send failed:', sendError);
      return NextResponse.json(
        { error: `Failed to send reply: ${sendError.message || 'unknown error'}` },
        { status: 502 }
      );
    }

    // Mark replied + read (a reply implies the message has been handled).
    const { data: updated } = await supabase
      .from('inbound_emails')
      .update({
        last_replied_at: new Date().toISOString(),
        status: row.status === 'unread' ? 'read' : row.status,
      })
      .eq('id', id)
      .select('*')
      .single();

    return NextResponse.json({
      email: mapInboundEmailRow(updated ?? row),
      sendId: sent?.id ?? null,
    });
  } catch (error) {
    console.error('[InboundReply] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
