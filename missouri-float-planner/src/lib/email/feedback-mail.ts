import { sanitizeRichText } from '@/lib/sanitize';
import { buildReplyText, htmlToText, renderReplyEmail } from './render';

export const REPLY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const DEFAULT_FEEDBACK_FROM = 'Evan from Eddy <hello@eddy.guide>';

export class FeedbackMailError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

export interface FeedbackMailRecord {
  id: string; user_email: string; message: string; context_name: string | null;
  created_at: string; email_thread_token: string;
}
export interface MailPayload {
  from: string; to: string; replyTo: string; subject: string;
  html: string; text: string; headers: Record<string, string>;
}
export interface FeedbackReplyRow {
  id: string; feedback_id: string; content_html: string; content_text: string;
  payload: MailPayload; status: 'sending' | 'sent' | 'failed';
  resend_id: string | null; message_id: string | null; error: string | null;
  created_at: string; sent_at: string | null;
}
export interface FeedbackInboundRow {
  id: string; from_address: string | null; message_id: string | null;
  subject: string | null; text_body: string | null; html_body: string | null;
  headers: Record<string, string> | null; created_at: string;
  resend_created_at: string | null; body_fetched: boolean; status: string;
}
export interface FeedbackMailStore {
  feedback(id: string): Promise<FeedbackMailRecord | null>;
  reply(id: string): Promise<FeedbackReplyRow | null>;
  replies(feedbackId: string): Promise<FeedbackReplyRow[]>;
  inbound(feedbackId: string): Promise<FeedbackInboundRow[]>;
  insert(row: FeedbackReplyRow): Promise<void>;
  update(id: string, patch: Partial<FeedbackReplyRow>, onlySending?: boolean): Promise<void>;
}
export interface FeedbackMailer {
  send(payload: MailPayload, key: string): Promise<{
    id?: string; error?: string; rejected?: boolean;
  }>;
  messageId(id: string): Promise<string | null>;
}

/** A single mailbox only. Reject lists and header injection. */
export function mailbox(value: string | null | undefined): string | null {
  if (!value || /[\r\n]/.test(value)) return null;
  const match = value.trim().match(/^(?:[^<>]*<([^<>]+)>|([^<>]+))$/);
  const address = (match?.[1] || match?.[2] || '').trim();
  return /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address) ? address.toLowerCase() : null;
}
export function feedbackFromAddress(configured?: string): string {
  const from = configured || DEFAULT_FEEDBACK_FROM;
  if (!mailbox(from)?.endsWith('@eddy.guide')) {
    throw new FeedbackMailError('Feedback replies need a verified @eddy.guide From address.', 503);
  }
  return from;
}
export function feedbackSubject(context: string | null): string {
  return `Re: Your Eddy feedback${context ? ` — ${context}` : ''}`.replace(/[\r\n]+/g, ' ').slice(0, 200);
}
export function feedbackReplyToken(addresses: string[]): string | null {
  const tokens = new Set(addresses.map(mailbox).map((address) =>
    address?.match(/^feedback\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@eddy\.guide$/)?.[1],
  ).filter((token): token is string => Boolean(token)));
  return tokens.size === 1 ? [...tokens][0] : null;
}
export function threadHeaders(messageId: string | null, prior?: string | null): Record<string, string> {
  if (!messageId || !/^<[^\s<>]+>$/.test(messageId)) return {};
  const refs = [...new Set([...(prior?.match(/<[^\s<>]+>/g) || []), messageId])].slice(-20);
  return { 'In-Reply-To': messageId, References: refs.join(' ') };
}

export async function sendFeedbackReply(
  store: FeedbackMailStore, mailer: FeedbackMailer,
  input: { feedbackId: string; replyId: string; html?: string },
  options: { from?: string; now?: Date } = {},
): Promise<FeedbackReplyRow> {
  const now = options.now ?? new Date();
  const feedback = await store.feedback(input.feedbackId);
  if (!feedback) throw new FeedbackMailError('Feedback not found.', 404);
  let row = await store.reply(input.replyId);
  if (row && row.feedback_id !== feedback.id) throw new FeedbackMailError('Reply belongs to another conversation.', 409);
  const safeHtml = input.html === undefined ? undefined : sanitizeRichText(input.html) || '';
  if (row && safeHtml !== undefined && safeHtml !== row.content_html) {
    throw new FeedbackMailError('This reply was already submitted with different content. Refresh the conversation.', 409);
  }
  if (row?.status === 'sent') return row;

  if (!row) {
    const text = safeHtml ? htmlToText(safeHtml).trim() : '';
    if (!text || !safeHtml) throw new FeedbackMailError('Write a reply before sending.', 400);
    if (text.length > 50000 || safeHtml.length > 100000) throw new FeedbackMailError('Reply is too long.', 400);
    const to = mailbox(feedback.user_email);
    if (!to) throw new FeedbackMailError('This feedback has no valid reply email address.', 422);
    const [incoming, replies] = await Promise.all([store.inbound(feedback.id), store.replies(feedback.id)]);
    const latestInbound = incoming.filter((email) => email.status !== 'spam').at(-1);
    const latestSent = replies.filter((reply) => reply.status === 'sent').at(-1);
    const original = latestInbound ? {
      from: latestInbound.from_address, date: latestInbound.resend_created_at || latestInbound.created_at,
      text: latestInbound.text_body || htmlToText(latestInbound.html_body || ''),
    } : { from: feedback.user_email, date: feedback.created_at, text: feedback.message };
    const priorReferences = latestInbound?.headers && Object.entries(latestInbound.headers)
      .find(([key]) => key.toLowerCase() === 'references')?.[1];
    const latestMessageId = latestInbound?.message_id || latestSent?.message_id || null;
    const payload: MailPayload = {
      from: feedbackFromAddress(options.from), to,
      replyTo: `feedback+${feedback.email_thread_token}@eddy.guide`,
      subject: latestSent?.payload.subject || feedbackSubject(feedback.context_name),
      html: renderReplyEmail(safeHtml, original), text: buildReplyText(text, original),
      headers: threadHeaders(latestMessageId, priorReferences),
    };
    row = {
      id: input.replyId, feedback_id: feedback.id, content_html: safeHtml, content_text: text,
      payload, status: 'sending', resend_id: null, message_id: null, error: null,
      created_at: now.toISOString(), sent_at: null,
    };
    try { await store.insert(row); }
    catch (error) {
      // Concurrent submissions of the same draft converge on the stored snapshot.
      const existing = await store.reply(input.replyId);
      if (!existing) throw error;
      return sendFeedbackReply(store, mailer, input, options);
    }
  }
  // Resend deduplicates for 24 hours. Never replay an uncertain send after that.
  if (now.getTime() - Date.parse(row.created_at) >= REPLY_RETRY_WINDOW_MS) {
    throw new FeedbackMailError('Retry window expired. Check this reply in Resend before sending another message.', 409);
  }
  await store.update(row.id, { status: 'sending', error: null });
  let result: Awaited<ReturnType<FeedbackMailer['send']>>;
  try { result = await mailer.send(row.payload, `feedback-reply/${row.id}`); }
  catch { result = { error: 'Sending could not be confirmed. Retry this saved reply to check safely.' }; }
  if (!result.id) {
    const message = result.error || 'Sending could not be confirmed. Retry this saved reply.';
    await store.update(row.id, { status: result.rejected ? 'failed' : 'sending', error: message }, true);
    throw new FeedbackMailError(message, 502);
  }
  const sent: FeedbackReplyRow = { ...row, status: 'sent', resend_id: result.id, sent_at: now.toISOString(), error: null };
  // Persist acceptance before optional provider metadata work. On DB failure the
  // saved snapshot/idempotency key remains available for safe reconciliation.
  await store.update(row.id, sent);
  try {
    const messageId = await mailer.messageId(result.id);
    if (messageId) { await store.update(row.id, { message_id: messageId }); sent.message_id = messageId; }
  } catch { /* Reply address still connects follow-ups if metadata lookup fails. */ }
  return sent;
}
