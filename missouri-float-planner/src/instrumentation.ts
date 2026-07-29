// src/instrumentation.ts
// Next.js instrumentation hook — the single place monitoring is wired up
// (audit F19). register() runs once per server process; onRequestError is
// invoked by Next for uncaught server-side request errors.
//
// Configuration, in precedence order:
//   SENTRY_DSN         — the real error backend, shared with the iOS app
//   ERROR_WEBHOOK_URL  — the pre-existing fallback; any JSON-accepting endpoint
//
// SERVER AND EDGE ONLY. Next loads this module on the server; the browser half
// lives in src/instrumentation-client.ts and reads a SEPARATE, NEXT_PUBLIC_
// DSN. Both are needed — for most of this subsystem's life only this one
// existed, and browser errors went nowhere while the dashboard looked healthy.
//
// With neither set the logger stays a console-only wrapper and nothing is
// reported anywhere. That is what makes both safe to merge dark.
//
// Sentry WINS when both are present rather than being additive. Two sinks for
// one error means every incident is triaged twice and neither is authoritative
// — and the webhook has no grouping, so a loop that fires a thousand times is a
// thousand messages.

export async function register(): Promise<void> {
  const runtime = process.env.NEXT_RUNTIME;

  // Node AND edge. This used to be `!== 'nodejs'`, which was correct for the
  // webhook sink below (it keeps per-process dedupe state that an edge isolate
  // would fragment) and quietly wrong for Sentry: an error thrown in an edge
  // route would have had nothing listening. There are no edge routes today,
  // which is precisely why this is worth fixing now — the first one added would
  // otherwise be unmonitored by default and nothing would say so.
  //
  // The BROWSER is not covered here and cannot be: Next loads this module on
  // the server only. See src/instrumentation-client.ts.
  if (runtime !== 'nodejs' && runtime !== 'edge') return;

  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    // Imported dynamically and only on this branch, so a deployment with no DSN
    // never loads the SDK at all.
    const [Sentry, { setErrorReporter }, { createSentryReporter }] = await Promise.all([
      import('@sentry/nextjs'),
      import('@/lib/logger'),
      import('@/lib/monitoring/sentry-reporter'),
    ]);
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      // Errors only. This app's traffic is dominated by CDN-cached read routes
      // whose performance is already a cache-hit question, so tracing would
      // spend quota describing the least interesting requests it has.
      tracesSampleRate: 0,
      // The reporter below redacts before Sentry ever sees an event; these stop
      // the SDK adding its own unredacted copies of the same data.
      sendDefaultPii: false,
    });
    setErrorReporter(createSentryReporter(Sentry));
    return;
  }

  // Node only, unlike Sentry above: the webhook reporter dedupes and rate-limits
  // in module-level state, and an edge isolate per request turns a "one report
  // per fingerprint per five minutes" cap into no cap at all.
  if (runtime !== 'nodejs') return;

  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (!webhookUrl) return;

  const [{ setErrorReporter }, { createWebhookReporter }] = await Promise.all([
    import('@/lib/logger'),
    import('@/lib/monitoring/webhook-reporter'),
  ]);
  setErrorReporter(createWebhookReporter(webhookUrl));
}

// Uncaught server request errors — report the route shape only (method, path,
// router kind). Never headers, bodies, or query strings: the audit requires
// monitoring with redaction, and those can carry emails, tokens, and locations.
export async function onRequestError(
  error: unknown,
  request: { method: string; path: string },
  context: { routerKind: string; routeType: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { logger } = await import('@/lib/logger');
  logger.captureException(error, {
    method: request.method,
    path: request.path.split('?')[0],
    routerKind: context.routerKind,
    routeType: context.routeType,
  });
}
