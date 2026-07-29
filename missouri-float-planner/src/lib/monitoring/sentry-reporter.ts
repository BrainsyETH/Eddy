// src/lib/monitoring/sentry-reporter.ts
// Sentry, wired through the existing setErrorReporter() seam in src/lib/logger.
//
// The seam was built for this — logger.ts's header says there is "exactly ONE
// place to wire Sentry/Datadog/etc. later" — so nothing here needs to touch the
// ~500 logging call sites. Registering a reporter makes every
// logger.error()/captureException() call start shipping.
//
// Same Sentry organisation as the iOS app, deliberately: one project family
// covers both halves of Eddy, and an error that crosses the API boundary is
// legible in one place rather than two.
//
// ── Nothing leaves unredacted ─────────────────────────────────────────────
//
// beforeSend runs the whole event through the same REDACTIONS table the webhook
// reporter uses (redactText), which strips emails, bearer values, JWT-shaped
// triples, long hex blobs and key=value secrets. Sentry's own server-side
// scrubbing is one more layer, not the first one: by the time it applies, the
// data has already left this process.
//
// This matters more on the server than it looks. Supabase access tokens ride in
// Authorization headers, RevenueCat webhooks carry an app user id, and
// onRequestError paths routinely stringify request context.
//
// ── Merging dark is safe ──────────────────────────────────────────────────
//
// With no SENTRY_DSN the SDK is never initialised and this module is never
// imported — the same property the iOS side relies on, and why this can land
// before the project exists.

import type { LogContext } from '@/lib/logger';
import { redactText } from '@/lib/monitoring/webhook-reporter';

type SentryLike = {
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void;
};

/** Redact a context bag one value at a time, preserving its shape for grouping. */
function redactContext(context: LogContext | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] =
      typeof value === 'string'
        ? redactText(value)
        : typeof value === 'number' || typeof value === 'boolean' || value == null
          ? value
          : redactText(String(value));
  }
  return out;
}

/**
 * An ErrorReporter backed by Sentry.
 *
 * Takes the SDK rather than importing it, so this module is unit-testable and
 * so the caller owns the dynamic import — @sentry/nextjs must not be pulled
 * into the bundle of a deployment that has no DSN.
 */
export function createSentryReporter(sentry: SentryLike) {
  return (error: unknown, context?: LogContext): void => {
    const extra = redactContext(context);
    // The message on a plain Error is the most common carrier of a leaked
    // value — "could not fetch profile for someone@example.com" — and Sentry
    // groups on it, so redacting here also stops one user's email minting its
    // own issue.
    if (error instanceof Error) {
      const scrubbed = new Error(redactText(error.message));
      scrubbed.name = error.name;
      scrubbed.stack = error.stack ? redactText(error.stack) : undefined;
      sentry.captureException(scrubbed, extra ? { extra } : undefined);
      return;
    }
    sentry.captureException(
      new Error(redactText(typeof error === 'string' ? error : String(error))),
      extra ? { extra } : undefined,
    );
  };
}
