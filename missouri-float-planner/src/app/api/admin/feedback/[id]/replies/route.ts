import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResendClient, hasResendApiKey } from '@/lib/email/resend';
import { feedbackFromAddress, feedbackSubject, FeedbackMailError, sendFeedbackReply, REPLY_RETRY_WINDOW_MS, type FeedbackReplyRow } from '@/lib/email/feedback-mail';
import { feedbackMailStore } from '@/lib/email/feedback-mail-store';
import { htmlToText } from '@/lib/email/render';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };

function replyView(row: FeedbackReplyRow) {
  return {
    id: row.id, direction: 'outbound' as const, from: row.payload.from, to: row.payload.to,
    text: row.content_text, status: row.status, error: row.error,
    createdAt: row.created_at, sentAt: row.sent_at, sendId: row.resend_id,
    retryUntil: new Date(Date.parse(row.created_at) + REPLY_RETRY_WINDOW_MS).toISOString(),
  };
}
function failure(error: unknown) {
  if (!(error instanceof FeedbackMailError)) console.error('[FeedbackMail]', error);
  return NextResponse.json({ error: error instanceof FeedbackMailError ? error.message :
    'Could not save or load the conversation. Refresh before retrying; the reply may already have been sent.' },
  { status: error instanceof FeedbackMailError ? error.status : 500, headers: noStore });
}

export async function GET(request: NextRequest, { params }: Context) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  if (!isValidUUID(id)) return invalidIdResponse();
  try {
    const store = feedbackMailStore(createAdminClient());
    const feedback = await store.feedback(id);
    if (!feedback) throw new FeedbackMailError('Feedback not found.', 404);
    const [outgoing, incoming] = await Promise.all([store.replies(id), store.inbound(id)]);
    const messages = [
      ...outgoing.map(replyView),
      ...incoming.filter((email) => email.status !== 'spam').map((email) => ({
        id: email.id, direction: 'inbound' as const, from: email.from_address, to: null,
        text: email.text_body || htmlToText(email.html_body || ''),
        status: email.body_fetched ? 'received' : 'loading_body', error: null,
        createdAt: email.resend_created_at || email.created_at, sentAt: null, sendId: null, retryUntil: null,
      })),
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let from: string | null = null;
    let configurationError: string | null = null;
    try { from = feedbackFromAddress(process.env.RESEND_REPLY_FROM); }
    catch (error) { configurationError = error instanceof Error ? error.message : 'Sender is not configured.'; }
    if (!hasResendApiKey()) configurationError = 'Email sending is not configured.';
    return NextResponse.json({ messages, from, to: feedback.user_email,
      subject: outgoing.find((reply) => reply.status === 'sent')?.payload.subject || feedbackSubject(feedback.context_name),
      configurationError }, { headers: noStore });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  if (!isValidUUID(id)) return invalidIdResponse();
  try {
    if (!hasResendApiKey()) throw new FeedbackMailError('Email sending is not configured.', 503);
    const raw = await request.text();
    if (raw.length > 110000) throw new FeedbackMailError('Reply is too long.', 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new FeedbackMailError('Invalid reply request.', 400); }
    if (!body || typeof body.replyId !== 'string' || !isValidUUID(body.replyId) ||
        (body.html !== undefined && typeof body.html !== 'string')) {
      throw new FeedbackMailError('A valid reply ID and message are required.', 400);
    }
    const resend = getResendClient();
    const row = await sendFeedbackReply(feedbackMailStore(createAdminClient()), {
      async send(payload, key) {
        const { data, error } = await resend.emails.send(payload, { idempotencyKey: key });
        return error ? { error: `Could not send reply: ${error.message}`,
          // Network errors, rate limits and conflicts can be ambiguous. Keep the
          // saved send pending so another draft cannot accidentally duplicate it.
          rejected: ['validation_error', 'invalid_access', 'missing_api_key', 'invalid_api_key', 'restricted_api_key'].includes(error.name),
        } : { id: data?.id };
      },
      async messageId(sendId) {
        const { data } = await resend.emails.get(sendId);
        return data && 'message_id' in data && typeof data.message_id === 'string' ? data.message_id : null;
      },
    }, { feedbackId: id, replyId: body.replyId, html: body.html }, { from: process.env.RESEND_REPLY_FROM });
    return NextResponse.json({ message: replyView(row) }, { headers: noStore });
  } catch (error) { return failure(error); }
}
