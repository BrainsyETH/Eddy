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
import { assessHeartbeat } from '@/lib/trust/heartbeat';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Same job name as the scheduled tick — that is the point.
const LOCK_JOB = 'trust_tick';
const LOCK_STALE_SECONDS = 280;
const TIME_BUDGET_MS = 240_000;

/**
 * GET lists what can be run, with each check's last run.
 *
 * The last-run half is run-health visibility the console otherwise lacks: a
 * calm list of open findings looks identical whether the ledger ran an hour ago
 * or stopped last week. Opening the page should answer that without anyone
 * querying trust_runs by hand.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const now = new Date();

  const checks = await Promise.all(
    TRUST_CHECKS.map(async (c) => {
      const { data } = await supabase
        .from('trust_runs')
        .select('started_at, status, suppressed_reason')
        .eq('check_id', c.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastStartedAt = data?.started_at ? new Date(data.started_at) : null;
      const beat = assessHeartbeat({ checkId: c.id, cadence: c.cadence, lastStartedAt }, now);

      return {
        id: c.id,
        title: c.title,
        cadence: c.cadence,
        lastRunAt: data?.started_at ?? null,
        lastStatus: (data?.status as string | null) ?? null,
        lastSuppressedReason: (data?.suppressed_reason as string | null) ?? null,
        overdue: beat.overdue,
        heartbeat: beat.detail,
      };
    }),
  );

  return NextResponse.json({ checks });
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

      // Awaited, unlike the fire-and-forget pattern used elsewhere for this
      // helper. A serverless function can be frozen the moment the response is
      // sent, and a manual run is the marker for "this is when they believed it
      // was fixed" — the one record you want when reconstructing what happened.
      await logAdminAction({
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
