// src/lib/monitoring/webhook-reporter.ts
// Zero-dependency error-monitoring sink for the logger's setErrorReporter()
// seam (audit F19). POSTs a redacted, deduplicated JSON payload to a generic
// webhook (ERROR_WEBHOOK_URL) — a Slack incoming webhook works out of the box
// via the `text` field; any JSON collector can read the structured fields.
// Swapping in Sentry/Datadog later means replacing this reporter in
// instrumentation.ts; nothing else changes.

import type { LogContext } from '@/lib/logger';
import { redactText } from '@/lib/monitoring/redact';

// One report per fingerprint per cooldown, and a global per-minute cap, so an
// error storm (e.g. a failing dependency on every request) cannot flood the
// webhook or add meaningful request latency.
const FINGERPRINT_COOLDOWN_MS = 5 * 60 * 1000;
const GLOBAL_CAP_PER_MINUTE = 10;
const STACK_LIMIT = 4_000;
const VALUE_LIMIT = 500;

// Redaction: the audit requires monitoring "with redaction" — strip likely
// secrets and personal data before anything leaves the process.
//
// The table itself now lives in ./redact so the browser Sentry client can share
// it without pulling this module's sink into every page's bundle. Re-exported
// rather than moved-and-rewired: sentry-reporter.ts and redact.test.ts both
// import it from here, and the point of the extraction was to add a consumer,
// not to churn the existing ones.
export { redactText };

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const s = redactText(value);
    return s.length > VALUE_LIMIT ? `${s.slice(0, VALUE_LIMIT)}…` : s;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  return redactText(String(value)).slice(0, VALUE_LIMIT);
}

function redactContext(context?: LogContext): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = redactValue(value);
  }
  return out;
}

interface ReporterState {
  lastSentByFingerprint: Map<string, number>;
  windowStart: number;
  sentInWindow: number;
}

/**
 * Create the webhook reporter. Never throws and never blocks the request path:
 * delivery is fire-and-forget with a short timeout, and failures are silent
 * (reporting an error must not create new errors).
 */
export function createWebhookReporter(
  webhookUrl: string,
  deps: { now?: () => number; send?: typeof fetch } = {},
): (error: unknown, context?: LogContext) => void {
  const now = deps.now ?? Date.now;
  const send = deps.send ?? fetch;
  const state: ReporterState = {
    lastSentByFingerprint: new Map(),
    windowStart: 0,
    sentInWindow: 0,
  };

  return (error: unknown, context?: LogContext): void => {
    try {
      const err = error instanceof Error ? error : new Error(String(error));
      const message = redactText(err.message || 'Unknown error').slice(0, VALUE_LIMIT);
      const fingerprint = `${err.name}:${message.split('\n')[0]}`;
      const ts = now();

      // Per-fingerprint cooldown (undefined = never sent, always allowed)
      const last = state.lastSentByFingerprint.get(fingerprint);
      if (last !== undefined && ts - last < FINGERPRINT_COOLDOWN_MS) return;

      // Global cap per minute
      if (ts - state.windowStart >= 60_000) {
        state.windowStart = ts;
        state.sentInWindow = 0;
      }
      if (state.sentInWindow >= GLOBAL_CAP_PER_MINUTE) return;

      state.lastSentByFingerprint.set(fingerprint, ts);
      state.sentInWindow += 1;
      // Bound the dedup map so a high-cardinality fingerprint leak can't grow it forever.
      if (state.lastSentByFingerprint.size > 500) {
        const oldest = state.lastSentByFingerprint.keys().next().value;
        if (oldest !== undefined) state.lastSentByFingerprint.delete(oldest);
      }

      const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
      const payload = {
        // Slack incoming webhooks render `text`; other collectors read the rest.
        text: `[eddy:${env}] ${err.name}: ${message}`,
        source: 'eddy-app',
        environment: env,
        name: err.name,
        message,
        stack: err.stack ? redactText(err.stack).slice(0, STACK_LIMIT) : undefined,
        context: redactContext(context),
        timestamp: new Date(ts).toISOString(),
      };

      void send(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      }).catch(() => {
        // Delivery failures are intentionally silent.
      });
    } catch {
      // The reporter must never throw into the request path.
    }
  };
}
