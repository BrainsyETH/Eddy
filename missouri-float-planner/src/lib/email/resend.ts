// src/lib/email/resend.ts
// Shared Resend client for eddy.guide email.
//
// Today this powers INBOUND mail: messages sent to *@eddy.guide are routed to
// Resend via the domain MX record and pushed to POST /api/webhooks/resend as
// signed `email.received` events (see that route). The same client also serves
// outbound/transactional sends if we add them later, so it lives here rather
// than inline in the route.

import { Resend } from 'resend';

let client: Resend | null = null;

/** True when a Resend API key is configured in the environment. */
export function hasResendApiKey(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Lazily-built singleton Resend client. Throws if RESEND_API_KEY is unset so a
 * misconfiguration is loud rather than a silent no-op. Call sites that must
 * tolerate a missing key should guard with hasResendApiKey() first.
 */
export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}
