// src/lib/alerts/delivery-io.ts
// The database half of the two push passes that has to be right about FAILURE.
//
// Both passes used to destructure `{ data }` from every read and carry on with
// `data ?? []`. A failed read therefore looked exactly like an empty one, and
// an empty read is a decision: "no subscribers" drained the batch as delivered,
// "no tokens" planned nothing (which planDrain reads as finished), "no
// preferences" ignored everyone's quiet hours, and "no recent sends" defeated
// the cooldown. Each of those turned a transient database error into a lost or
// duplicated safety notification.
//
// The rule here is the opposite: a read that fails throws, the pass aborts
// before it has sent or drained anything, and the outbox keeps every event for
// the next run. Reads are also paged and their `in` lists chunked, because
// PostgREST truncates at its max-rows setting (1,000 by default) without
// saying so, and a long `in` list turns into a request line PostgREST refuses.

import type { DrainOutcome } from './drain';
import { logger } from '@/lib/logger';

export { READ_PAGE, IN_CHUNK, readAll, readAllIn, ReadError as DeliveryReadError } from '@/lib/supabase/paged-read';
import { IN_CHUNK, readAllIn } from '@/lib/supabase/paged-read';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Await a write and log it if it failed. Returns whether it succeeded.
 *
 * Writes after a send are logged, not thrown: the push has already left, so
 * aborting would only skip the bookkeeping that keeps the next pass from
 * resending. Each caller says what a failure costs.
 */
export async function checkedWrite(
  what: string,
  write: PromiseLike<{ error: { message?: string } | null }>,
): Promise<boolean> {
  try {
    const { error } = await write;
    if (!error) return true;
    logger.error(`[deliver-push] ${what} failed`, new Error(error.message ?? 'unknown error'));
  } catch (error) {
    logger.error(`[deliver-push] ${what} failed`, error);
  }
  return false;
}

/** Missing column (Postgres 42703) or one PostgREST's schema cache lacks (PGRST204). */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

type EventColumn = 'river_event_id' | 'gauge_event_id' | 'dam_event_id';

/** The ledger's event_source for each outbox, as the three passes write it. */
const EVENT_SOURCE: Record<EventColumn, string> = {
  river_event_id: 'river_condition',
  gauge_event_id: 'gauge_alert',
  dam_event_id: 'dam_generation',
};
interface TicketRow {
  event_id: string;
  user_id: string;
  status: string;
  sent_at: string;
  one_shot_rule_id?: string | null;
}

/** The normal ledger and the private record of acceptances whose tickets could not be saved. */
export async function priorPushRecipients(db: SupabaseClient, eventIds: string[], eventColumn: EventColumn) {
  const [tickets, unrecorded] = await Promise.all([
    readAllIn<{ event_id: string; user_id: string }>('prior deliveries', eventIds, (chunk, from, to) =>
      db.from('alert_push_deliveries').select('event_id, user_id')
        .eq('event_source', EVENT_SOURCE[eventColumn])
        .eq('status', 'sent').in('event_id', chunk)
        .order('event_id').order('device_token_id').range(from, to)),
    readAllIn<{ event_id: string; user_id: string }>('unrecorded recipients', eventIds, async (chunk, from, to) => {
      const { data, error } = await db.from('alert_push_unrecorded_recipients')
        .select(`${eventColumn}, user_id`).in(eventColumn, chunk)
        .order(eventColumn).order('user_id').range(from, to);
      // The table is additive. Any other read error must leave the outbox pending.
      if (error?.code === 'PGRST205' || error?.code === '42P01') return { data: [], error: null };
      // So is its dam column (20261121131051). Before it exists no dam row can
      // have been recorded, so there is nothing to miss.
      if (eventColumn === 'dam_event_id' && isMissingColumn(error)) return { data: [], error: null };
      const rows = (data ?? []) as unknown as Array<Record<string, string>>;
      return { data: rows.map(row => ({ event_id: row[eventColumn], user_id: row.user_id })), error };
    }),
  ]);
  return [...tickets, ...unrecorded];
}

let warnedMissingSpendLink = false;

/** Once Expo has accepted a batch, retry its database write independently of sending. */
export async function recordDeliveryLedger(db: SupabaseClient, eventColumn: EventColumn, rows: TicketRow[]): Promise<void> {
  const upsert = async (batch: TicketRow[]) => {
    try {
      const { error } = await db.from('alert_push_deliveries').upsert(batch, { onConflict: 'event_id,device_token_id' });
      return error;
    } catch (error) {
      return { code: '', message: String(error) };
    }
  };
  const error = await upsert(rows);
  if (!error) return;
  let retryRows = rows;
  if (isMissingColumn(error) && error.message.includes('one_shot_rule_id')) {
    if (!warnedMissingSpendLink) {
      warnedMissingSpendLink = true;
      logger.warn('[deliver-push] one_shot_rule_id missing; apply migration 20261120174228');
    }
    retryRows = rows.map(row => {
      const legacy = { ...row };
      delete legacy.one_shot_rule_id;
      return legacy;
    });
  }
  const retryError = await upsert(retryRows);
  if (!retryError) return;
  logger.error('[deliver-push] could not record Expo tickets after retry', new Error(retryError.message));

  // One phone may succeed while another subscriber still needs this crossing.
  // The worker can use these acceptances on its next pass even without receipts.
  const accepted = rows.filter(row => row.status === 'sent').map(row => ({
    [eventColumn]: row.event_id, user_id: row.user_id, one_shot_rule_id: row.one_shot_rule_id, sent_at: row.sent_at,
  }));
  if (accepted.length) {
    const recorded = await checkedWrite('unrecorded recipient write', db.from('alert_push_unrecorded_recipients')
      .upsert(accepted, { onConflict: `${eventColumn},user_id`, ignoreDuplicates: true }));
    if (!recorded) reportPossibleDuplicate(eventColumn, accepted.map(row => row.user_id), rows);
  }
}

/**
 * Greppable tag for the one delivery failure the database cannot show.
 *
 * Search logs and Sentry for it. Constant, and first in the error message, so
 * Sentry groups every occurrence into one issue whatever the counts.
 */
export const POSSIBLE_DUPLICATE_PUSH_TAG = 'ALERT_PUSH_POSSIBLE_DUPLICATE';

/**
 * Expo accepted pushes, and neither the ticket write nor the fallback write
 * landed. Nothing in the database now says those people were reached, so a
 * later pass may send them the same alert again — possible, not certain: the
 * drain write in this same pass usually still stops it, and a resend needs
 * that to fail too. A database check cannot find this afterwards, because
 * both records are missing; this signal goes out through the logger's error
 * reporter (Sentry, or the webhook) instead.
 *
 * Counts and event ids only: no user ids or tokens leave the process here.
 */
function reportPossibleDuplicate(eventColumn: EventColumn, userIds: string[], rows: TicketRow[]): void {
  const eventIds = [...new Set(rows.filter(row => row.status === 'sent').map(row => row.event_id))];
  logger.error(
    `[deliver-push] ${POSSIBLE_DUPLICATE_PUSH_TAG}: accepted pushes are unrecorded and may be sent again`,
    new Error(`${POSSIBLE_DUPLICATE_PUSH_TAG}: Expo accepted pushes that neither the ledger nor the fallback record holds; a later pass may resend them`),
    {
      tag: POSSIBLE_DUPLICATE_PUSH_TAG,
      eventSource: EVENT_SOURCE[eventColumn],
      recipients: new Set(userIds).size,
      events: eventIds.length,
      // Enough to find them in the outbox, bounded so one bad pass stays one line.
      eventIds: eventIds.slice(0, 20).join(','),
    },
  );
}

let warnedMissingOutcome = false;

/**
 * Record WHY each drained event drained, in push_outcome.
 *
 * A separate, best-effort write after push_delivered_at, never folded into it.
 * The column arrives in its own migration, and the drain must keep working on
 * a database that does not have it yet: if the outcome rode in the same update
 * as push_delivered_at, a missing column would fail the drain itself and every
 * event would be retried until it expired.
 */
export async function recordOutcomes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: 'river_condition_events' | 'gauge_alert_events' | 'dam_generation_alert_events',
  outcomes: Map<string, DrainOutcome>,
): Promise<void> {
  const byOutcome = new Map<DrainOutcome, string[]>();
  for (const [id, outcome] of outcomes) {
    const bucket = byOutcome.get(outcome);
    if (bucket) bucket.push(id);
    else byOutcome.set(outcome, [id]);
  }
  for (const [outcome, ids] of byOutcome) {
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      let error: { code?: string; message?: string } | null = null;
      try {
        ({ error } = await supabase
          .from(table)
          .update({ push_outcome: outcome })
          .in('id', ids.slice(i, i + IN_CHUNK)));
      } catch (thrown) {
        error = { message: thrown instanceof Error ? thrown.message : String(thrown) };
      }
      if (!error) continue;
      if (isMissingColumn(error)) {
        if (!warnedMissingOutcome) {
          warnedMissingOutcome = true;
          logger.warn('[deliver-push] push_outcome column missing; apply the push_outcome migration', { table });
        }
        return;
      }
      logger.error('[deliver-push] could not record push outcomes', new Error(error.message ?? 'unknown error'), { table, outcome });
    }
  }
}
