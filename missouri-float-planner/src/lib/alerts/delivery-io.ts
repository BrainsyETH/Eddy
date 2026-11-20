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
import { IN_CHUNK } from '@/lib/supabase/paged-read';

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

let warnedMissingSpendLink = false;

/**
 * Record a batch of push tickets in alert_push_deliveries. Never throws.
 *
 * The batch has already been SENT when this runs, so a failure here must not
 * abort the pass. Aborting skips the drain and the one-shot spend, and the
 * next pass sends the same events again, every five minutes until they
 * expire. Carrying on drains them from this pass's own tally, so the cost of a
 * lost ledger write is receipt tracking and cooldown history for one batch,
 * not a repeated notification.
 *
 * `one_shot_rule_id` arrives in migration 20261120150000. On a database
 * without it the rows are written without it, so deploying this code before
 * that migration loses one-time recovery (ADR 0005) rather than every ledger
 * row.
 */
export async function recordDeliveryLedger(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  what: string,
  rows: Array<Record<string, unknown>>,
): Promise<boolean> {
  const upsert = (batch: Array<Record<string, unknown>>) =>
    supabase.from('alert_push_deliveries').upsert(batch, { onConflict: 'event_id,device_token_id' });

  let error: { code?: string; message?: string } | null = null;
  try {
    ({ error } = await upsert(rows));
  } catch (thrown) {
    error = { message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
  if (!error) return true;

  if (isMissingColumn(error)) {
    if (!warnedMissingSpendLink) {
      warnedMissingSpendLink = true;
      logger.warn('[deliver-push] alert_push_deliveries.one_shot_rule_id missing; apply migration 20261120150000');
    }
    const withoutLink = rows.map((row) => {
      const copy = { ...row };
      delete copy.one_shot_rule_id;
      return copy;
    });
    return checkedWrite(what, upsert(withoutLink));
  }

  logger.error(`[deliver-push] ${what} failed`, new Error(error.message ?? 'unknown error'));
  return false;
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
