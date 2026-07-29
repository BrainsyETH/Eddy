// src/instrumentation.ts
// Next.js instrumentation hook — the single place monitoring is wired up
// (audit F19). register() runs once per server process; onRequestError is
// invoked by Next for uncaught server-side request errors.
//
// Configuration, in precedence order:
//   SENTRY_DSN         — the real error backend, shared with the iOS app
//   ERROR_WEBHOOK_URL  — the pre-existing fallback; any JSON-accepting endpoint
//
// With neither set the logger stays a console-only wrapper and nothing is
// reported anywhere. That is what makes both safe to merge dark.
//
// Sentry WINS when both are present rather than being additive. Two sinks for
// one error means every incident is triaged twice and neither is authoritative
// — and the webhook has no grouping, so a loop that fires a thousand times is a
// thousand messages.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

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
