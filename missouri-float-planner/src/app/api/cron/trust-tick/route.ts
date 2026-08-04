// src/app/api/cron/trust-tick/route.ts
// GET — Hourly. Runs whichever trust checks are due and reconciles the ledger.
//
// One cron path for every check, present and future. vercel.json already
// declares 23 entries against a ceiling around 40, so a design where each check
// costs a slot would run out before the interesting checks got written. Cadence
// lives in src/lib/trust/registry.ts; adding a check costs nothing here.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { logger } from '@/lib/logger';
import { releaseCronLock, tryCronLock } from '@/lib/social/cron-lock';
import { TRUST_CHECKS, isCheckDue, orderByStaleness } from '@/lib/trust/registry';
import { runTrustCheck, type RunSummary } from '@/lib/trust/ledger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Mirrored in vercel.json's `functions` block, which is what actually applies it
// on deploy — see the note in sync-gauge-latest/route.ts.
const LOCK_JOB = 'trust_tick';
const LOCK_STALE_SECONDS = 280;

/**
 * Well under maxDuration, and every check gets the same wall clock.
 *
 * A check that overruns is not killed — it is asked to stop and report
 * `partial`, which suppresses resolution for that pass. That is the whole
 * reason for the budget: a hard timeout would leave a half-finished pass with
 * no way to say it was half-finished.
 */
const TIME_BUDGET_MS = 240_000;

async function run(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (!hasValidMachineBearer(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();

  const locked = await tryCronLock(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!locked) {
    return NextResponse.json({ skipped: true, reason: 'lock_contended' });
  }

  try {
    const now = new Date();
    const deadlineMs = startedAt + TIME_BUDGET_MS;

    // One row per check: when it last STARTED, not finished. A check that
    // crashes must still count as attempted, or a reliably failing check would
    // be retried every tick and starve the rest.
    const lastStartedById = new Map<string, Date | null>();
    for (const check of TRUST_CHECKS) {
      const { data } = await supabase
        .from('trust_runs')
        .select('started_at')
        .eq('check_id', check.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lastStartedById.set(check.id, data?.started_at ? new Date(data.started_at) : null);
    }

    const due = orderByStaleness(TRUST_CHECKS, lastStartedById).filter((check) =>
      isCheckDue({ check, lastStartedAt: lastStartedById.get(check.id) ?? null, now }),
    );

    const summaries: RunSummary[] = [];
    const deferred: string[] = [];

    for (const check of due) {
      // Stop cleanly rather than starting work that cannot finish. The
      // least-recently-run ordering means whatever is skipped sorts to the front
      // of the next tick, so a slow check cannot starve the ones behind it.
      if (Date.now() > deadlineMs) {
        deferred.push(check.id);
        continue;
      }
      summaries.push(
        await runTrustCheck(supabase, check, {
          now,
          deadlineMs,
          gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
        }),
      );
    }

    const summary = {
      ok: true,
      checksRun: summaries.length,
      checksDeferred: deferred.length,
      deferred,
      failed: summaries.filter((s) => s.status === 'error').map((s) => s.checkId),
      suppressed: summaries
        .filter((s) => s.suppressedReason)
        .map((s) => ({ checkId: s.checkId, reason: s.suppressedReason })),
      raised: summaries.reduce((n, s) => n + s.raised, 0),
      touched: summaries.reduce((n, s) => n + s.touched, 0),
      resolved: summaries.reduce((n, s) => n + s.resolved, 0),
      durationMs: Date.now() - startedAt,
    };

    // A suppressed reconciliation already wrote itself into the ledger; this is
    // so it also shows up wherever cron output is being watched.
    if (summary.failed.length > 0 || summary.suppressed.length > 0) {
      logger.error('[trust-tick] pass completed with refusals', summary);
    } else {
      logger.info('[trust-tick] pass complete', summary);
    }

    return NextResponse.json(summary);
  } catch (error) {
    logger.error('[trust-tick] pass failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await releaseCronLock(supabase, LOCK_JOB);
  }
}

// Vercel Cron invokes routes via GET; POST kept for manual triggering.
export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
