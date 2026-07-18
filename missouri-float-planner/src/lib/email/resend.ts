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

/** The domain we receive (and reply from) inbound mail on. */
export const EDDY_EMAIL_DOMAIN = 'eddy.guide';

/**
 * Chooses the From address for a reply. A reply must come from an address on a
 * domain verified for *sending* in Resend, so we prefer the eddy.guide address
 * the original message was delivered to (best for threading + recognizability),
 * then fall back to RESEND_REPLY_FROM, then a plausible default on the domain.
 *
 * `candidates` are the original message's received-for / to addresses, which may
 * be bare ("hi@eddy.guide") or display-name form ("Eddy <hi@eddy.guide>").
 */
export function pickReplyFromAddress(candidates: string[]): string | null {
  const domain = EDDY_EMAIL_DOMAIN.replace('.', '\\.');
  const re = new RegExp(`[^\\s<>"]+@${domain}`, 'i');
  for (const candidate of candidates) {
    const match = candidate?.match(re);
    if (match) return match[0];
  }
  return process.env.RESEND_REPLY_FROM || null;
}
