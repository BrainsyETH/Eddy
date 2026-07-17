// src/app/api/webhooks/resend/route.ts
// POST /api/webhooks/resend — Resend inbound-email webhook receiver.
//
// Mail addressed to *@eddy.guide is delivered to Resend via the domain MX
// record and forwarded here as a signed `email.received` event.
//
// IMPORTANT — the webhook body contains only ENVELOPE METADATA (from / to /
// subject / ids), never the message body or attachment contents. We persist the
// metadata immediately, then best-effort fetch the full body via the Received
// Emails API and backfill it. See supabase migration 00169_inbound_emails.
//
// This route is intentionally PUBLIC — it lives outside /api/admin, so the
// middleware Bearer gate does not apply. Resend calls it unauthenticated;
// authenticity is proven by the Svix signature instead. We MUST verify against
// the RAW request body, so read request.text() and never JSON-parse first.

import { NextRequest, NextResponse } from 'next/server';
import type { WebhookEventPayload } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResendClient, hasResendApiKey } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  // Fail closed if we cannot verify authenticity (webhook secret) or fetch
  // bodies (API key). A 500 makes Resend retry and surfaces the misconfig.
  if (!webhookSecret || !hasResendApiKey()) {
    console.error('[ResendWebhook] Missing RESEND_WEBHOOK_SECRET or RESEND_API_KEY');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Raw body is REQUIRED for signature verification — do not parse it first.
  const payload = await request.text();

  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  const resend = getResendClient();

  // verify() validates the Svix signature against the raw body and returns the
  // parsed, trusted event. It is synchronous and throws on an invalid or
  // expired signature — a forged request never gets past this point.
  let event: WebhookEventPayload;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch (err) {
    console.warn('[ResendWebhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Acknowledge (200) any event type we don't handle — e.g. if this endpoint is
  // ever also subscribed to email.delivered / email.bounced — so Resend does
  // not retry it.
  if (event.type !== 'email.received') {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const data = event.data;
  const supabase = createAdminClient();

  // Idempotent upsert keyed on Resend's email_id: a redelivered webhook becomes
  // a no-op instead of a duplicate row. The service-role client bypasses RLS.
  const { error: insertError } = await supabase
    .from('inbound_emails')
    .upsert(
      {
        email_id: data.email_id,
        message_id: data.message_id,
        from_address: data.from,
        to_addresses: data.to ?? [],
        cc_addresses: data.cc ?? [],
        bcc_addresses: data.bcc ?? [],
        received_for: data.received_for ?? [],
        subject: data.subject,
        resend_created_at: data.created_at,
        raw_event: event,
      },
      { onConflict: 'email_id', ignoreDuplicates: true },
    );

  if (insertError) {
    // Log and 500 so Resend retries; idempotent double-processing is preferable
    // to silently dropping an inbound message.
    console.error('[ResendWebhook] Failed to persist inbound email:', insertError);
    return NextResponse.json({ error: 'Failed to persist email' }, { status: 500 });
  }

  // Best-effort backfill of the full body / headers / attachment metadata, which
  // the webhook does NOT include. Never fail the webhook over this: the envelope
  // is already stored, and a 200 avoids needless Resend retries. `body_fetched`
  // stays false so a later job can retry the fetch.
  try {
    const { data: full, error: fetchError } = await resend.emails.receiving.get(data.email_id);
    if (full) {
      await supabase
        .from('inbound_emails')
        .update({
          text_body: full.text,
          html_body: full.html,
          reply_to: full.reply_to ?? [],
          headers: full.headers ?? null,
          attachments: full.attachments ?? [],
          body_fetched: true,
        })
        .eq('email_id', data.email_id);
    } else if (fetchError) {
      console.warn('[ResendWebhook] Could not fetch full email body:', fetchError);
    }
  } catch (err) {
    console.warn('[ResendWebhook] Body fetch threw (metadata already saved):', err);
  }

  return NextResponse.json({ ok: true, email_id: data.email_id });
}
