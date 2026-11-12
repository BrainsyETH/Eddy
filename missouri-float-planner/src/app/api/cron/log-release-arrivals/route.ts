// src/app/api/cron/log-release-arrivals/route.ts
// GET/POST /api/cron/log-release-arrivals — the release-arrival trial.
//
// INTERNAL. Writes a private log and changes nothing a visitor can see. When
// Bull Shoals raises its release, this records whether the frozen rule would
// have estimated the rise at the gauge near Norfork, and a day later what the
// gauge did. The point is to learn, on predictions fixed before the outcome
// existed, whether such an estimate could ever be shown. See
// docs/release-arrival-trial.md for the rule, the pass marks and how to read
// the log.
//
// OFF UNLESS RELEASE_ARRIVAL_TRIAL_ENABLED=true, so deploying the code and
// starting the trial are separate decisions — the same switch the rainfall
// research collector uses.
//
// SCHEDULED AT :32 (vercel.json), after sync-dam-history at :25 has stored the
// newest release hours this reads.

import { NextRequest, NextResponse } from 'next/server';
import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { releaseCronLock, tryCronLockDetailed } from '@/lib/social/cron-lock';
import { logger } from '@/lib/logger';
import { runTrial } from '@/lib/arrival-trial/run';
import { trialDeps } from '@/lib/arrival-trial/store';

export const dynamic = 'force-dynamic';
// Idle passes are one query. A pass with work makes a handful of USGS requests.
// Mirrored in vercel.json's `functions`, which is what applies it on deploy.
export const maxDuration = 120;

const JOB = 'log_release_arrivals';

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  if (!hasValidMachineBearer(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.RELEASE_ARRIVAL_TRIAL_ENABLED !== 'true') {
    return NextResponse.json({ monitoring_status: 'skipped', skipped: true });
  }

  const db = createAdminClient(AbortSignal.timeout(100_000));
  const lock = await tryCronLockDetailed(db, JOB, 150);
  if (!lock.acquired) {
    const contended = lock.reason === 'contended';
    return NextResponse.json(
      { monitoring_status: contended ? 'skipped' : 'error', skipped: contended },
      { status: contended ? 200 : 503 }
    );
  }
  try {
    return NextResponse.json(await runTrial(trialDeps(db)));
  } catch (error) {
    logger.warn('log-release-arrivals: pass failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ monitoring_status: 'error', error: 'Release arrival trial failed' }, { status: 503 });
  } finally {
    // Its own deadline: a pass that timed out must still let go of the lock.
    await releaseCronLock(createAdminClient(AbortSignal.timeout(3000)), JOB);
  }
}

export const GET = withJobRun('log-release-arrivals', run);

export const POST = withJobRun('log-release-arrivals', run);
