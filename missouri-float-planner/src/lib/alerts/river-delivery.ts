// src/lib/alerts/river-delivery.ts
// The river-condition half of the push drain. Called by /api/cron/deliver-push.
//
// Moved out of the route so its failure paths can be tested against a fake
// database and transport — the three bugs that once lived here (a failed read
// draining the outbox, a failed send suppressing its own retry, one success
// completing a whole river's audience) were all in this glue, and none of them
// was reachable from the pure planners' tests.
//
// Delivery is AT-LEAST-ONCE per recipient and idempotent per device:
// river_condition_events.push_delivered_at marks an event drained, while
// alert_push_deliveries records who actually received it, so a retry plans
// only the recipients still missing and a pass killed mid-send does not
// re-notify everyone on the next run.

import { planDeliveries, type FanoutEvent, type FanoutSubscription, type FanoutToken, type RecentDelivery } from './fanout';
import { planDrain, spentOneShots, type DrainOutcome } from './drain';
import { checkedWrite, readAllIn, recordOutcomes, IN_CHUNK } from './delivery-io';
import { disableTokens, recordTokenFailures } from './token-health';
import { chunkMessages, classifyTicketError, sendExpoPush, type ExpoMessage, type ExpoTicket } from '@/lib/push/expo';
import type { NotificationPreferences } from '@/types/api';
import { logger } from '@/lib/logger';

/**
 * Events older than this are drained WITHOUT sending. After a delivery outage,
 * "your river is floatable" must never fire about water that has since dropped.
 */
export const MAX_EVENT_AGE_HOURS = 3;
export const MAX_ATTEMPTS = 5;
const EVENT_BATCH = 200;
const COOLDOWN_WINDOW_MS = 4 * 60 * 60 * 1000;

export type PushSender = (messages: ExpoMessage[]) => Promise<ExpoTicket[]>;

export interface RiverDeliveryOptions {
  now?: Date;
  /** Injected for tests; defaults to Expo. */
  send?: PushSender;
  /** Pause between Expo batches. Injected so tests do not wait. */
  pauseMs?: number;
}

export interface RiverPassResult {
  body: Record<string, unknown>;
  status: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function countOutcomes(outcomes: Map<string, DrainOutcome>): Partial<Record<DrainOutcome, number>> {
  const counts: Partial<Record<DrainOutcome, number>> = {};
  for (const outcome of outcomes.values()) counts[outcome] = (counts[outcome] ?? 0) + 1;
  return counts;
}

/**
 * One river pass. Throws DeliveryReadError when a read it depends on fails —
 * the caller reports the pass as failed and the outbox keeps every event,
 * because nothing has been sent or drained by the time any of those reads run.
 */
export async function drainRiverEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  options: RiverDeliveryOptions = {},
): Promise<RiverPassResult> {
  const now = options.now ?? new Date();
  const send = options.send ?? ((messages: ExpoMessage[]) => sendExpoPush(messages));
  const pauseMs = options.pauseMs ?? 300;
  const startedAt = Date.now();
  const cutoff = new Date(now.getTime() - MAX_EVENT_AGE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: pending, error: eventsError } = await supabase
    .from('river_condition_events')
    // river_gauges is joined WITHOUT !inner, unlike rivers. The gauge is
    // enrichment — it makes the notification say which reading moved — and an
    // event whose pairing was deleted must still be delivered without it. An
    // inner join here would silently drop those alerts, which on a warning is
    // the worst possible way to save a line of copy.
    .select('id, river_id, kind, old_condition_code, new_condition_code, reading_at, reading_value, reading_unit, detected_at, push_attempts, rivers!inner(name, slug), river_gauges(gauge_stations(name))')
    .is('push_delivered_at', null)
    .lt('push_attempts', MAX_ATTEMPTS)
    .in('kind', ['floatable', 'warning', 'easing'])
    .order('detected_at', { ascending: true })
    .limit(EVENT_BATCH);

  if (eventsError) {
    logger.error('[deliver-push] could not read outbox', eventsError);
    return { body: { ok: false, error: 'Could not read outbox' }, status: 500 };
  }

  const rows = pending ?? [];
  if (rows.length === 0) {
    return { body: { ok: true, events: 0, sent: 0 }, status: 200 };
  }

  // Drain anything too old to be actionable, without sending.
  const expired = rows.filter((r: { detected_at: string }) => r.detected_at < cutoff);
  if (expired.length > 0) {
    const ids = expired.map((r: { id: string }) => r.id);
    if (await markDelivered(supabase, ids, now)) {
      await recordOutcomes(supabase, 'river_condition_events', new Map(ids.map((id: string) => [id, 'expired' as const])));
    }
  }

  const fresh = rows.filter((r: { detected_at: string }) => r.detected_at >= cutoff);
  if (fresh.length === 0) {
    return { body: { ok: true, events: rows.length, expired: expired.length, sent: 0 }, status: 200 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: FanoutEvent[] = fresh.map((r: any) => {
    // PostgREST returns an embedded row as an object or a one-element array
    // depending on the relationship it inferred; both shapes appear here.
    const river = Array.isArray(r.rivers) ? r.rivers[0] : r.rivers;
    const pairing = Array.isArray(r.river_gauges) ? r.river_gauges[0] : r.river_gauges;
    const station = Array.isArray(pairing?.gauge_stations)
      ? pairing.gauge_stations[0]
      : pairing?.gauge_stations;
    return {
      id: r.id,
      river_id: r.river_id,
      kind: r.kind,
      old_condition_code: r.old_condition_code,
      new_condition_code: r.new_condition_code,
      river_name: river?.name ?? null,
      river_slug: river?.slug ?? null,
      reading_at: r.reading_at,
      gauge_name: station?.name ?? null,
      reading_value: r.reading_value ?? null,
      reading_unit: r.reading_unit ?? null,
    };
  });

  // Kept out of FanoutEvent: how many times we've tried is delivery
  // bookkeeping, and the fan-out policy has no business seeing it.
  const attemptsByEvent = new Map<string, number>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fresh.map((r: any) => [r.id as string, (r.push_attempts as number) ?? 0])
  );
  const eventIds = events.map((e) => e.id);
  const riverIds = [...new Set(events.map((e) => e.river_id))];

  // ── Reads. Every one of these throws on failure; see delivery-io.ts ──────
  //
  // enabled is filtered HERE and not in the fan-out: planDeliveries answers
  // "who wants this?", and a paused subscription is not a policy question —
  // it is a row that should not have been fetched.
  const subscriptions = await readAllIn<FanoutSubscription>('alert subscriptions', riverIds, (chunk, from, to) =>
    supabase
      .from('alert_subscriptions')
      .select('id, user_id, river_id, kind, one_shot, fired_at')
      .eq('enabled', true)
      .in('river_id', chunk)
      .order('id')
      .range(from, to),
  );

  const userIds = [...new Set(subscriptions.map((s) => s.user_id))];

  const tokens = await readAllIn<FanoutToken>('device tokens', userIds, (chunk, from, to) =>
    supabase
      .from('device_tokens')
      .select('id, user_id, expo_push_token, disabled_at')
      .in('user_id', chunk)
      .is('disabled_at', null)
      .order('id')
      .range(from, to),
  );

  // Quiet hours. A user with no row is absent from this map, which
  // planDeliveries reads as "no window" — the default and the common case. A
  // FAILED read is not that: it would silently ignore every window this pass,
  // so it throws like the rest.
  const prefsRows = await readAllIn<{
    user_id: string;
    quiet_hours_enabled: boolean;
    quiet_start_minute: number | null;
    quiet_end_minute: number | null;
    timezone: string | null;
    safety_overrides_quiet: boolean;
  }>('notification preferences', userIds, (chunk, from, to) =>
    supabase
      .from('notification_preferences')
      .select('user_id, quiet_hours_enabled, quiet_start_minute, quiet_end_minute, timezone, safety_overrides_quiet')
      .in('user_id', chunk)
      .order('user_id')
      .range(from, to),
  );
  const preferences = new Map<string, NotificationPreferences>();
  for (const row of prefsRows) {
    preferences.set(row.user_id, {
      quietHoursEnabled: row.quiet_hours_enabled,
      quietStartMinute: row.quiet_start_minute,
      quietEndMinute: row.quiet_end_minute,
      timezone: row.timezone ?? 'America/Chicago',
      safetyOverridesQuiet: row.safety_overrides_quiet,
    });
  }

  // The cooldown: SENT rows only. The ledger also holds failed sends, stamped
  // with the same sent_at default, and counting those let a failed push
  // suppress its own retry for four hours.
  const since = new Date(now.getTime() - COOLDOWN_WINDOW_MS).toISOString();
  const recentDeliveries = await readAllIn<RecentDelivery>('recent deliveries', userIds, (chunk, from, to) =>
    supabase
      .from('alert_push_deliveries')
      .select('user_id, river_id, kind, sent_at, status')
      .in('user_id', chunk)
      .eq('status', 'sent')
      .gte('sent_at', since)
      .order('event_id')
      .order('device_token_id')
      .range(from, to),
  );

  // Who THIS batch of events already reached on an earlier pass. A retry is
  // for the recipients still missing, never for the ones already told.
  const reachedRows = await readAllIn<{ event_id: string; user_id: string }>('prior deliveries', eventIds, (chunk, from, to) =>
    supabase
      .from('alert_push_deliveries')
      .select('event_id, user_id')
      .in('event_id', chunk)
      .eq('status', 'sent')
      .order('event_id')
      .order('device_token_id')
      .range(from, to),
  );
  const alreadyReached = new Set<string>();
  const previouslyReached = new Map<string, number>();
  for (const row of reachedRows) {
    const key = `${row.event_id}|${row.user_id}`;
    if (alreadyReached.has(key)) continue;
    alreadyReached.add(key);
    previouslyReached.set(row.event_id, (previouslyReached.get(row.event_id) ?? 0) + 1);
  }

  const plan = planDeliveries({
    events,
    subscriptions,
    tokens,
    recentDeliveries,
    alreadyReached,
    preferences,
    now,
  });

  // ── Send ─────────────────────────────────────────────────────────────────
  let sent = 0;
  let failed = 0;
  const failuresByToken = new Map<string, number>();
  /**
   * Recipients reached per event — the completion tally. Per USER, not per
   * message: a person with two phones is reached when the first one buzzes,
   * but reaching one person never stands in for reaching another.
   */
  const reachedRecipients = new Map<string, Set<string>>();
  /**
   * Successful sends per SUBSCRIPTION, for spending one-shots. A one-shot is the
   * user's single chance to hear about a river, so it is spent only where a
   * push actually landed — never on a subscription the plan merely touched.
   */
  const successBySubscription = new Map<string, number>();

  const batches = chunkMessages(plan.messages.map((m) => m.message));
  for (const [index, batch] of batches.entries()) {
    const offset = index * 100;
    // Never throws — a whole-request failure comes back as one error ticket
    // per message, index-aligned, so the tally below is always complete.
    const tickets = await send(batch);

    const ledgerRows = tickets.map((ticket, i) => {
      const planned = plan.messages[offset + i];
      const errorKind = classifyTicketError(ticket);
      if (ticket.status === 'ok') {
        sent++;
        const reached = reachedRecipients.get(planned.eventId);
        if (reached) reached.add(planned.userId);
        else reachedRecipients.set(planned.eventId, new Set([planned.userId]));
        successBySubscription.set(planned.subscriptionId, (successBySubscription.get(planned.subscriptionId) ?? 0) + 1);
      } else {
        failed++;
        failuresByToken.set(planned.deviceTokenId, (failuresByToken.get(planned.deviceTokenId) ?? 0) + 1);
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
    // records rather than duplicates. A failure here is the one write that can
    // cause a duplicate push — the next pass learns who was reached from these
    // rows — so it is logged as an error rather than swallowed.
    await checkedWrite(
      'delivery ledger write',
      supabase.from('alert_push_deliveries').upsert(ledgerRows, { onConflict: 'event_id,device_token_id' }),
    );

    // Prune tokens Expo says are gone. DeviceNotRegistered usually arrives in
    // the RECEIPT rather than the ticket, so this catches only some —
    // failure_count below is the backstop.
    const dead = tickets
      .map((t, i) => (classifyTicketError(t) === 'device_not_registered' ? plan.messages[offset + i].deviceTokenId : null))
      .filter((id): id is string => !!id);
    await disableTokens(supabase, dead);

    // Jitter between batches so a fan-out doesn't become a synchronized
    // stampede back onto our own API when everyone opens the app.
    if (index < batches.length - 1 && pauseMs > 0) await sleep(pauseMs);
  }

  await recordTokenFailures(supabase, failuresByToken);

  // When each subscription last reached somebody — every subscription a push
  // landed for, one-shot or not. `fired_at` is the one-shot SPEND marker and
  // cannot answer this for a repeating alert.
  const delivering = [...successBySubscription.keys()];
  for (let i = 0; i < delivering.length; i += IN_CHUNK) {
    await checkedWrite(
      'last_triggered_at write',
      supabase
        .from('alert_subscriptions')
        .update({ last_triggered_at: now.toISOString() })
        .in('id', delivering.slice(i, i + IN_CHUNK)),
    );
  }

  // Spend a one-shot only where something actually landed. enabled:false
  // alongside fired_at, matching the gauge pass; `one_shot` and `is null` keep
  // the write scoped and idempotent.
  const spent = spentOneShots(plan.oneShotSubscriptionIds, successBySubscription);
  for (let i = 0; i < spent.length; i += IN_CHUNK) {
    await checkedWrite(
      'one-shot spend',
      supabase
        .from('alert_subscriptions')
        .update({ fired_at: now.toISOString(), enabled: false })
        .in('id', spent.slice(i, i + IN_CHUNK))
        .eq('one_shot', true)
        .is('fired_at', null),
    );
  }

  // ── Drain, or leave for the next pass ────────────────────────────────────
  const plannedRecipients = new Map<string, Set<string>>();
  for (const message of plan.messages) {
    const bucket = plannedRecipients.get(message.eventId);
    if (bucket) bucket.add(message.userId);
    else plannedRecipients.set(message.eventId, new Set([message.userId]));
  }

  const drain = planDrain({
    events: events.map((e) => ({ id: e.id, attempts: attemptsByEvent.get(e.id) ?? 0 })),
    plannedRecipients,
    reachedRecipients,
    previouslyReached,
    maxAttempts: MAX_ATTEMPTS,
  });

  for (const [attempts, ids] of drain.retryByNextAttempt) {
    await checkedWrite(
      'retry attempt write',
      supabase.from('river_condition_events').update({ push_attempts: attempts }).in('id', ids),
    );
  }

  if (await markDelivered(supabase, drain.delivered, now)) {
    await recordOutcomes(supabase, 'river_condition_events', drain.outcomes);
  }

  const retried = events.length - drain.delivered.length;
  const durationMs = Date.now() - startedAt;
  if (drain.givenUp > 0) {
    logger.error(
      '[deliver-push] events abandoned after MAX_ATTEMPTS',
      new Error(`${drain.givenUp} event(s) drained with ${drain.givenUpRecipients} recipient(s) never reached`),
    );
  }
  const summary = {
    events: events.length,
    expired: expired.length,
    planned: plan.messages.length,
    sent,
    failed,
    retried,
    givenUp: drain.givenUp,
    outcomes: countOutcomes(drain.outcomes),
    skipped: plan.skipped,
    durationMs,
  };
  logger.info('[deliver-push] pass complete', summary);

  return { body: { ok: true, ...summary }, status: 200 };
}

/**
 * Stamp events drained. Returns false on failure, which is logged: the events
 * stay in the outbox and the next pass re-plans them, excluding everyone the
 * ledger shows was already reached.
 */
async function markDelivered(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  eventIds: string[],
  now: Date,
): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < eventIds.length; i += IN_CHUNK) {
    ok =
      (await checkedWrite(
        'drain write',
        supabase
          .from('river_condition_events')
          .update({ push_delivered_at: now.toISOString() })
          .in('id', eventIds.slice(i, i + IN_CHUNK)),
      )) && ok;
  }
  return ok;
}

