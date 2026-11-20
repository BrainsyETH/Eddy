// src/lib/alerts/dam-generation-delivery.ts
// The dam-generation third of the push drain. Called by /api/cron/deliver-push
// after the river and gauge passes, inside the same lock.
//
// ── One pass does both halves ───────────────────────────────────────────────
//
// River and gauge alerts are evaluated by one cron and delivered by another,
// because working out that a river changed takes a reading. This alert takes a
// clock: a posted start is known hours ahead, and "is it time" is arithmetic.
// So this pass QUEUES the notices that have fallen due and then DRAINS the
// outbox, every five minutes, with nothing to keep in step between two crons.
//
// The outbox still exists, for the reasons the other two have one: a send that
// fails is retried on the next pass, a pass killed mid-send does not notify
// twice (the ledger records who was reached), and the unique constraint on
// (alert, start, lead) is what stops the same due notice being queued again
// on every pass it stays inside its window.
//
// ── Runs before its tables exist ────────────────────────────────────────────
//
// The migration is applied to production separately from the deploy that
// carries this code. Until it is, the first read finds no table; that returns
// quietly with `notReady` rather than failing a run that just delivered river
// and gauge alerts.
//
// What is shared with gauge-delivery.ts is shared on purpose: sendExpoPush, the
// ledger table, planDrain, quiet hours and token-health. Policy lives in
// dam-generation.ts.

import { planDrain } from './drain';
import { checkedWrite, readAllIn, recordOutcomes, DeliveryReadError, IN_CHUNK, READ_PAGE } from './delivery-io';
import {
  buildDamGenerationNotification,
  DAM_GENERATION_KIND,
  dueNotices,
  freshPostedSchedule,
  inSendWindow,
  leadsOf,
  pushTtlSeconds,
  startStanding,
  type DamAlertRow,
  type LeadMinutes,
  type PostedSchedule,
  type PostedStart,
} from './dam-generation';
import { toPreferences } from './gauge-delivery';
import { suppressedByQuietHours } from './quiet-hours';
import { disableTokens } from './token-health';
import { chunkMessages, classifyTicketError, sendExpoPush, type ExpoMessage, type ExpoTicket } from '@/lib/push/expo';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import type { DamScheduleDay } from '@shared/dam-types';
import type { NotificationPreferences } from '@/types/api';
import { logger } from '@/lib/logger';

export const MAX_ATTEMPTS = 5;
const EVENT_BATCH = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface DamGenerationStats {
  /** Alerts read. */
  alerts: number;
  /** Notices that were due this pass (queued now or already in the outbox). */
  due: number;
  events: number;
  expired: number;
  planned: number;
  sent: number;
  failed: number;
  quietSuppressed: number;
  /** Dropped because the alert changed, or the start left the posted schedule. */
  gated: number;
  /**
   * Held back because no fresh schedule confirms the start: not sent, and not
   * drained, so it goes out if a fresh sheet arrives before its window closes.
   */
  unconfirmed: number;
  retried: number;
  givenUp: number;
  outcomes?: Partial<Record<'sent' | 'skipped' | 'expired' | 'given_up', number>>;
  /** The tables are not migrated yet. Nothing ran; not an error. */
  notReady?: true;
  /** Set when the pass aborted on a read it could not do without. */
  error?: string;
}

export interface DamGenerationOptions {
  /** Injected for tests; defaults to Expo. */
  send?: (messages: ExpoMessage[]) => Promise<ExpoTicket[]>;
  /** Pause between Expo batches. Injected so tests do not wait. */
  pauseMs?: number;
}

const EMPTY: DamGenerationStats = {
  alerts: 0,
  due: 0,
  events: 0,
  expired: 0,
  planned: 0,
  sent: 0,
  failed: 0,
  quietSuppressed: 0,
  gated: 0,
  unconfirmed: 0,
  retried: 0,
  givenUp: 0,
};

/** Table missing in Postgres (42P01) or in PostgREST's schema cache (PGRST205). */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/**
 * Every alert, or null when the table has not been migrated.
 *
 * Paged by hand rather than through readAll because readAll reduces an error
 * to its message, and "no table yet" is told apart by its code.
 */
async function readAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<DamAlertRow[] | null> {
  const out: DamAlertRow[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await supabase
      .from('dam_generation_alerts')
      .select('id, user_id, dam_id, notify_at_start, notify_hour_before')
      .order('id')
      .range(from, from + READ_PAGE - 1);
    if (error) {
      if (isMissingTable(error)) return null;
      throw new DeliveryReadError('dam generation alerts', error.message ?? 'unknown error');
    }
    const rows = (data ?? []) as DamAlertRow[];
    out.push(...rows);
    if (rows.length < READ_PAGE) return out;
  }
}

interface SnapshotRow {
  dam_id: string;
  /** `payload->schedule`, which is all this pass reads of a ten-kilobyte row. */
  schedule?: DamScheduleDay[] | null;
}

/**
 * What each watched dam's schedule says now, from the stored snapshots.
 *
 * ── Fresh by the SHEET, not by the snapshot ─────────────────────────────────
 * Each posted day is trusted by its own `retrievedAt` (scheduleDayIsFresh).
 * When the snapshot row was rebuilt says nothing: a rebuild carries the
 * previous sheet forward over failed SWPA reads for up to six hours, and this
 * pass once took a five-minute-old row around a five-hour-old sheet as current.
 *
 * A dam with no snapshot row has no entry. A dam whose every day is stale has
 * an entry with no starts and no fresh days. Either way nothing is queued for
 * it, and a notice already queued is held rather than sent — see startStanding.
 */
async function readPostedSchedules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  damIds: string[],
  now: Date,
): Promise<Map<string, PostedSchedule>> {
  const rows = await readAllIn<SnapshotRow>('dam schedules', damIds, (chunk, from, to) =>
    supabase
      .from('dam_snapshots')
      .select('dam_id, schedule:payload->schedule')
      .in('dam_id', chunk)
      .order('dam_id')
      .range(from, to),
  );

  const posted = new Map<string, PostedSchedule>();
  for (const row of rows) {
    if (!Array.isArray(row.schedule)) continue;
    posted.set(row.dam_id, freshPostedSchedule(row.schedule, now.getTime()));
  }
  return posted;
}

interface EventRow {
  id: string;
  alert_id: string;
  user_id: string;
  dam_id: string;
  start_at: string;
  lead_minutes: number;
  push_attempts: number | null;
}

interface PlannedMessage {
  message: ExpoMessage;
  eventId: string;
  deviceTokenId: string;
  userId: string;
}

/**
 * Queue the dam generation notices that are due, then drain the outbox.
 *
 * Returns stats rather than a response so the caller can fold them into its
 * own summary. Never throws: a failure here must not undo the river and gauge
 * passes that ran before it and already sent.
 */
export async function deliverDamGenerationAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date = new Date(),
  options: DamGenerationOptions = {},
): Promise<DamGenerationStats> {
  const send = options.send ?? ((messages: ExpoMessage[]) => sendExpoPush(messages));
  const pauseMs = options.pauseMs ?? 300;
  const nowMs = now.getTime();

  try {
    const alerts = await readAlerts(supabase);
    if (alerts === null) return { ...EMPTY, notReady: true };
    // No alerts means no outbox rows either: deleting an alert cascades.
    if (alerts.length === 0) return EMPTY;

    const alertsById = new Map(alerts.map((alert) => [alert.id, alert]));
    const damIds = [...new Set(alerts.map((alert) => alert.dam_id))];
    const postedByDam = await readPostedSchedules(supabase, damIds, now);
    const startsByDam = new Map<string, PostedStart[]>(
      [...postedByDam].map(([damId, posted]) => [damId, posted.starts]),
    );

    // ── Queue ───────────────────────────────────────────────────────────────
    // ignoreDuplicates is the point: a notice stays due for the whole of its
    // window and is re-derived every pass, and only the first insert may land.
    //
    // A failed insert is REPORTED, not swallowed. The next pass re-derives the
    // same notice and can still queue it, but a write that keeps failing eats
    // the whole send window, and a run that said "one due, none queued, no
    // error" each time would let that happen behind a green cron.
    const due = dueNotices(alerts, startsByDam, nowMs);
    let queueFailed = false;
    for (let i = 0; i < due.length; i += IN_CHUNK) {
      const queued = await checkedWrite(
        'dam generation outbox insert',
        supabase.from('dam_generation_alert_events').upsert(
          due.slice(i, i + IN_CHUNK).map((notice) => ({
            alert_id: notice.alertId,
            user_id: notice.userId,
            dam_id: notice.damId,
            start_at: notice.startAt,
            lead_minutes: notice.leadMinutes,
          })),
          { onConflict: 'alert_id,start_at,lead_minutes', ignoreDuplicates: true },
        ),
      );
      if (!queued) queueFailed = true;
    }
    // Carried on every return below: what is already in the outbox still
    // drains, and the run is still failed.
    const queueError = queueFailed ? { error: 'could not queue due notices' } : {};

    // ── Drain ───────────────────────────────────────────────────────────────
    const { data: pending, error } = await supabase
      .from('dam_generation_alert_events')
      .select('id, alert_id, user_id, dam_id, start_at, lead_minutes, push_attempts')
      .is('push_delivered_at', null)
      .lt('push_attempts', MAX_ATTEMPTS)
      .order('start_at', { ascending: true })
      .limit(EVENT_BATCH);

    if (error) {
      logger.error('[deliver-push:dam] could not read outbox', error);
      return { ...EMPTY, alerts: alerts.length, due: due.length, error: 'could not read outbox' };
    }

    const rows = (pending ?? []) as EventRow[];
    if (rows.length === 0) return { ...EMPTY, alerts: alerts.length, due: due.length, ...queueError };

    // Past its window: drained without sending. An "hour before" notice that
    // could not go out in time is not sent late — see SEND_WINDOW_MINUTES.
    const live = (row: EventRow) => inSendWindow(Date.parse(row.start_at), row.lead_minutes, nowMs);
    const expired = rows.filter((row) => !live(row));
    if (expired.length > 0) {
      const ids = expired.map((row) => row.id);
      if (await markDelivered(supabase, ids, now)) {
        await recordOutcomes(supabase, 'dam_generation_alert_events', new Map(ids.map((id) => [id, 'expired' as const])));
      }
    }

    const fresh = rows.filter(live);
    const base = {
      ...EMPTY,
      alerts: alerts.length,
      due: due.length,
      events: rows.length,
      expired: expired.length,
      ...queueError,
    };
    if (fresh.length === 0) return base;

    const userIds = [...new Set(fresh.map((row) => row.user_id))];
    const eventIds = fresh.map((row) => row.id);

    // Each of these throws on failure (see delivery-io.ts): "no tokens" plans
    // nothing and drains the event, "no preferences" ignores quiet hours, "no
    // prior deliveries" re-sends. None of those may be what a failed read means.
    const [tokensData, prefsData, reachedRows] = await Promise.all([
      readAllIn<{ id: string; user_id: string; expo_push_token: string }>('device tokens', userIds, (chunk, from, to) =>
        supabase
          .from('device_tokens')
          .select('id, user_id, expo_push_token')
          .in('user_id', chunk)
          .is('disabled_at', null)
          .order('id')
          .range(from, to),
      ),
      readAllIn<{
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
      ),
      // Events an earlier pass already delivered but could not stamp drained.
      readAllIn<{ event_id: string }>('prior deliveries', eventIds, (chunk, from, to) =>
        supabase
          .from('alert_push_deliveries')
          .select('event_id')
          .in('event_id', chunk)
          .eq('status', 'sent')
          .order('event_id')
          .order('device_token_id')
          .range(from, to),
      ),
    ]);

    const previouslyReached = new Map<string, number>();
    for (const row of reachedRows) previouslyReached.set(row.event_id, 1);

    const tokensByUser = new Map<string, Array<{ id: string; expo_push_token: string }>>();
    for (const token of tokensData) {
      const bucket = tokensByUser.get(token.user_id);
      if (bucket) bucket.push(token);
      else tokensByUser.set(token.user_id, [token]);
    }

    const prefsByUser = new Map<string, NotificationPreferences>();
    for (const row of prefsData) prefsByUser.set(row.user_id, toPreferences(row));

    const planned: PlannedMessage[] = [];
    let quietSuppressed = 0;
    let gated = 0;
    // Events held for a fresh schedule. Kept OUT of the drain plan entirely:
    // an event with nothing planned is drained as skipped, and these must
    // stay in the outbox, with no attempt spent, until confirmed or expired.
    const held = new Set<string>();

    for (const row of fresh) {
      if (previouslyReached.has(row.id)) continue;

      // Not a safety alert, so it never breaks a quiet window: a 6 AM start is
      // a 5 AM push, and someone who set "silent until 7" has said no to that.
      // Counted as handled rather than retried, as the gauge pass does.
      if (suppressedByQuietHours(prefsByUser.get(row.user_id) ?? null, DAM_GENERATION_KIND, now)) {
        quietSuppressed++;
        continue;
      }

      // ── The gate, re-checked at SEND ──────────────────────────────────────
      // The alert is read at the top of this same pass, so this covers the
      // case that matters: a notice queued a pass ago, on a retry, for a time
      // the person has since switched off.
      const alert = alertsById.get(row.alert_id);
      const startAt = Date.parse(row.start_at);
      if (!alert || !leadsOf(alert).includes(row.lead_minutes as LeadMinutes)) {
        gated++;
        continue;
      }

      // ── The schedule, re-checked at SEND ──────────────────────────────────
      // A notice is queued from a fresh sheet, but a retry can come up to half
      // an hour later. A start that has LEFT a fresh sheet is not announced.
      // One that no fresh sheet confirms any more is not announced on the old
      // one either: it is held, and sent only if a fresh sheet turns up.
      const standing = startStanding(postedByDam.get(row.dam_id), startAt);
      if (standing === 'withdrawn') {
        gated++;
        continue;
      }
      if (standing === 'unconfirmed') {
        held.add(row.id);
        continue;
      }

      const dam = getUsaceDam(row.dam_id);
      if (!dam) {
        gated++;
        continue;
      }

      const notification = buildDamGenerationNotification({ damName: dam.name, startAt });

      for (const token of tokensByUser.get(row.user_id) ?? []) {
        planned.push({
          message: {
            to: token.expo_push_token,
            title: notification.title,
            body: notification.body,
            sound: 'default',
            priority: 'default',
            // Dies with its send window, so a phone that was offline all
            // afternoon is not buzzed that evening about a start long past.
            ttl: pushTtlSeconds(startAt, row.lead_minutes, nowMs),
            data: {
              eventId: row.id,
              kind: DAM_GENERATION_KIND,
              // The one routing key. No riverSlug and no gaugeSiteId: a build
              // that predates the dam route opens the app and nothing else,
              // rather than a river or gauge screen this is not about.
              damId: row.dam_id,
            },
          },
          eventId: row.id,
          deviceTokenId: token.id,
          userId: row.user_id,
        });
      }
    }

    let sent = 0;
    let failed = 0;

    const reachedRecipients = new Map<string, Set<string>>();

    const batches = chunkMessages(planned.map((m) => m.message));
    for (const [index, batch] of batches.entries()) {
      const offset = index * 100;
      // Never throws — a whole-request failure comes back as one error ticket
      // per message, index-aligned, so the tally below is always complete.
      const tickets = await send(batch);

      const ledgerRows = tickets.map((ticket, i) => {
        const message = planned[offset + i];
        if (ticket.status === 'ok') {
          sent++;
          reachedRecipients.set(message.eventId, new Set([message.userId]));
        } else {
          failed++;

        }
        return {
          event_id: message.eventId,
          device_token_id: message.deviceTokenId,
          user_id: message.userId,
          river_id: null,
          kind: DAM_GENERATION_KIND,
          event_source: 'dam_generation',
          ticket_id: ticket.id ?? null,
          status: ticket.status === 'ok' ? 'sent' : 'error',
          error_code: classifyTicketError(ticket),
        };
      });

      await checkedWrite(
        'dam generation ledger write',
        supabase.from('alert_push_deliveries').upsert(ledgerRows, { onConflict: 'event_id,device_token_id' }),
      );

      const dead = tickets
        .map((ticket, i) =>
          classifyTicketError(ticket) === 'device_not_registered' ? planned[offset + i].deviceTokenId : null,
        )
        .filter((id): id is string => !!id);
      await disableTokens(supabase, dead, now);

      if (index < batches.length - 1 && pauseMs > 0) await sleep(pauseMs);
    }


    // An event with nothing planned — quiet hours, a switched-off time, no
    // active device — is drained rather than retried.
    const plannedRecipients = new Map<string, Set<string>>();
    for (const message of planned) plannedRecipients.set(message.eventId, new Set([message.userId]));

    const { delivered, outcomes, retryByNextAttempt, givenUp } = planDrain({
      events: fresh
        .filter((row) => !held.has(row.id))
        .map((row) => ({ id: row.id, attempts: row.push_attempts ?? 0 })),
      plannedRecipients,
      reachedRecipients,
      previouslyReached,
      maxAttempts: MAX_ATTEMPTS,
    });

    for (const [attempts, ids] of retryByNextAttempt) {
      await checkedWrite(
        'dam generation retry attempt write',
        supabase.from('dam_generation_alert_events').update({ push_attempts: attempts }).in('id', ids),
      );
    }
    if (await markDelivered(supabase, delivered, now)) {
      await recordOutcomes(supabase, 'dam_generation_alert_events', outcomes);
    }
    const outcomeCounts: NonNullable<DamGenerationStats['outcomes']> = {};
    for (const outcome of outcomes.values()) outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;

    if (givenUp > 0) {
      logger.error(
        '[deliver-push:dam] events abandoned after MAX_ATTEMPTS',
        new Error(`${givenUp} dam generation alert(s) never reached a device`),
      );
    }

    return {
      ...base,
      planned: planned.length,
      sent,
      failed,
      quietSuppressed,
      gated,
      unconfirmed: held.size,
      retried: fresh.length - held.size - delivered.length,
      givenUp,
      outcomes: outcomeCounts,
    };
  } catch (error) {
    logger.error('[deliver-push:dam] pass failed', error);
    return { ...EMPTY, error: error instanceof DeliveryReadError ? error.message : 'pass failed' };
  }
}

/** Stamp events drained; false (logged) on failure, leaving them for the next pass. */
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
        'dam generation drain write',
        supabase
          .from('dam_generation_alert_events')
          .update({ push_delivered_at: now.toISOString() })
          .in('id', eventIds.slice(i, i + IN_CHUNK)),
      )) && ok;
  }
  return ok;
}
