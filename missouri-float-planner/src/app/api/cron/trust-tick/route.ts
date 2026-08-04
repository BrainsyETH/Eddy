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
import { releaseCronLock, tryCronLockDetailed } from '@/lib/social/cron-lock';
import { TRUST_CHECKS, isCheckDue, orderByStaleness } from '@/lib/trust/registry';
import { runTrustCheck, type RunSummary } from '@/lib/trust/ledger';
import { mustRow, mustRows, mustWrite } from '@/lib/trust/db';
import { planDecay } from '@/lib/trust/decay';

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

  const lock = await tryCronLockDetailed(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!lock.acquired) {
    // Contention is ordinary — another instance is mid-pass — so it stays a
    // quiet 200. A lock that could not be evaluated at all is an outage
    // wearing contention's clothes: the tick stops running and every skipped
    // pass reports the same calm "skipped" as a healthy overlap. 503 so
    // Vercel's cron history records a failed invocation.
    if (lock.reason === 'unavailable') {
      logger.error('[trust-tick] cron lock unavailable', new Error(lock.error), { job: LOCK_JOB });
      return NextResponse.json(
        { ok: false, skipped: true, reason: 'lock_unavailable', error: lock.error },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, skipped: true, reason: 'lock_contended' });
  }

  try {
    const now = new Date();
    const deadlineMs = startedAt + TIME_BUDGET_MS;

    // One row per check: when it last STARTED, not finished. A check that
    // crashes must still count as attempted, or a reliably failing check would
    // be retried every tick and starve the rest.
    //
    // A read failure here aborts the pass rather than degrading. Discarding the
    // error would make every check look never-run, so the tick would run all of
    // them every hour against a database it cannot read — and report success.
    const lastStartedById = new Map<string, Date | null>();
    for (const check of TRUST_CHECKS) {
      const row = await mustRow<{ started_at: string }>(
        supabase
          .from('trust_runs')
          .select('started_at')
          .eq('check_id', check.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        `could not read the last run of ${check.id}`,
      );
      lastStartedById.set(check.id, row?.started_at ? new Date(row.started_at) : null);
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

    const failed = summaries.filter((s) => s.status === 'error').map((s) => s.checkId);
    const suppressed = summaries
      .filter((s) => s.suppressedReason)
      .map((s) => ({ checkId: s.checkId, reason: s.suppressedReason }));

    // partial_scope is ordinary: the check ran out of its time budget and will
    // finish next hour. The other three mean the checking itself is broken.
    const refused = suppressed.filter((s) => s.reason !== 'partial_scope');

    // ── keep the open list bounded ───────────────────────────────────────
    //
    // Runs after the checks so it sees this pass's results, and outside the
    // per-check reconciliation because it is not about any one check: it shelves
    // informational findings nobody has acted on in a month, and closes findings
    // orphaned by a check that no longer exists — which nothing else can ever
    // resolve, because nothing emits them.
    //
    // Failures here are recorded and do not fail the pass. Housekeeping that
    // takes down the checks would be a worse outcome than a list that grows for
    // another hour.
    let shelved = 0;
    let expired = 0;
    let decayError: string | undefined;

    try {
      const candidates = await mustRows<{
        id: string;
        check_id: string;
        severity: string;
        status: string;
        first_seen_at: string;
      }>(
        supabase
          .from('trust_findings')
          .select('id, check_id, severity, status, first_seen_at')
          .neq('status', 'resolved'),
        'could not read findings for decay',
      );

      const decay = planDecay(
        candidates,
        now,
        TRUST_CHECKS.map((c) => c.id),
      );

      // Grouped by deadline so this is one write, not one per finding. Every
      // shelved finding in a pass shares the same `until`.
      if (decay.shelve.length > 0) {
        await mustWrite(
          supabase
            .from('trust_findings')
            .update({ status: 'snoozed', snoozed_until: decay.shelve[0].until, resolved_at: null })
            .in(
              'id',
              decay.shelve.map((s) => s.id),
            )
            .eq('status', 'open'),
          'could not shelve stale informational findings',
        );
        shelved = decay.shelve.length;
      }

      if (decay.expire.length > 0) {
        await mustWrite(
          supabase
            .from('trust_findings')
            .update({
              status: 'resolved',
              resolved_at: now.toISOString(),
              snoozed_until: null,
              resolution: decay.resolution,
            })
            .in('id', decay.expire)
            .neq('status', 'resolved'),
          'could not close orphaned findings',
        );
        expired = decay.expire.length;
      }
    } catch (error) {
      decayError = error instanceof Error ? error.message : String(error);
      logger.error('[trust-tick] decay pass failed', new Error(decayError));
    }

    const summary = {
      // Was hardcoded `true`. A pass in which every check threw, or in which
      // reconciliation was refused across the board, returned `ok: true` with
      // HTTP 200 and the failures visible only to something that walked the
      // secondary arrays — so the cheapest possible monitor, the one that reads
      // `ok`, was the one guaranteed to be wrong.
      //
      // The HTTP status stays 200 on a check-level failure on purpose: those are
      // already in the ledger at critical severity and already reach Sentry
      // through logger.error below, and a red cron history that stays red for as
      // long as one finding is open teaches an operator to ignore cron history.
      // Only an infrastructure failure — the lock, above — makes the invocation
      // itself fail.
      ok: failed.length === 0 && refused.length === 0,
      checksRun: summaries.length,
      checksDeferred: deferred.length,
      deferred,
      failed,
      suppressed,
      raised: summaries.reduce((n, s) => n + s.raised, 0),
      touched: summaries.reduce((n, s) => n + s.touched, 0),
      resolved: summaries.reduce((n, s) => n + s.resolved, 0),
      shelved,
      expired,
      ...(decayError ? { decayError } : {}),
      durationMs: Date.now() - startedAt,
    };

    // A suppressed reconciliation already wrote itself into the ledger; this is
    // so it also shows up wherever cron output is being watched.
    //
    // Keyed off `ok` rather than the raw suppressed list, so it agrees with the
    // payload and with suppressionWarrantsFinding(): a truncated pass is not an
    // error in the ledger and must not page as one here either.
    if (!summary.ok) {
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
