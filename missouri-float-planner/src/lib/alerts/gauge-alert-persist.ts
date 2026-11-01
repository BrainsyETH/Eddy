// src/lib/alerts/gauge-alert-persist.ts
// Write one evaluation pass: the outbox rows first, then the rules' state.
//
// ── The order is the whole correctness argument ──────────────────────────────
//
// Gauge rules are edge-triggered: a rule fires when its reading crosses INTO
// its band, and `last_state` is what remembers which side it was on. Advancing
// a fired rule's state is therefore the act of consuming the crossing, and it
// may only happen once the event that carries the crossing to the user exists.
//
// The route used to log a failed outbox insert and then write every state
// update anyway, comment and all claiming the opposite. One failed insert spent
// the crossing with nothing in the outbox, so the alert — possibly a flood
// stage — never went out, and the rule could not fire again until the water
// left the band and came back.
//
// What makes the two-step write safe without a transaction:
//
//   * insert fails      → no fired rule advances. Next pass re-reads the same
//                         reading as new and fires again.
//   * insert succeeds,
//     state write fails → next pass re-fires the same (subscription, reading)
//                         and the upsert's ignoreDuplicates against the unique
//                         index turns that into a no-op, then writes state.
//
// The one window left is a state write that fails AND a newer reading arriving
// still inside the band before the next pass; that re-fires on the newer
// reading. Closing it needs both writes in one database transaction (an RPC),
// which is a migration — tracked separately rather than smuggled in here.

import type { FiredAlert, StateUpdate } from './gauge-threshold';
import { logger } from '@/lib/logger';

/** State writes run in small parallel batches rather than one at a time. */
const WRITE_CONCURRENCY = 10;

export interface PersistResult {
  /** Outbox rows actually inserted (duplicates of an earlier pass are not). */
  inserted: number;
  /** Whether the outbox write failed. When it did, `heldBack` rules kept their state. */
  outboxFailed: boolean;
  /** Fired rules whose state was deliberately NOT advanced. */
  heldBack: number;
  /** State updates written successfully. */
  stateWritten: number;
  /** State updates that failed. Safe to retry; see the header. */
  stateFailed: number;
}

export async function persistGaugeAlertPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  plan: { fired: FiredAlert[]; stateUpdates: StateUpdate[] },
): Promise<PersistResult> {
  let inserted = 0;
  let outboxFailed = false;

  if (plan.fired.length > 0) {
    let error: { message?: string } | null = null;
    let data: unknown[] | null = null;
    try {
      // ignoreDuplicates against the (subscription_id, reading_at) unique index:
      // a pass that dies after inserting but before writing state re-fires the
      // same rule on the same reading next time, and this is what makes that
      // retry harmless rather than a second notification.
      ({ data, error } = await supabase
        .from('gauge_alert_events')
        .upsert(plan.fired, { onConflict: 'subscription_id,reading_at', ignoreDuplicates: true })
        .select('id'));
    } catch (thrown) {
      error = { message: thrown instanceof Error ? thrown.message : String(thrown) };
    }
    if (error) {
      outboxFailed = true;
      logger.error(
        '[evaluate-gauge-alerts] could not write outbox; fired rules keep their state',
        new Error(error.message ?? 'unknown error'),
        { fired: plan.fired.length },
      );
    } else {
      inserted = data?.length ?? 0;
    }
  }

  // Rules that did not fire may always advance: seeding, no crossing, cooldown
  // and the rest consume nothing. Fired ones advance only behind a written event.
  const firedIds = new Set(plan.fired.map((f) => f.subscription_id));
  const updates = outboxFailed
    ? plan.stateUpdates.filter((u) => !firedIds.has(u.id))
    : plan.stateUpdates;
  const heldBack = plan.stateUpdates.length - updates.length;

  let stateWritten = 0;
  let stateFailed = 0;
  for (let i = 0; i < updates.length; i += WRITE_CONCURRENCY) {
    const batch = updates.slice(i, i + WRITE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(({ id, ...fields }) =>
        Promise.resolve(
          supabase.from('gauge_alert_subscriptions').update(fields).eq('id', id),
        ).then(
          (r: { error: unknown }) => r.error,
          (thrown: unknown) => thrown ?? new Error('state write threw'),
        ),
      ),
    );
    for (const error of results) {
      if (error) stateFailed++;
      else stateWritten++;
    }
  }
  if (stateFailed > 0) {
    logger.error(
      '[evaluate-gauge-alerts] some rule state writes failed',
      new Error(`${stateFailed} of ${updates.length} state update(s) failed`),
    );
  }

  return { inserted, outboxFailed, heldBack, stateWritten, stateFailed };
}
