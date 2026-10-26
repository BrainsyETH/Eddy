import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/feedback/[id]/replies/route';
import { POST as receive } from '@/app/api/webhooks/resend/route';
import { createAdminToken } from '@/lib/admin-auth';
import { createHmac } from 'node:crypto';
import {
  feedbackFromAddress, feedbackReplyToken, mailbox, sendFeedbackReply, threadHeaders,
  type FeedbackMailStore, type FeedbackReplyRow, type FeedbackMailer, type FeedbackInboundRow,
} from './feedback-mail';
import { linkFeedbackEmail } from './feedback-mail-store';

const feedbackId = '11111111-1111-4111-8111-111111111111';
const replyId = '22222222-2222-4222-8222-222222222222';
const token = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-10-26T15:00:00Z');

function fixture() {
  const rows = new Map<string, FeedbackReplyRow>();
  const incoming: FeedbackInboundRow[] = [];
  const sends: { payload: unknown; key: string }[] = [];
  let failSave = false;
  const feedback = { id: feedbackId, user_email: 'person@example.com', message: 'Thanks for the app!', context_name: 'Current River', created_at: '2026-10-24T12:00:00Z', email_thread_token: token };
  const store: FeedbackMailStore = {
    async feedback(id) { return id === feedbackId ? structuredClone(feedback) : null; },
    async reply(id) { return rows.has(id) ? structuredClone(rows.get(id)!) : null; },
    async replies() { return structuredClone([...rows.values()]); },
    async inbound() { return structuredClone(incoming); },
    async insert(row) {
      if (rows.has(row.id) || [...rows.values()].some((item) => item.status === 'sending')) throw new Error('duplicate');
      rows.set(row.id, structuredClone(row));
    },
    async update(id, patch, onlySending) {
      if (patch.status === 'sent' && failSave) { failSave = false; throw new Error('database unavailable'); }
      const row = rows.get(id)!;
      if ((onlySending && row.status !== 'sending') || (patch.status === 'sending' && row.status === 'sent')) return;
      rows.set(id, structuredClone({ ...row, ...patch }));
    },
  };
  const mailer: FeedbackMailer = {
    async send(payload, key) { sends.push({ payload: structuredClone(payload), key }); return { id: 'provider-send-1' }; },
    async messageId() { return '<provider-send-1@mail.resend.com>'; },
  };
  return { store, mailer, rows, sends, feedback, incoming, failNextSave() { failSave = true; } };
}
const input = { feedbackId, replyId, html: '<p>Thank you for using Eddy!</p>' };

test('feedback reply uses saved recipient, brand shell, unique return address and persistent history', async () => {
  const f = fixture();
  const row = await sendFeedbackReply(f.store, f.mailer, input, { now });
  assert.equal(row.status, 'sent');
  assert.equal(row.payload.to, 'person@example.com');
  assert.equal(row.payload.from, 'Evan from Eddy <hello@eddy.guide>');
  assert.equal(row.payload.replyTo, `feedback+${token}@eddy.guide`);
  assert.match(row.payload.html, /Eddy_favicon.png/);
  assert.match(row.payload.text, /> Thanks for the app!/);
  assert.equal(f.rows.get(replyId)?.resend_id, 'provider-send-1');
  assert.equal(f.rows.get(replyId)?.message_id, '<provider-send-1@mail.resend.com>');
  // The store intentionally has no operation that changes feedback status.
  assert.equal(f.sends[0].key, `feedback-reply/${replyId}`);
});

test('repeated submission of a sent draft returns its saved result without sending again', async () => {
  const f = fixture();
  await sendFeedbackReply(f.store, f.mailer, input, { now });
  await sendFeedbackReply(f.store, f.mailer, input, { now });
  assert.equal(f.sends.length, 1);
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, { ...input, html: '<p>Different</p>' }, { now }), /different content/);
});

test('concurrent submissions use an identical provider payload and idempotency key', async () => {
  const f = fixture();
  const uniqueSends = new Map<string, unknown>();
  const originalSend = f.mailer.send;
  f.mailer.send = async (payload, key) => {
    if (uniqueSends.has(key)) assert.deepEqual(uniqueSends.get(key), payload);
    uniqueSends.set(key, structuredClone(payload));
    return originalSend(payload, key);
  };
  await Promise.all([sendFeedbackReply(f.store, f.mailer, input, { now }), sendFeedbackReply(f.store, f.mailer, input, { now })]);
  assert.equal(uniqueSends.size, 1);
  assert.equal(f.rows.size, 1);
  assert.equal(f.rows.get(replyId)?.status, 'sent');
});

test('a save failure after provider acceptance retries the exact stored payload', async () => {
  const f = fixture(); f.failNextSave();
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, input, { now }), /database unavailable/);
  assert.equal(f.rows.get(replyId)?.status, 'sending');
  f.feedback.message = 'Changed after sending';
  f.feedback.user_email = 'changed@example.com';
  await sendFeedbackReply(f.store, f.mailer, { feedbackId, replyId }, { now: new Date(now.getTime() + 1000) });
  assert.deepEqual(f.sends[0], f.sends[1]);
  assert.equal(f.rows.get(replyId)?.status, 'sent');
});

test('unknown sending outcome stays pending and expires before provider deduplication does', async () => {
  const f = fixture();
  f.mailer.send = async () => { throw new Error('timeout'); };
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, input, { now }), /could not be confirmed/);
  assert.equal(f.rows.get(replyId)?.status, 'sending');
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, { feedbackId, replyId }, { now: new Date(now.getTime() + 24 * 3600000) }), /Retry window expired/);
});

test('provider rejection is visible as not sent and can be retried with the same ID', async () => {
  const f = fixture();
  f.mailer.send = async () => ({ error: 'Domain not verified', rejected: true });
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, input, { now }), /Domain not verified/);
  assert.equal(f.rows.get(replyId)?.status, 'failed');
  f.mailer.send = async () => ({ id: 'accepted-after-setup' });
  await sendFeedbackReply(f.store, f.mailer, { feedbackId, replyId }, { now });
  assert.equal(f.rows.get(replyId)?.status, 'sent');
});

test('rejects empty sanitized content, oversized replies, invalid recipients and foreign reply IDs', async () => {
  const f = fixture();
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, { ...input, html: '<script>alert(1)</script>' }, { now }), /Write a reply/);
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, { ...input, html: 'x'.repeat(50001) }, { now }), /too long/);
  f.feedback.user_email = 'one@example.com,two@example.com';
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, input, { now }), /valid reply email/);
  f.feedback.user_email = 'person@example.com';
  await sendFeedbackReply(f.store, f.mailer, input, { now });
  f.rows.get(replyId)!.feedback_id = 'another-feedback-id';
  await assert.rejects(sendFeedbackReply(f.store, f.mailer, input, { now }), /another conversation/);
});

test('sanitizes reply HTML and threads follow-ups to the incoming message', async () => {
  const f = fixture();
  f.incoming.push({ id: 'inbound-1', from_address: 'Person <person@example.com>', message_id: '<incoming@example.com>',
    subject: 'Re: Your Eddy feedback', text_body: 'A follow-up question', html_body: null,
    headers: { References: '<prior@mail.resend.com>' }, created_at: now.toISOString(), resend_created_at: now.toISOString(), body_fetched: true, status: 'unread' });
  const row = await sendFeedbackReply(f.store, f.mailer, { ...input, html: '<p onclick="steal()">Hello<script>steal()</script></p>' }, { now });
  assert.equal(row.content_html, '<p>Hello</p>');
  assert.deepEqual(row.payload.headers, { 'In-Reply-To': '<incoming@example.com>', References: '<prior@mail.resend.com> <incoming@example.com>' });
  assert.match(row.payload.text, /> A follow-up question/);
});

test('reply addressing rejects header injection, foreign domains, ambiguous tokens and subject-only matches', () => {
  assert.equal(mailbox('Person <PERSON@example.com>'), 'person@example.com');
  assert.equal(mailbox('a@example.com\r\nBcc: b@example.com'), null);
  assert.throws(() => feedbackFromAddress('other@not-eddy.guide'), /@eddy.guide/);
  assert.throws(() => feedbackFromAddress('hello@eddy.guide.attacker.com'), /@eddy.guide/);
  assert.equal(feedbackReplyToken([`Feedback <feedback+${token}@eddy.guide>`]), token);
  assert.equal(feedbackReplyToken([`feedback+${token}@evil.com`]), null);
  assert.equal(feedbackReplyToken([`feedback+${token}@eddy.guide`, `feedback+${replyId}@eddy.guide`]), null);
  assert.equal(feedbackReplyToken(['hello@eddy.guide']), null);
  assert.deepEqual(threadHeaders('<bad>\r\nBcc:x@y.com'), {});
});

test('inbound linking needs both the exact token and the original sender; database failures propagate', async () => {
  const writes: unknown[] = [];
  let failLink = false;
  const db = createClient('https://fixture.supabase.co', 'test-key', { global: { fetch: async (url, init) => {
    if (init?.method === 'PATCH') {
      if (failLink) return Response.json({ message: 'link failed', code: 'XX000' }, { status: 500 });
      writes.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    }
    assert.match(String(url), new RegExp(`email_thread_token=eq.${token}`));
    return Response.json({ id: feedbackId, user_email: 'person@example.com' });
  } } });
  assert.equal(await linkFeedbackEmail(db, { emailId: 'in-1', from: 'Person <person@example.com>', recipients: [`feedback+${token}@eddy.guide`] }), feedbackId);
  assert.deepEqual(writes, [{ feedback_id: feedbackId }]);
  assert.equal(await linkFeedbackEmail(db, { emailId: 'in-2', from: 'attacker@example.com', recipients: [`feedback+${token}@eddy.guide`] }), null);
  assert.equal(await linkFeedbackEmail(db, { emailId: 'in-3', from: 'person@example.com', recipients: ['hello@eddy.guide'] }), null);
  assert.equal(writes.length, 1);
  failLink = true;
  await assert.rejects(linkFeedbackEmail(db, { emailId: 'in-4', from: 'person@example.com', recipients: [`feedback+${token}@eddy.guide`] }));
});

test('conversation routes require admin auth; cookie writes reject foreign origins', async () => {
  const previous = process.env.ADMIN_API_SECRET;
  process.env.ADMIN_API_SECRET = 'feedback-test-secret';
  try {
    const url = `https://eddy.guide/api/admin/feedback/${feedbackId}/replies`;
    const params = { params: Promise.resolve({ id: feedbackId }) };
    assert.equal((await GET(new NextRequest(url), params)).status, 401);
    assert.equal((await POST(new NextRequest(url, { method: 'POST' }), params)).status, 401);
    const { ADMIN_SESSION_COOKIE } = await import('@/lib/admin-auth');
    const request = new NextRequest(url, { method: 'POST', headers: { cookie: `${ADMIN_SESSION_COOKIE}=${createAdminToken()}`, origin: 'https://evil.example' }, body: '{}' });
    assert.equal((await POST(request, params)).status, 403);
  } finally { if (previous === undefined) delete process.env.ADMIN_API_SECRET; else process.env.ADMIN_API_SECRET = previous; }
});

test('admin POST and GET persist a reply, ignore recipient overrides, and expose safe history', async () => {
  const previous = { ...process.env };
  const realFetch = global.fetch;
  const f = fixture();
  let saved: FeedbackReplyRow | null = null;
  let providerCalls = 0;
  Object.assign(process.env, { ADMIN_API_SECRET: 'feedback-test-secret', RESEND_API_KEY: 're_test', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
  global.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes('api.resend.com')) {
      if (init?.method === 'POST') {
        providerCalls++;
        const payload = JSON.parse(String(init.body));
        assert.equal(payload.to, 'person@example.com');
        assert.equal(payload.reply_to, `feedback+${token}@eddy.guide`);
        assert.equal(new Headers(init.headers).get('idempotency-key'), `feedback-reply/${replyId}`);
        return Response.json({ id: 'sent-integration' });
      }
      return Response.json({ id: 'sent-integration', message_id: '<sent-integration@resend.com>' });
    }
    if (target.includes('/feedback?')) return Response.json(f.feedback);
    if (target.includes('/inbound_emails?')) return Response.json([]);
    if (init?.method === 'POST') {
      saved = JSON.parse(String(init.body));
      return new Response(null, { status: 201 });
    }
    if (init?.method === 'PATCH') {
      saved = { ...saved!, ...JSON.parse(String(init.body)) };
      return new Response(null, { status: 204 });
    }
    return Response.json(target.includes('feedback_id=') ? (saved ? [saved] : []) : saved);
  };
  try {
    const url = `https://eddy.guide/api/admin/feedback/${feedbackId}/replies`;
    const headers = { authorization: `Bearer ${createAdminToken()}` };
    const context = { params: Promise.resolve({ id: feedbackId }) };
    const request = () => new NextRequest(url, { method: 'POST', headers, body: JSON.stringify({ ...input, to: 'attacker@example.com', from: 'attacker@example.com' }) });
    const sent = await POST(request(), context);
    assert.equal(sent.status, 200, await sent.clone().text());
    assert.equal((await sent.json()).message.status, 'sent');
    assert.equal((await POST(request(), context)).status, 200);
    assert.equal(providerCalls, 1);
    const history = await GET(new NextRequest(url, { headers }), context);
    assert.equal(history.status, 200);
    assert.equal(history.headers.get('cache-control'), 'private, no-store');
    const body = await history.json();
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].sendId, 'sent-integration');
    assert.equal(body.messages[0].payload, undefined);
    assert.equal(body.messages[0].text, 'Thank you for using Eddy!');
  } finally { global.fetch = realFetch; process.env = previous; }
});

test('signed webhook retries body failures and duplicate deliveries preserve triage state', async () => {
  const previous = { ...process.env };
  const realFetch = global.fetch;
  const secret = Buffer.from('webhook-test-secret').toString('base64');
  Object.assign(process.env, { RESEND_API_KEY: 're_test', RESEND_WEBHOOK_SECRET: `whsec_${secret}`, NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
  let bodyFailure = true;
  let inserts = 0;
  let bodyUpdates = 0;
  global.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes('api.resend.com')) {
      return bodyFailure ? Response.json({ name: 'internal_server_error', message: 'temporary outage' }, { status: 500 }) : Response.json({ text: 'Customer reply', html: '<p>Customer reply</p>', reply_to: [], headers: {}, attachments: [] });
    }
    if (target.includes('/feedback?')) return Response.json({ id: feedbackId, user_email: 'person@example.com' });
    if (init?.method === 'POST') {
      inserts++;
      assert.match(String(new Headers(init.headers).get('prefer')), /resolution=ignore-duplicates/);
      assert.equal(JSON.parse(String(init.body)).status, undefined);
    }
    if (init?.method === 'PATCH' && String(init.body).includes('body_fetched')) bodyUpdates++;
    return new Response(null, { status: 204 });
  };
  const event = JSON.stringify({ type: 'email.received', data: { email_id: 'inbound-test', message_id: '<incoming@example.com>', from: 'person@example.com', to: [`feedback+${token}@eddy.guide`], received_for: [], subject: 'Re: feedback', created_at: now.toISOString() } });
  const request = (signed: boolean) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', Buffer.from(secret, 'base64')).update(`msg-test.${timestamp}.${event}`).digest('base64');
    return new NextRequest('https://eddy.guide/api/webhooks/resend', { method: 'POST', body: event, headers: signed ? { 'svix-id': 'msg-test', 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` } : {} });
  };
  try {
    assert.equal((await receive(request(false))).status, 400);
    assert.equal(inserts, 0);
    assert.equal((await receive(request(true))).status, 503);
    bodyFailure = false;
    assert.equal((await receive(request(true))).status, 200);
    assert.equal(inserts, 2);
    assert.equal(bodyUpdates, 1);
  } finally { global.fetch = realFetch; process.env = previous; }
});
