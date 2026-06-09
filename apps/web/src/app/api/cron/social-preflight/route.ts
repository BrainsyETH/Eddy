// src/app/api/cron/social-preflight/route.ts
// Daily cron — verifies the GH Actions render pipeline is reachable BEFORE
// posts try to dispatch. Alerts on failure so PAT expiry or scope drift
// surfaces in hours instead of after several silent fallbacks.
//
// Auth: Bearer ${CRON_SECRET}, same pattern as the other cron routes.
// Optional alerting: if SOCIAL_ALERT_WEBHOOK_URL is set, a JSON payload is
// POSTed there on non-OK results (Slack incoming-webhook format works).
// Always returns the preflight HTTP status, so the Vercel cron dashboard
// shows non-200 invocations as failed runs.

import { NextRequest, NextResponse } from 'next/server';
import { runPreflight, type PreflightResult } from '@/lib/social/preflight';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[cron/social-preflight]';

async function postAlert(result: PreflightResult): Promise<void> {
  const url = process.env.SOCIAL_ALERT_WEBHOOK_URL;
  if (!url) return;
  const text = `:rotating_light: Social video preflight FAILED (${result.httpStatus}) — ${result.reason}\n` +
    `repo: ${result.config.owner}/${result.config.repo}@${result.config.ref}\n` +
    `workflow: ${result.config.workflow}\n` +
    `checks: ${JSON.stringify(result.checks)}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Alert webhook failed:`, err);
  }
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(`${LOG_PREFIX} CRON_SECRET not configured`);
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runPreflight();
  if (result.ok) {
    console.log(`${LOG_PREFIX} OK — ${result.config.owner}/${result.config.repo}@${result.config.ref}`);
  } else {
    console.error(`${LOG_PREFIX} FAILED (${result.httpStatus}): ${result.reason}`);
    await postAlert(result);
  }
  return NextResponse.json(result, { status: result.httpStatus });
}

// Vercel cron sends GET; allow POST too for manual reruns from `curl -X POST`.
export const GET = handle;
export const POST = handle;
