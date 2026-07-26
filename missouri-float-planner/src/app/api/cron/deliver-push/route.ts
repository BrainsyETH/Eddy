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

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { isEntitlementActive } from '@/lib/entitlement';
import { planDeliveries, type FanoutEvent, type FanoutSubscription, type FanoutToken } from '@/lib/alerts/fanout';
import { chunkMessages, classifyTicketError, sendExpoPush } from '@/lib/push/expo';
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
/** Disable a token after this many consecutive send failures. */
const FAILURE_DISABLE_THRESHOLD = 5;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function run(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[deliver-push] CRON_SECRET not configured', new Error('missing CRON_SECRET'));
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (!hasValidMachineBearer(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Kill switch, mirroring social_config.posting_enabled: a bad deploy must
  // never be able to mass-push.
  if (process.env.EXPO_PUSH_ENABLED === 'false') {
    return NextResponse.json({ skipped: true, reason: 'EXPO_PUSH_ENABLED=false' });
  }

  const supabase = createAdminClient();
  const gotLock = await tryCronLock(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!gotLock) {
    return NextResponse.json({ skipped: true, reason: 'concurrent run' });
  }

  const startedAt = Date.now();
  try {
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
      return NextResponse.json({ error: 'Could not read outbox' }, { status: 500 });
    }

    const rows = pending ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, events: 0, sent: 0 });
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
      return NextResponse.json({ ok: true, events: rows.length, expired: expired.length, sent: 0 });
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

    const riverIds = [...new Set(events.map((e) => e.river_id))];

    const { data: subsData } = await supabase
      .from('alert_subscriptions')
      .select('id, user_id, river_id, kind, one_shot, fired_at')
      .in('river_id', riverIds);
    const subscriptions = (subsData ?? []) as FanoutSubscription[];

    if (subscriptions.length === 0) {
      await markDelivered(supabase, events.map((e) => e.id));
      return NextResponse.json({ ok: true, events: events.length, sent: 0, reason: 'no subscribers' });
    }

    const userIds = [...new Set(subscriptions.map((s) => s.user_id))];

    const { data: tokensData } = await supabase
      .from('device_tokens')
      .select('id, user_id, expo_push_token, disabled_at')
      .in('user_id', userIds)
      .is('disabled_at', null);
    const tokens = (tokensData ?? []) as FanoutToken[];

    // Entitlement is re-checked HERE, not at subscribe time: a lapse between
    // subscribing and the transition must not leak paid push.
    const { data: entitlementRows } = await supabase
      .from('entitlements')
      .select('user_id, expires_at, environment')
      .in('user_id', userIds)
      .eq('entitlement_id', 'eddy_plus');
    const entitledUserIds = new Set(
      (entitlementRows ?? [])
        .filter((row: { expires_at: string | null; environment: string | null }) =>
          isEntitlementActive(row)
        )
        .map((row: { user_id: string }) => row.user_id)
    );

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
      entitledUserIds,
      recentDeliveries: recentData ?? [],
    });

    let sent = 0;
    let failed = 0;
    const failuresByToken = new Map<string, number>();

    for (const [index, batch] of chunkMessages(plan.messages.map((m) => m.message)).entries()) {
      const offset = index * 100;
      const tickets = await sendExpoPush(batch);

      const ledgerRows = tickets.map((ticket, i) => {
        const planned = plan.messages[offset + i];
        const errorKind = classifyTicketError(ticket);
        if (ticket.status === 'ok') sent++;
        else {
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
      if (dead.length > 0) {
        await supabase
          .from('device_tokens')
          .update({ disabled_at: new Date().toISOString() })
          .in('id', dead);
      }

      // Jitter between batches so a fan-out doesn't become a synchronized
      // stampede back onto our own API when everyone opens the app.
      if (index < plan.messages.length / 100 - 1) await sleep(300);
    }

    // Bump failure counts for tokens that errored without a definitive
    // DeviceNotRegistered, and disable the persistently broken ones.
    for (const [tokenId, count] of failuresByToken) {
      const { data: row } = await supabase
        .from('device_tokens')
        .select('failure_count')
        .eq('id', tokenId)
        .maybeSingle();
      const next = (row?.failure_count ?? 0) + count;
      await supabase
        .from('device_tokens')
        .update({
          failure_count: next,
          ...(next >= FAILURE_DISABLE_THRESHOLD ? { disabled_at: new Date().toISOString() } : {}),
        })
        .eq('id', tokenId);
    }

    if (plan.oneShotSubscriptionIds.length > 0) {
      await supabase
        .from('alert_subscriptions')
        .update({ fired_at: new Date().toISOString() })
        .in('id', plan.oneShotSubscriptionIds);
    }

    await markDelivered(supabase, events.map((e) => e.id));

    const durationMs = Date.now() - startedAt;
    logger.info('[deliver-push] pass complete', {
      events: events.length,
      expired: expired.length,
      planned: plan.messages.length,
      sent,
      failed,
      skipped: plan.skipped,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      events: events.length,
      expired: expired.length,
      planned: plan.messages.length,
      sent,
      failed,
      skipped: plan.skipped,
      durationMs,
    });
  } catch (error) {
    logger.error('[deliver-push] pass failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await releaseCronLock(supabase, LOCK_JOB);
  }
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
