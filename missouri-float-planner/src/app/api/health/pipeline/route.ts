// src/app/api/health/pipeline/route.ts
// GET /api/health/pipeline — is the alert pipeline producing outcomes?
//
// For an EXTERNAL uptime monitor: 200 when every check passes, 503 when any
// fails or cannot be read. See src/lib/monitoring/pipeline-health.ts for what
// is checked and docs/pipeline-monitoring.md for wiring a monitor to it.
//
// Unauthenticated callers get pass/fail per check and nothing else. Ages and
// failure reasons need the cron bearer — they are operational detail, not a
// public status page. CDN-cached for a minute and rate-limited, because every
// uncached hit is a handful of service-role reads.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { checkPipelineHealth } from '@/lib/monitoring/pipeline-health';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authed = !!secret && hasValidMachineBearer(request.headers.get('authorization'), secret);

  if (!authed) {
    const limited = await rateLimit(`health-pipeline:${getClientIp(request)}`, 30, 60 * 1000);
    if (limited) return limited;
  }

  const health = await checkPipelineHealth(createAdminClient());
  const status = health.ok ? 200 : 503;
  const body = authed
    ? health
    : {
        ok: health.ok,
        checkedAt: health.checkedAt,
        checks: health.checks.map(({ name, ok }) => ({ name, ok })),
      };

  return NextResponse.json(body, {
    status,
    headers: {
      // The authenticated view must never be served from a shared cache.
      'Cache-Control': authed ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=30',
      Vary: 'Authorization',
    },
  });
}
