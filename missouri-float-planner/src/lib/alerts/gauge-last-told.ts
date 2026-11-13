// src/lib/alerts/gauge-last-told.ts
// What each cooling-down gauge rule last TOLD its owner, for the evaluation pass.
//
// The per-rule cooldown may hold back a repeat and must not hold back a warning
// worse than the one before it — see worsensWhatWasTold in event-kind.ts. To
// tell those apart the evaluator needs the condition the user last heard, and
// the rule row does not have it: `last_condition_code` follows the water on
// every pass, whether or not anything was said.
//
// ── Fired is not told ───────────────────────────────────────────────────────
//
// The first version of this read the rule's newest outbox event and stopped.
// An event is a notification OWED, not one received: it can exhaust its
// retries, expire in an outage, or be dropped by quiet hours or a pause. Read
// as "told", a flood warning that never reached a phone still held back the
// next one — the water eased, came back up, and the cooldown called it a
// repeat of something the user had never seen.
//
// So an event counts only in one of two states:
//
//   REACHED   the delivery ledger has a `sent` row for it. The same test the
//             delivery pass uses to avoid pushing somebody twice.
//   PENDING   not drained yet and still young enough to be sent. It is on its
//             way; treating it as untold would let the rule fire again behind
//             it and deliver two notifications for one rise.
//
// Anything else was drained without reaching anyone and is skipped, back to
// the newest event that did.
//
// Read from the outbox and ledger rather than stored on the rule because a
// column that must agree with them is a migration and a deploy order, and the
// answer is already written down.

import { GAUGE_ALERT_COOLDOWN_MS, type GaugeAlertSubscription } from './gauge-threshold';
import { MAX_ATTEMPTS, MAX_EVENT_AGE_HOURS } from './gauge-delivery';
import { logger } from '@/lib/logger';

/** Ids per `in` filter, bounded by the request line's length. */
const CHUNK = 200;

interface EventRow {
  id: string;
  subscription_id: string;
  condition_code: string | null;
  detected_at: string;
  push_delivered_at: string | null;
  push_attempts: number | null;
}

/**
 * Subscription id → the condition its owner was last told inside the cooldown.
 *
 * Three answers, and the evaluator treats each differently:
 *
 *   a code     told that (reached, or on its way)
 *   null       looked, and nothing the rule fired in the window got through
 *   no entry   could not look — a failed read
 *
 * `null` lets any warning past the cooldown, because there is nothing for it to
 * be a repeat of. A missing entry is read as "high": it can repeat a flood
 * warning and cannot withhold one.
 *
 * Only condition rules still inside their cooldown are looked up — nothing else
 * can be held back by it — so an ordinary pass issues no query at all.
 *
 * ── A failed read is logged, not thrown ─────────────────────────────────────
 *
 * The worst a failure here can do is repeat a flood warning. Throwing would
 * stop the whole pass — every rule, including the ones this has no bearing on
 * — to protect against a duplicate.
 */
export async function loadLastTold(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  subscriptions: readonly GaugeAlertSubscription[],
  now: Date = new Date(),
  cooldownMs: number = GAUGE_ALERT_COOLDOWN_MS,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const since = now.getTime() - cooldownMs;
  const ids = subscriptions
    .filter(
      (sub) =>
        sub.mode === 'condition' &&
        sub.last_triggered_at != null &&
        new Date(sub.last_triggered_at).getTime() > since,
    )
    .map((sub) => sub.id);

  // An undrained event older than this will be expired, not sent, by the next
  // delivery pass. It is not on its way to anybody.
  const sendableSince = now.getTime() - MAX_EVENT_AGE_HOURS * 60 * 60 * 1000;

  for (let from = 0; from < ids.length; from += CHUNK) {
    const chunk = ids.slice(from, from + CHUNK);
    const { data: events, error } = await supabase
      .from('gauge_alert_events')
      .select('id, subscription_id, condition_code, detected_at, push_delivered_at, push_attempts')
      .in('subscription_id', chunk)
      .gte('detected_at', new Date(since).toISOString())
      // Newest first, so if a page is ever cut short it is the old events that
      // go missing rather than the ones this is looking for.
      .order('detected_at', { ascending: false });
    if (error) {
      logger.error('[evaluate-gauge-alerts] could not read what rules last fired', error);
      return out;
    }
    const rows = (events ?? []) as EventRow[];

    // Every event, drained or not: one that was sent but never stamped drained
    // is reached all the same, and the ledger is what knows.
    const reached = new Set<string>();
    const eventIds = rows.map((row) => row.id);
    for (let i = 0; i < eventIds.length; i += CHUNK) {
      const { data: ledger, error: ledgerError } = await supabase
        .from('alert_push_deliveries')
        .select('event_id')
        .in('event_id', eventIds.slice(i, i + CHUNK))
        .eq('status', 'sent');
      if (ledgerError) {
        logger.error('[evaluate-gauge-alerts] could not read which alerts were delivered', ledgerError);
        return out;
      }
      for (const row of ledger ?? []) reached.add(row.event_id as string);
    }

    const told = new Map<string, string | null>();
    for (const row of rows) {
      if (told.has(row.subscription_id)) continue;
      const pending =
        row.push_delivered_at == null &&
        (row.push_attempts ?? 0) < MAX_ATTEMPTS &&
        new Date(row.detected_at).getTime() >= sendableSince;
      if (pending || reached.has(row.id)) told.set(row.subscription_id, row.condition_code ?? null);
    }
    // Every rule in the chunk gets an answer once both reads succeeded: a rule
    // absent from `told` fired nothing that got through, which is `null` and
    // not the same as not knowing.
    for (const id of chunk) out.set(id, told.get(id) ?? null);
  }
  return out;
}
