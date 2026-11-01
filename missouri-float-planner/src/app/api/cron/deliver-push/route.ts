// src/app/api/cron/deliver-push/route.ts
// GET/POST /api/cron/deliver-push — drains the alert outbox to Expo push.
//
// A SEPARATE route from update-gauges on purpose. That cron already spends up
// to 30s on enrichment plus awaited LLM regens inside a 60s ceiling, so an
// inline fan-out would be the first thing killed — exactly the failure the
// outbox exists to prevent. Splitting it also lets delivery retry independently,
// which matters because Vercel crons never retry.
//
// Delivery is AT-LEAST-ONCE at the event level and idempotent at the device
// level: river_condition_events.push_delivered_at marks an event drained, while
// alert_push_deliveries records who actually received it, so a pass killed
// mid-send does not re-notify everyone on the next run.
//
// An event is only drained once every recipient it was planned for has been
// reached, or it had nothing to send at all — see planDrain. Anything else keeps
// its place in the outbox, burns one of MAX_ATTEMPTS, and on the next pass is
// planned only for the recipients still missing. The river pass itself lives in
// lib/alerts/river-delivery.ts so its failure paths are testable.

import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { tryCronLockDetailed, releaseCronLock } from '@/lib/social/cron-lock';
import { deliverGaugeAlerts } from '@/lib/alerts/gauge-delivery';
import { drainRiverEvents, MAX_ATTEMPTS, type RiverPassResult } from '@/lib/alerts/river-delivery';
import { pushDisabledReason } from '@/lib/push/kill-switch';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOCK_JOB = 'deliver_push';
const LOCK_STALE_SECONDS = 320;

async function run(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[deliver-push] CRON_SECRET not configured', new Error('missing CRON_SECRET'));
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (!hasValidMachineBearer(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Kill switch, mirroring social_config.posting_enabled: a bad deploy must
  // never be able to mass-push. Reads BOTH the env var and app_config — the
  // latter used to be checked nowhere on this path, so the no-deploy lever
  // 00191 added silenced the client's UI and nothing else.
  const disabled = await pushDisabledReason(supabase);
  if (disabled) {
    const pending = await countPendingOutbox(supabase);
    // LOUD when the switch is holding real notifications back.
    //
    // This return used to be silent, which made a six-day outage — every alert
    // detected, recorded, and never sent because EXPO_PUSH_ENABLED was false in
    // production — indistinguishable from an empty outbox. Nothing in the logs,
    // nothing in the ledger, and the evaluation cron cheerfully writing events
    // nobody would ever receive. A kill switch that cannot be seen from the
    // outside is a kill switch nobody remembers is on.
    if (pending > 0) {
      logger.error(
        '[deliver-push] push is disabled while the outbox has undelivered events',
        new Error(`${disabled}; ${pending} event(s) waiting`),
      );
    }
    return NextResponse.json({ skipped: true, reason: disabled, pending });
  }

  // Contention stays a quiet skip. A lock that could not be evaluated at all is
  // an outage wearing contention's clothes — every alert stops while each run
  // reports a calm "skipped" — so it is a 503 the job monitor records as an
  // error. Same rule as trust-tick.
  const lock = await tryCronLockDetailed(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!lock.acquired) {
    if (lock.reason === 'unavailable') {
      logger.error('[deliver-push] cron lock unavailable', new Error(lock.error), { job: LOCK_JOB });
      return NextResponse.json(
        { ok: false, monitoring_status: 'error', skipped: true, reason: 'lock_unavailable' },
        { status: 503 },
      );
    }
    return NextResponse.json({ skipped: true, monitoring_status: 'skipped', reason: 'concurrent run' });
  }

  try {
    // The two outboxes are drained INDEPENDENTLY. They share this route because
    // they share a cron lock, a transport and a ledger — but a river pass that
    // finds nothing, or fails outright, must not stop gauge alerts going out.
    // Both are inside the one lock so the two passes can never overlap and
    // double-send to the same device.
    let river: RiverPassResult;
    try {
      river = await drainRiverEvents(supabase);
    } catch (error) {
      logger.error('[deliver-push] river pass failed', error);
      river = { body: { ok: false, error: 'River pass failed' }, status: 500 };
    }

    const gauge = await deliverGaugeAlerts(supabase);
    // A gauge pass that could not read what it needed sent nothing and drained
    // nothing; the run is failed even when the river pass was fine.
    const status = river.status >= 400 ? river.status : gauge.error ? 500 : river.status;
    return NextResponse.json({ ...river.body, gauge }, { status });
  } catch (error) {
    logger.error('[deliver-push] pass failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await releaseCronLock(supabase, LOCK_JOB);
  }
}

/**
 * How many events both outboxes are holding, for the kill-switch warning.
 *
 * `head: true` so this costs a count and no rows. Never throws and answers 0 on
 * failure: this exists to make a suppressed run visible, and it must not be the
 * reason a run fails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countPendingOutbox(supabase: any): Promise<number> {
  try {
    const [river, gauge] = await Promise.all([
      supabase
        .from('river_condition_events')
        .select('id', { count: 'exact', head: true })
        .is('push_delivered_at', null)
        .lt('push_attempts', MAX_ATTEMPTS)
        .in('kind', ['floatable', 'warning', 'easing']),
      supabase
        .from('gauge_alert_events')
        .select('id', { count: 'exact', head: true })
        .is('push_delivered_at', null)
        .lt('push_attempts', MAX_ATTEMPTS),
    ]);
    return (river.count ?? 0) + (gauge.count ?? 0);
  } catch {
    return 0;
  }
}

async function handleGET(request: NextRequest) {
  return run(request);
}

async function handlePOST(request: NextRequest) {
  return run(request);
}

export const GET = withJobRun("deliver-push", handleGET);

export const POST = withJobRun("deliver-push", handlePOST);
