// src/instrumentation-client.ts
// Sentry in the BROWSER. The other half of src/instrumentation.ts.
//
// ── What was broken ────────────────────────────────────────────────────────
//
// instrumentation.ts's register() opens with `if (process.env.NEXT_RUNTIME !==
// 'nodejs') return`, so everything the monitoring work shipped covered the
// server and only the server. A React render throw in a visitor's browser — the
// single most common way this app breaks for the people using it — went
// nowhere at all, while the dashboard looked healthy. That is the shape of
// failure this whole subsystem exists to stop: not an outage, an outage nobody
// can see.
//
// ── Why this file and not sentry.client.config.ts ──────────────────────────
//
// The write-up predates the Next 16 upgrade and named sentry.client.config.ts.
// Next 15 replaced that with `instrumentation-client`, which Next loads itself
// before any application code runs, and @sentry/nextjs v10 follows suit. On
// Next 16 the old filename is deprecated and would be a silent no-op — the same
// class of bug as the one above, so it is worth being explicit about.
//
// ── A SECOND DSN, not the server's ─────────────────────────────────────────
//
// NEXT_PUBLIC_SENTRY_DSN, because anything reaching the browser must be
// NEXT_PUBLIC_. That is not a formality: SENTRY_DSN stays server-only, and
// SENTRY_AUTH_TOKEN (a write credential, used for source maps in
// next.config.mjs) must NEVER be given the prefix.
//
// With no DSN set, Sentry.init is never called and this file costs a bundled
// import and nothing else — the same "safe to merge dark" property the server
// half has.

import * as Sentry from '@sentry/nextjs';
import { redactText } from '@/lib/monitoring/redact';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

    // Errors only, matching the server. This app's browser traffic is dominated
    // by map tiles and CDN-cached reads whose performance is already a
    // cache-hit question, so tracing would spend quota describing the least
    // interesting page loads it has.
    tracesSampleRate: 0,

    // No session replay for the same reason, plus a stronger one: replay
    // records the DOM, and this app renders saved float plans and account
    // screens. sendDefaultPii false keeps the SDK from attaching IP addresses
    // and user agents of its own accord.
    sendDefaultPii: false,

    // ── Redaction, client-side ──────────────────────────────────────────────
    //
    // sentry-reporter.ts is not on this path — it is wired through the server
    // logger's setErrorReporter seam — so the browser needs its own pass over
    // the same table, exactly as eddy-ios/src/lib/monitoring.ts does. A URL in
    // a breadcrumb can carry a share code or a magic-link token, and a fetch
    // failure message routinely carries the whole request URL.
    beforeSend(event) {
      if (event.message) event.message = redactText(event.message);

      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = redactText(exception.value);
      }

      if (event.request?.url) event.request.url = redactText(event.request.url);

      if (event.extra) {
        for (const [key, value] of Object.entries(event.extra)) {
          if (typeof value === 'string') event.extra[key] = redactText(value);
        }
      }

      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.message) breadcrumb.message = redactText(breadcrumb.message);
      if (breadcrumb.data) {
        for (const [key, value] of Object.entries(breadcrumb.data)) {
          if (typeof value === 'string') breadcrumb.data[key] = redactText(value);
        }
      }
      return breadcrumb;
    },
  });
}

/**
 * Required by @sentry/nextjs on the App Router: without it the SDK warns, and
 * client-side navigations are not tied to the errors that happen during them.
 *
 * Cheap regardless of tracesSampleRate — it marks a transition boundary, it
 * does not sample a trace.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
