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
// An event is only drained once it reached at least one device, or had nothing
// to send at all — see the block at the end of the pass. Anything else keeps its
// place in the outbox and burns one of MAX_ATTEMPTS.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { planDeliveries, type FanoutEvent, type FanoutSubscription, type FanoutToken } from '@/lib/alerts/fanout';
import { planDrain } from '@/lib/alerts/drain';
import { deliverGaugeAlerts } from '@/lib/alerts/gauge-delivery';
import { disableTokens, recordTokenFailures } from '@/lib/alerts/token-health';
import { chunkMessages, classifyTicketError, sendExpoPush } from '@/lib/push/expo';
import { pushDisabledReason } from '@/lib/push/kill-switch';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOCK_JOB = 'deliver_push';
const LOCK_STALE_SECONDS = 320;

/**
 * Events older than this are drained WITHOUT sending. After a delivery outage,
 * "your river is floatable" must never fire about water that has since dropped.
 */
const MAX_EVENT_AGE_HOURS = 3;
const MAX_ATTEMPTS = 5;
const EVENT_BATCH = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the river pass reports back, so the caller can add the gauge pass to it. */
interface RiverPassResult {
  body: Record<string, unknown>;
  status: number;
}

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
    return NextResponse.json({ skipped: true, reason: disabled });
  }

  const gotLock = await tryCronLock(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!gotLock) {
    return NextResponse.json({ skipped: true, reason: 'concurrent run' });
  }

  const startedAt = Date.now();
  try {
    // The two outboxes are drained INDEPENDENTLY. They share this route because
    // they share a cron lock, a transport and a ledger — but a river pass that
    // finds nothing, or fails outright, must not stop gauge alerts going out.
    // Both are inside the one lock so the two passes can never overlap and
    // double-send to the same device.
    let river: RiverPassResult;
    try {
      river = await drainRiverEvents(supabase, startedAt);
    } catch (error) {
      logger.error('[deliver-push] river pass failed', error);
      river = { body: { ok: false, error: 'River pass failed' }, status: 500 };
    }

    const gauge = await deliverGaugeAlerts(supabase);
    return NextResponse.json({ ...river.body, gauge }, { status: river.status });
  } catch (error) {
    logger.error('[deliver-push] pass failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await releaseCronLock(supabase, LOCK_JOB);
  }
}

/** The original river-condition drain, unchanged apart from how it returns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drainRiverEvents(supabase: any, startedAt: number): Promise<RiverPassResult> {
  const cutoff = new Date(Date.now() - MAX_EVENT_AGE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: pending, error: eventsError } = await supabase
    .from('river_condition_events')
    .select('id, river_id, kind, old_condition_code, new_condition_code, reading_at, detected_at, push_attempts, rivers!inner(name, slug)')
    .is('push_delivered_at', null)
    .lt('push_attempts', MAX_ATTEMPTS)
    .in('kind', ['floatable', 'warning', 'easing'])
    .order('detected_at', { ascending: true })
    .limit(EVENT_BATCH);

  if (eventsError) {
    logger.error('[deliver-push] could not read outbox', eventsError);
    return { body: { error: 'Could not read outbox' }, status: 500 };
  }

  const rows = pending ?? [];
  if (rows.length === 0) {
    return { body: { ok: true, events: 0, sent: 0 }, status: 200 };
  }

  // Drain anything too old to be actionable, without sending.
  const expired = rows.filter((r: { detected_at: string }) => r.detected_at < cutoff);
  if (expired.length > 0) {
    await supabase
      .from('river_condition_events')
      .update({ push_delivered_at: new Date().toISOString() })
      .in('id', expired.map((r: { id: string }) => r.id));
  }

  const fresh = rows.filter((r: { detected_at: string }) => r.detected_at >= cutoff);
  if (fresh.length === 0) {
    return { body: { ok: true, events: rows.length, expired: expired.length, sent: 0 }, status: 200 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: FanoutEvent[] = fresh.map((r: any) => {
    const river = Array.isArray(r.rivers) ? r.rivers[0] : r.rivers;
    return {
      id: r.id,
      river_id: r.river_id,
      kind: r.kind,
      old_condition_code: r.old_condition_code,
      new_condition_code: r.new_condition_code,
      river_name: river?.name ?? null,
      river_slug: river?.slug ?? null,
      reading_at: r.reading_at,
    };
  });

  // Kept out of FanoutEvent: how many times we've tried is delivery
  // bookkeeping, and the fan-out policy has no business seeing it.
  const attemptsByEvent = new Map<string, number>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fresh.map((r: any) => [r.id as string, (r.push_attempts as number) ?? 0])
  );

  const riverIds = [...new Set(events.map((e) => e.river_id))];

  // enabled is filtered HERE and not in the fan-out: planDeliveries answers
  // "who wants this?", and a paused subscription is not a policy question —
  // it is a row that should not have been fetched. Migration 00200 defaults
  // it true, so every pre-existing subscription still matches.
  const { data: subsData } = await supabase
    .from('alert_subscriptions')
    .select('id, user_id, river_id, kind, one_shot, fired_at')
    .eq('enabled', true)
    .in('river_id', riverIds);
  const subscriptions = (subsData ?? []) as FanoutSubscription[];

  if (subscriptions.length === 0) {
    await markDelivered(supabase, events.map((e) => e.id));
    return { body: { ok: true, events: events.length, sent: 0, reason: 'no subscribers' }, status: 200 };
  }

  const userIds = [...new Set(subscriptions.map((s) => s.user_id))];

  const { data: tokensData } = await supabase
    .from('device_tokens')
    .select('id, user_id, expo_push_token, disabled_at')
    .in('user_id', userIds)
    .is('disabled_at', null);
  const tokens = (tokensData ?? []) as FanoutToken[];

  // No entitlement lookup. There used to be one here, re-checking at send time
  // so a lapse between subscribing and the transition could not leak paid
  // push. Alerting is free now, so holding the subscription is the whole of
  // the permission and the query is a round trip that can only return "yes".
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: recentData } = await supabase
    .from('alert_push_deliveries')
    .select('user_id, river_id, kind, sent_at')
    .in('user_id', userIds)
    .gte('sent_at', since);

  const plan = planDeliveries({
    events,
    subscriptions,
    tokens,
    recentDeliveries: recentData ?? [],
  });

  let sent = 0;
  let failed = 0;
  const failuresByToken = new Map<string, number>();
  /**
   * Successful sends per event, so an event is only drained once it actually
   * reached somebody. Counting per EVENT and not in aggregate matters: a pass
   * carrying two events where one succeeds and the other fails must retry
   * exactly the second.
   */
  const successByEvent = new Map<string, number>();

  for (const [index, batch] of chunkMessages(plan.messages.map((m) => m.message)).entries()) {
    const offset = index * 100;
    // Never throws — a whole-request failure comes back as one error ticket
    // per message, index-aligned, so the tally below is always complete.
    const tickets = await sendExpoPush(batch);

    const ledgerRows = tickets.map((ticket, i) => {
      const planned = plan.messages[offset + i];
      const errorKind = classifyTicketError(ticket);
      if (ticket.status === 'ok') {
        sent++;
        successByEvent.set(planned.eventId, (successByEvent.get(planned.eventId) ?? 0) + 1);
      } else {
        failed++;
        failuresByToken.set(
          planned.deviceTokenId,
          (failuresByToken.get(planned.deviceTokenId) ?? 0) + 1
        );
      }
      return {
        event_id: planned.eventId,
        device_token_id: planned.deviceTokenId,
        user_id: planned.userId,
        river_id: planned.riverId,
        kind: planned.kind,
        ticket_id: ticket.id ?? null,
        status: ticket.status === 'ok' ? 'sent' : 'error',
        error_code: errorKind,
      };
    });

    // onConflict: the PK is (event_id, device_token_id), so a retried pass
    // records rather than duplicates.
    await supabase
      .from('alert_push_deliveries')
      .upsert(ledgerRows, { onConflict: 'event_id,device_token_id' });

    // Prune tokens Expo says are gone. Note DeviceNotRegistered usually
    // arrives in the RECEIPT rather than the ticket, so this catches only
    // some — failure_count below is the backstop.
    const dead = tickets
      .map((t, i) => (classifyTicketError(t) === 'device_not_registered'
        ? plan.messages[offset + i].deviceTokenId
        : null))
      .filter((id): id is string => !!id);
    await disableTokens(supabase, dead);

    // Jitter between batches so a fan-out doesn't become a synchronized
    // stampede back onto our own API when everyone opens the app.
    if (index < plan.messages.length / 100 - 1) await sleep(300);
  }

  // Bump failure counts for tokens that errored without a definitive
  // DeviceNotRegistered, and disable the persistently broken ones. Shared with
  // the gauge pass so the two cannot drift on when a token is given up on.
  await recordTokenFailures(supabase, failuresByToken);

  if (plan.oneShotSubscriptionIds.length > 0) {
    await supabase
      .from('alert_subscriptions')
      .update({ fired_at: new Date().toISOString() })
      .in('id', plan.oneShotSubscriptionIds);
  }

  // ── Drain, or leave for the next pass ──────────────────────────────
  //
  // This used to mark EVERY event delivered unconditionally, which quietly
  // undid the at-least-once guarantee in this file's header: a pass where
  // every send failed still stamped push_delivered_at, so the alert was gone
  // for good. `push_attempts` existed for exactly this and was never written
  // — read as a filter, incremented nowhere, leaving MAX_ATTEMPTS dead code.
  //
  // The rule itself lives in lib/alerts/drain.ts so it can be tested without
  // a database, same as the fan-out policy.
  const plannedByEvent = new Map<string, number>();
  for (const message of plan.messages) {
    plannedByEvent.set(message.eventId, (plannedByEvent.get(message.eventId) ?? 0) + 1);
  }

  const { delivered, retryByNextAttempt, givenUp } = planDrain({
    events: events.map((e) => ({ id: e.id, attempts: attemptsByEvent.get(e.id) ?? 0 })),
    plannedByEvent,
    successByEvent,
    maxAttempts: MAX_ATTEMPTS,
  });

  for (const [attempts, ids] of retryByNextAttempt) {
    await supabase.from('river_condition_events').update({ push_attempts: attempts }).in('id', ids);
  }

  await markDelivered(supabase, delivered);

  const retried = events.length - delivered.length;
  const durationMs = Date.now() - startedAt;
  if (givenUp > 0) {
    logger.error(
      '[deliver-push] events abandoned after MAX_ATTEMPTS',
      new Error(`${givenUp} event(s) never reached a device`)
    );
  }
  logger.info('[deliver-push] pass complete', {
    events: events.length,
    expired: expired.length,
    planned: plan.messages.length,
    sent,
    failed,
    retried,
    givenUp,
    skipped: plan.skipped,
    durationMs,
  });

  return {
    body: {
      ok: true,
      events: events.length,
      expired: expired.length,
      planned: plan.messages.length,
      sent,
      failed,
      retried,
      givenUp,
      skipped: plan.skipped,
      durationMs,
    },
    status: 200,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markDelivered(supabase: any, eventIds: string[]) {
  if (eventIds.length === 0) return;
  await supabase
    .from('river_condition_events')
    .update({ push_delivered_at: new Date().toISOString() })
    .in('id', eventIds);
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
