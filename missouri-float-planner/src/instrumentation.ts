// src/instrumentation.ts
// Next.js instrumentation hook — the single place monitoring is wired up
// (audit F19). register() runs once per server process; onRequestError is
// invoked by Next for uncaught server-side request errors.
//
// Configuration: set ERROR_WEBHOOK_URL to any JSON-accepting endpoint (a Slack
// incoming webhook works as-is). Unset, the logger stays a console-only wrapper
// and nothing is reported anywhere — behavior is unchanged.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
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
