// src/lib/alerts/gauge-last-announced.ts
// What each cooling-down gauge rule last SAID, for the evaluation pass.
//
// The per-rule cooldown may hold back a repeat and must not hold back a warning
// worse than the one before it — see worsensWhatWasTold in event-kind.ts. To
// tell those apart the evaluator needs the condition the rule last announced,
// and the rule row does not have it: `last_condition_code` follows the water on
// every pass, announced or not. The outbox does. Each event a rule fires
// carries the condition it fired on, so the newest one is what the user heard.
//
// Read from the outbox rather than stored on the rule because a second column
// that must agree with the first is a migration and a deploy order, and the
// answer is already written down.

import { GAUGE_ALERT_COOLDOWN_MS, type GaugeAlertSubscription } from './gauge-threshold';
import { logger } from '@/lib/logger';

/** Subscription ids per `in` filter, bounded by the request line's length. */
const CHUNK = 200;

/**
 * Subscription id → the condition on its newest outbox event.
 *
 * Only condition rules still inside their cooldown are looked up: nothing else
 * can be held back by it, so on an ordinary pass this issues no query at all.
 *
 * ── A failed read is logged, not thrown ─────────────────────────────────────
 *
 * A rule missing from the map is evaluated as though it last said "high", so
 * the worst a failure here can do is repeat a flood warning. Throwing would
 * stop the whole pass — every rule, including the ones this has no bearing on
 * — to protect against a duplicate.
 */
export async function loadLastAnnounced(
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

  for (let from = 0; from < ids.length; from += CHUNK) {
    const { data, error } = await supabase
      .from('gauge_alert_events')
      .select('subscription_id, condition_code, detected_at')
      .in('subscription_id', ids.slice(from, from + CHUNK))
      .gte('detected_at', new Date(since).toISOString())
      // Newest first, so if a page is ever cut short it is the old events that
      // go missing rather than the one this is looking for.
      .order('detected_at', { ascending: false });

    if (error) {
      logger.error('[evaluate-gauge-alerts] could not read what rules last announced', error);
      return out;
    }
    for (const row of data ?? []) {
      const id = row.subscription_id as string;
      if (!out.has(id)) out.set(id, (row.condition_code as string | null) ?? null);
    }
  }
  return out;
}
