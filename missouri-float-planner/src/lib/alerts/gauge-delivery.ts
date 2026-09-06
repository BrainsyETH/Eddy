// src/lib/alerts/gauge-delivery.ts
// The gauge-alert half of the push drain. Called by /api/cron/deliver-push.
//
// Kept out of that route rather than inlined because the two passes share only
// their transport: the river pass has to answer "who subscribed to this river?"
// and interleave the answer so one river's subscribers are not sent in a
// contiguous burst, while here the recipient is written on the event itself.
// Fan-out policy is the bulk of fanout.ts and none of it applies.
//
// What IS shared is deliberately shared — sendExpoPush, the ledger table, the
// drain rule in planDrain(), and token-health — so a fix to any of them reaches
// both paths.
//
// ── Quiet hours are applied HERE, not at evaluation ─────────────────────────
//
// The alternative is to suppress at evaluation time and never write the event,
// which is worse in both directions: the rule's crossing state would advance
// with nothing recorded, so the user would lose the alert AND the Alerts tab
// would never show what happened. Recording always and suppressing at the last
// moment keeps the feed honest — the change is visible in the morning even
// though the phone stayed silent.

import { planDrain, spentOneShots } from './drain';
import { isRuleLive, parentIdsOf, type GatedRule } from './gating';
import { buildGaugeNotification, type GaugeEventKind } from './gauge-threshold';
import { suppressedByQuietHours } from './quiet-hours';
import { planRearm, REARMED_RULE_STATE, type SuppressedEvent } from './quiet-hours-rearm';
import { disableTokens, recordTokenFailures } from './token-health';
import { chunkMessages, classifyTicketError, sendExpoPush, type ExpoMessage } from '@/lib/push/expo';
import type { AlertComparator, AlertMetric, AlertSubscriptionKind, NotificationPreferences } from '@/types/api';
import { logger } from '@/lib/logger';

/**
 * Events older than this are drained WITHOUT sending — the same rule the river
 * pass applies. After a delivery outage, "the Meramec is above 3 ft" must never
 * fire about water that has since dropped.
 */
const MAX_EVENT_AGE_HOURS = 3;
const MAX_ATTEMPTS = 5;
const EVENT_BATCH = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface GaugeDeliveryStats {
  events: number;
  expired: number;
  planned: number;
  sent: number;
  failed: number;
  quietSuppressed: number;
  /** Threshold rules put back on the far side of their line after a quiet window ended. */
  rearmed: number;
  /** Events dropped because the rule, or its river alert, was paused since. */
  gated: number;
  retried: number;
  givenUp: number;
}

const EMPTY: GaugeDeliveryStats = {
  events: 0,
  expired: 0,
  planned: 0,
  sent: 0,
  failed: 0,
  quietSuppressed: 0,
  rearmed: 0,
  gated: 0,
  retried: 0,
  givenUp: 0,
};

interface PlannedGaugeMessage {
  message: ExpoMessage;
  eventId: string;
  /**
   * The rule this message serves.
   *
   * Carried so a one-shot can be spent on DELIVERY rather than on evaluation.
   * The event-level tally is not enough: one subscription produces one message
   * per device token, and success has to be counted per rule.
   */
  subscriptionId: string;
  deviceTokenId: string;
  userId: string;
  riverId: string | null;
  kind: GaugeEventKind;
}

/** PostgREST types a to-one embed as an array; at runtime it is one object. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toPreferences(row: {
  quiet_hours_enabled: boolean;
  quiet_start_minute: number | null;
  quiet_end_minute: number | null;
  timezone: string | null;
  safety_overrides_quiet: boolean;
}): NotificationPreferences {
  return {
    quietHoursEnabled: row.quiet_hours_enabled,
    quietStartMinute: row.quiet_start_minute,
    quietEndMinute: row.quiet_end_minute,
    timezone: row.timezone ?? 'America/Chicago',
    safetyOverridesQuiet: row.safety_overrides_quiet,
  };
}

/**
 * Which parent river alerts are paused, for the rules in this batch.
 *
 * The same two-step the evaluator uses — collect the ids the rows already
 * carry, then ask once which of them are off — rather than a second level of
 * PostgREST embedding. Skipped entirely when nothing in the batch is parented,
 * which is the common case.
 *
 * Returns an empty set on failure. Failing OPEN is deliberate: see isRuleLive.
 */
async function loadPausedParents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
): Promise<Set<string>> {
  const rules = rows
    .map((row) => one<GatedRule>(row.gauge_alert_subscriptions))
    .filter((rule): rule is GatedRule => rule !== null);
  const ids = parentIdsOf(rules);
  const paused = new Set<string>();
  if (ids.length === 0) return paused;

  const { data, error } = await supabase
    .from('alert_subscriptions')
    .select('id')
    .in('id', ids)
    .eq('enabled', false);

  if (error) {
    logger.error('[deliver-push:gauge] could not read parent alerts', error);
    return paused;
  }
  for (const row of data ?? []) paused.add(row.id as string);
  return paused;
}

/**
 * Drain gauge_alert_events to Expo.
 *
 * Returns stats rather than a response so the caller can fold them into its own
 * summary. Never throws: a failure here must not abort the river pass that ran
 * before it and already sent.
 */
export async function deliverGaugeAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date = new Date(),
): Promise<GaugeDeliveryStats> {
  try {
    // ── First, the debts from last night ────────────────────────────────────
    // Before reading the outbox: any rule whose event was suppressed by quiet
    // hours, for a user whose window has since ended, is put back on the far
    // side of its line so the NEXT evaluation re-reads the current number and
    // fires a fresh event if the water is still there. Ordered first so a
    // pass that finds the window just closed re-arms before it drains anything
    // new. See quiet-hours-rearm.ts for why this beats holding the old event.
    const rearmed = await rearmAfterQuietHours(supabase, now);

    const cutoff = new Date(now.getTime() - MAX_EVENT_AGE_HOURS * 60 * 60 * 1000).toISOString();

    const { data: pending, error } = await supabase
      .from('gauge_alert_events')
      .select(
        'id, subscription_id, user_id, gauge_station_id, river_id, kind, reading_value, ' +
          'reading_unit, reading_at, condition_code, detected_at, push_attempts, ' +
          'gauge_stations!inner(name, usgs_site_id, site_id_external), ' +
          'rivers(name, slug), ' +
          'gauge_alert_subscriptions!inner(scope, mode, condition_kind, metric, comparator, threshold_value, threshold_value_max, enabled, parent_subscription_id)',
      )
      .is('push_delivered_at', null)
      .lt('push_attempts', MAX_ATTEMPTS)
      .order('detected_at', { ascending: true })
      .limit(EVENT_BATCH);

    if (error) {
      logger.error('[deliver-push:gauge] could not read outbox', error);
      return { ...EMPTY, rearmed };
    }

    const rows = pending ?? [];
    if (rows.length === 0) return { ...EMPTY, rearmed };

    const expired = rows.filter((r: { detected_at: string }) => r.detected_at < cutoff);
    if (expired.length > 0) {
      await markDelivered(supabase, expired.map((r: { id: string }) => r.id));
    }

    const fresh = rows.filter((r: { detected_at: string }) => r.detected_at >= cutoff);
    if (fresh.length === 0) {
      return { ...EMPTY, events: rows.length, expired: expired.length, rearmed };
    }

    const userIds = [...new Set(fresh.map((r: { user_id: string }) => r.user_id))] as string[];

    const [{ data: tokensData }, { data: prefsData }] = await Promise.all([
      supabase
        .from('device_tokens')
        .select('id, user_id, expo_push_token')
        .in('user_id', userIds)
        .is('disabled_at', null),
      supabase
        .from('notification_preferences')
        .select('user_id, quiet_hours_enabled, quiet_start_minute, quiet_end_minute, timezone, safety_overrides_quiet')
        .in('user_id', userIds),
    ]);

    const tokensByUser = new Map<string, Array<{ id: string; expo_push_token: string }>>();
    for (const token of tokensData ?? []) {
      const bucket = tokensByUser.get(token.user_id);
      if (bucket) bucket.push(token);
      else tokensByUser.set(token.user_id, [token]);
    }

    const prefsByUser = new Map<string, NotificationPreferences>();
    for (const row of prefsData ?? []) prefsByUser.set(row.user_id, toPreferences(row));

    const planned: PlannedGaugeMessage[] = [];
    let quietSuppressed = 0;
    let gated = 0;
    /** Suppressed by quiet hours this pass: recorded on the row, not merely drained. */
    const quietSuppressedIds: string[] = [];

    /**
     * ── The gate, re-checked at SEND ────────────────────────────────────────
     *
     * Evaluation and delivery are separate crons on separate schedules, so an
     * outbox row can be up to five minutes old by the time it is read. Pausing
     * an alert and then being buzzed by it is the single most confusing thing
     * alerting can do — it reads as the switch not working, which is the
     * conclusion the user is least able to disprove.
     *
     * Both halves are checked here, the rule's own `enabled` and its parent's,
     * through the same predicate the evaluator used. `enabled` in particular
     * was never checked at this point: a rule paused in the gap still sent.
     */
    const pausedParents = await loadPausedParents(supabase, fresh);

    for (const row of fresh) {
      const kind = row.kind as GaugeEventKind;
      const prefs = prefsByUser.get(row.user_id) ?? null;

      if (suppressedByQuietHours(prefs, kind, now)) {
        quietSuppressed++;
        // Counted as handled, not retried. The window outlives MAX_EVENT_AGE_HOURS,
        // so leaving it in the outbox would only burn attempts until it expired.
        // RECORDED, though: the row is tagged so the re-arm step at the top of
        // the next passes can put the rule back once the window ends, and so
        // the activity list can say what the night held back.
        quietSuppressedIds.push(row.id as string);
        continue;
      }

      const station = one<{ name: string; usgs_site_id: string | null; site_id_external: string | null }>(
        row.gauge_stations,
      );
      const river = one<{ name: string; slug: string }>(row.rivers);
      const rule = one<{
        scope: 'river' | 'gauge';
        mode: 'condition' | 'threshold';
        condition_kind: AlertSubscriptionKind | null;
        metric: AlertMetric | null;
        comparator: AlertComparator | null;
        threshold_value: number | string | null;
        threshold_value_max: number | string | null;
        enabled: boolean;
        parent_subscription_id: string | null;
      }>(row.gauge_alert_subscriptions);

      if (!rule) continue;

      // Paused since this event was written. Counted as handled rather than
      // retried: the rule is off, and leaving the row in the outbox would only
      // burn attempts until it expired — the same reasoning quiet hours uses
      // a few lines above.
      if (!isRuleLive(rule, pausedParents)) {
        gated++;
        continue;
      }

      const notification = buildGaugeNotification({
        stationName: station?.name ?? 'Your gauge',
        riverName: river?.name ?? null,
        kind,
        readingValue: row.reading_value == null ? null : Number(row.reading_value),
        readingUnit: row.reading_unit,
        conditionCode: row.condition_code,
        rule: {
          mode: rule.mode,
          conditionKind: rule.condition_kind,
          metric: rule.metric,
          comparator: rule.comparator,
          thresholdValue: rule.threshold_value == null ? null : Number(rule.threshold_value),
          thresholdValueMax:
            rule.threshold_value_max == null ? null : Number(rule.threshold_value_max),
        },
      });

      // EXACTLY ONE routing key, chosen by the rule's scope. Sending both and
      // letting the app pick would put the decision in the client, where a
      // gauge alert on a station that happens to rate a river would open the
      // river screen — which never mentions the station the user chose.
      const siteId = station?.usgs_site_id ?? station?.site_id_external ?? null;
      const routing =
        rule.scope === 'river' && river?.slug
          ? { riverSlug: river.slug, gaugeSiteId: null }
          : { riverSlug: null, gaugeSiteId: siteId };

      for (const token of tokensByUser.get(row.user_id) ?? []) {
        planned.push({
          message: {
            to: token.expo_push_token,
            title: notification.title,
            body: notification.body,
            sound: 'default',
            priority: kind === 'warning' ? 'high' : 'default',
            data: {
              eventId: row.id,
              alertId: row.subscription_id,
              // The half fanout.ts explains: a rule is addressed as
              // (id, source) across the app, never id alone.
              alertSource: 'gauge',
              kind,
              condition: row.condition_code,
              ...routing,
            },
          },
          eventId: row.id,
          subscriptionId: row.subscription_id,
          deviceTokenId: token.id,
          userId: row.user_id,
          riverId: row.river_id,
          kind,
        });
      }
    }

    let sent = 0;
    let failed = 0;
    const failuresByToken = new Map<string, number>();
    const successByEvent = new Map<string, number>();
    // Per RULE, not per event. A one-shot is spent by a push reaching a device,
    // and one rule can produce several messages (one per device token) spread
    // across non-adjacent batches by the interleave — so the tally has to be
    // complete before anything is decided, which it is: the batch loop ends
    // before the update below.
    const successBySubscription = new Map<string, number>();

    for (const [index, batch] of chunkMessages(planned.map((m) => m.message)).entries()) {
      const offset = index * 100;
      // Never throws — a whole-request failure comes back as one error ticket
      // per message, index-aligned, so the tally below is always complete.
      const tickets = await sendExpoPush(batch);

      const ledgerRows = tickets.map((ticket, i) => {
        const message = planned[offset + i];
        const errorKind = classifyTicketError(ticket);
        if (ticket.status === 'ok') {
          sent++;
          successByEvent.set(message.eventId, (successByEvent.get(message.eventId) ?? 0) + 1);
          successBySubscription.set(
            message.subscriptionId,
            (successBySubscription.get(message.subscriptionId) ?? 0) + 1,
          );
        } else {
          failed++;
          failuresByToken.set(
            message.deviceTokenId,
            (failuresByToken.get(message.deviceTokenId) ?? 0) + 1,
          );
        }
        return {
          event_id: message.eventId,
          device_token_id: message.deviceTokenId,
          user_id: message.userId,
          river_id: message.riverId,
          kind: message.kind,
          // The one column that distinguishes these rows from the river pass's.
          // There is no FK behind event_id any more — see migration 00203.
          event_source: 'gauge_alert',
          ticket_id: ticket.id ?? null,
          status: ticket.status === 'ok' ? 'sent' : 'error',
          error_code: errorKind,
        };
      });

      await supabase
        .from('alert_push_deliveries')
        .upsert(ledgerRows, { onConflict: 'event_id,device_token_id' });

      const dead = tickets
        .map((t, i) =>
          classifyTicketError(t) === 'device_not_registered'
            ? planned[offset + i].deviceTokenId
            : null,
        )
        .filter((id): id is string => !!id);
      await disableTokens(supabase, dead);

      if (index < planned.length / 100 - 1) await sleep(300);
    }

    await recordTokenFailures(supabase, failuresByToken);

    // ── Spend the one-shots that were actually delivered ────────────────────
    //
    // Nothing here filters on one_shot: the WHERE clause does, which keeps the
    // set of "which rules are one-shot" in one place instead of asking for it
    // and then trusting the answer. `is null` makes the update idempotent, so a
    // retried pass cannot move the timestamp of an already-spent rule.
    //
    // Delivered means AT LEAST ONE of the rule's messages succeeded, mirroring
    // planDrain's partial-delivery rule — a person with two phones has been
    // told once the first one buzzes.
    //
    // ── enabled:false is not bookkeeping, it is the promise being kept ──────
    //
    // The app has always said "We'll tell you the first time, then switch this
    // alert off", and nothing switched it off. The spend was recorded only in
    // one_shot_fired_at, so the rule's own Active switch stayed on for something
    // that could never fire again — every surface that reads `enabled` was
    // telling the user the opposite of the truth.
    //
    // Every path that clears one_shot_fired_at must therefore set enabled back
    // to true, or re-arming would leave a rule that is armed and paused. See the
    // rearm blocks in the two PATCH routes.
    const spent = spentOneShots([...successBySubscription.keys()], successBySubscription);
    if (spent.length > 0) {
      await supabase
        .from('gauge_alert_subscriptions')
        .update({ one_shot_fired_at: now.toISOString(), enabled: false })
        .in('id', spent)
        .eq('one_shot', true)
        .is('one_shot_fired_at', null);
    }

    // An event with nothing planned — quiet hours, or no active device — is
    // drained rather than retried. Retrying it would refill the outbox every
    // five minutes with notifications nobody can receive.
    const plannedByEvent = new Map<string, number>();
    for (const message of planned) {
      plannedByEvent.set(message.eventId, (plannedByEvent.get(message.eventId) ?? 0) + 1);
    }

    const { delivered, retryByNextAttempt, givenUp } = planDrain({
      events: fresh.map((r: { id: string; push_attempts: number | null }) => ({
        id: r.id,
        attempts: r.push_attempts ?? 0,
      })),
      plannedByEvent,
      successByEvent,
      maxAttempts: MAX_ATTEMPTS,
    });

    for (const [attempts, ids] of retryByNextAttempt) {
      await supabase.from('gauge_alert_events').update({ push_attempts: attempts }).in('id', ids);
    }
    // Tag BEFORE the drain stamp so a pass that dies between the two leaves a
    // row that is suppressed-and-pending (retried, re-tagged) rather than
    // drained-and-anonymous (lost).
    if (quietSuppressedIds.length > 0) {
      await supabase
        .from('gauge_alert_events')
        .update({ suppressed_reason: 'quiet_hours' })
        .in('id', quietSuppressedIds);
    }
    await markDelivered(supabase, delivered);

    if (givenUp > 0) {
      logger.error(
        '[deliver-push:gauge] events abandoned after MAX_ATTEMPTS',
        new Error(`${givenUp} gauge alert(s) never reached a device`),
      );
    }

    return {
      events: rows.length,
      expired: expired.length,
      planned: planned.length,
      sent,
      failed,
      quietSuppressed,
      rearmed,
      gated,
      retried: fresh.length - delivered.length,
      givenUp,
    };
  } catch (error) {
    logger.error('[deliver-push:gauge] pass failed', error);
    return EMPTY;
  }
}

/**
 * Put back every threshold rule whose quiet-hours suppression has now lapsed.
 *
 * Reads the small set of suppressed-and-not-yet-rearmed events, decides per
 * user whether the window has ended (planRearm), writes the rule state that
 * lets the next evaluation fire afresh, and stamps the events so they leave
 * the lookup. Never throws — a failure here costs one pass of latency on the
 * morning notification and nothing else, and must not stop the drain.
 *
 * Returns the number of rules re-armed, for the pass's stats.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rearmAfterQuietHours(supabase: any, now: Date): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('gauge_alert_events')
      .select('id, subscription_id, user_id, gauge_alert_subscriptions!inner(mode)')
      .not('suppressed_reason', 'is', null)
      .is('rearmed_at', null)
      .order('detected_at', { ascending: true })
      .limit(EVENT_BATCH);

    if (error) {
      logger.error('[deliver-push:gauge] could not read suppressed events', error);
      return 0;
    }
    const rows = data ?? [];
    if (rows.length === 0) return 0;

    const suppressed: SuppressedEvent[] = rows.map(
      (row: {
        id: string;
        subscription_id: string;
        user_id: string;
        gauge_alert_subscriptions: { mode: 'condition' | 'threshold' } | { mode: 'condition' | 'threshold' }[];
      }) => ({
        id: row.id,
        subscriptionId: row.subscription_id,
        userId: row.user_id,
        mode: one(row.gauge_alert_subscriptions)?.mode ?? 'threshold',
      }),
    );

    const userIds = [...new Set(suppressed.map((s) => s.userId))];
    const { data: prefsData } = await supabase
      .from('notification_preferences')
      .select('user_id, quiet_hours_enabled, quiet_start_minute, quiet_end_minute, timezone, safety_overrides_quiet')
      .in('user_id', userIds);

    const prefsByUser = new Map<string, NotificationPreferences>();
    for (const row of prefsData ?? []) prefsByUser.set(row.user_id, toPreferences(row));

    const plan = planRearm(suppressed, prefsByUser, now);
    if (plan.eventIds.length === 0) return 0;

    // The rule first, then the stamp: a pass that dies between the two re-arms
    // the same rule again next time, which is idempotent, rather than stamping
    // an event whose rule was never put back.
    if (plan.subscriptionIds.length > 0) {
      await supabase
        .from('gauge_alert_subscriptions')
        .update(REARMED_RULE_STATE)
        .in('id', plan.subscriptionIds)
        .eq('mode', 'threshold');
    }
    await supabase
      .from('gauge_alert_events')
      .update({ rearmed_at: now.toISOString() })
      .in('id', plan.eventIds);

    return plan.subscriptionIds.length;
  } catch (error) {
    logger.error('[deliver-push:gauge] re-arm after quiet hours failed', error);
    return 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markDelivered(supabase: any, eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  await supabase
    .from('gauge_alert_events')
    .update({ push_delivered_at: new Date().toISOString() })
    .in('id', eventIds);
}
