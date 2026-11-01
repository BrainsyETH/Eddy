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

/** Rows per page. Must not exceed the project's PostgREST max-rows setting. */
export const READ_PAGE = 1000;
/** Ids per `in` filter, bounded by the request line's length. */
export const IN_CHUNK = 150;

/** A read the pass cannot safely continue without. */
export class DeliveryReadError extends Error {
  constructor(what: string, cause: string) {
    super(`could not read ${what}: ${cause}`);
    this.name = 'DeliveryReadError';
  }
}

interface PageResult {
  data: unknown[] | null;
  error: { message?: string } | null;
}

/**
 * Every row of a query, page by page. `page(from, to)` must apply a stable
 * `.order()` — without one, consecutive `.range()` windows over an unordered
 * result repeat some rows and skip others.
 */
export async function readAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<PageResult>,
  pageSize = READ_PAGE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new DeliveryReadError(what, error.message ?? 'unknown error');
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** readAll for a query filtered by `in` on a list that may be long. */
export async function readAllIn<T>(
  what: string,
  ids: readonly string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<PageResult>,
  { chunkSize = IN_CHUNK, pageSize = READ_PAGE } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    out.push(...(await readAll<T>(what, (from, to) => page(chunk, from, to), pageSize)));
  }
  return out;
}

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
  table: 'river_condition_events' | 'gauge_alert_events',
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
