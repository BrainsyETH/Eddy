// src/app/api/admin/trust/run/route.ts
// POST — run one check right now.
//
// Cadence is the reason this exists. river_geometry is daily because it costs
// ~51 seconds against 24 rivers, which is right for a scheduled sweep and wrong
// for the moment after you fix something: the console would keep showing a
// finding as open for the rest of the day with no way to ask it to look again.
//
// That is not hypothetical. The 24 false geometry findings stayed open after
// their cause was fixed, because the check that raised them was not due for
// another 23 hours.
//
// It takes the same cron lock as the scheduled tick, so a manual run and the
// hourly pass cannot interleave and write the same rows.

import { NextRequest, NextResponse } from 'next/server';
import { logAdminAction, requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { releaseCronLock, tryCronLock } from '@/lib/social/cron-lock';
import { getCheck, TRUST_CHECKS } from '@/lib/trust/registry';
import { runTrustCheck } from '@/lib/trust/ledger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Same job name as the scheduled tick — that is the point.
const LOCK_JOB = 'trust_tick';
const LOCK_STALE_SECONDS = 280;
const TIME_BUDGET_MS = 240_000;

/** GET lists what can be run, so the console does not hardcode the registry. */
export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  return NextResponse.json({
    checks: TRUST_CHECKS.map((c) => ({ id: c.id, title: c.title, cadence: c.cadence })),
  });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const checkId: string = body.checkId;

    const check = getCheck(checkId);
    if (!check) {
      return NextResponse.json(
        { error: `Unknown check. Known: ${TRUST_CHECKS.map((c) => c.id).join(', ')}` },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const locked = await tryCronLock(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
    if (!locked) {
      return NextResponse.json(
        { skipped: true, reason: 'A scheduled trust run is in progress. Try again shortly.' },
        { status: 409 },
      );
    }

    try {
      const startedAt = Date.now();
      const summary = await runTrustCheck(supabase, check, {
        now: new Date(),
        deadlineMs: startedAt + TIME_BUDGET_MS,
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      });

      // Worth logging even though it mutates no canonical data: a manual run is
      // what an operator does right after changing something, so it is the
      // marker for "this is when they believed it was fixed".
      logAdminAction({
        action: 'trust_check_run',
        entityType: 'trust_check',
        entityName: check.title,
        details: {
          checkId: check.id,
          status: summary.status,
          raised: summary.raised,
          touched: summary.touched,
          resolved: summary.resolved,
          suppressedReason: summary.suppressedReason ?? null,
        },
      });

      return NextResponse.json({ summary });
    } finally {
      await releaseCronLock(supabase, LOCK_JOB);
    }
  } catch (error) {
    console.error('Error running trust check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
