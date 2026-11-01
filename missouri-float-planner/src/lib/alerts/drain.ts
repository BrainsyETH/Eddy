// src/lib/alerts/drain.ts
// Decides which outbox events are FINISHED and which get another pass, and
// which one-shot subscriptions were actually spent doing it.
//
// Same arrangement as fanout.ts and for the same reason: the delivery cron does
// the querying and sending, this module owns the policy, so the rules can be
// tested exhaustively without a database or a network. The decision is small but
// it is the one that determines whether a missed alert is recoverable, and it
// was previously not a decision at all — every event in a pass was stamped
// delivered whether or not a single push had left the building.

/** Matches river_condition_events.push_attempts before this pass ran. */
export interface DrainEvent {
  id: string;
  attempts: number;
}

/**
 * What finally happened to an event, recorded as push_outcome when it drains.
 *
 * `push_delivered_at` alone could not say: it was stamped for a send, an
 * expiry, an event nobody subscribed to, and an abandoned retry alike, so the
 * dashboard could count "drained" and nothing else.
 */
export type DrainOutcome = 'sent' | 'skipped' | 'expired' | 'given_up';

export interface DrainInput {
  events: DrainEvent[];
  /**
   * Recipients (user ids) this pass planned at least one message for, per event.
   * Absent or empty means nothing to send.
   */
  plannedRecipients: Map<string, Set<string>>;
  /** Recipients with at least one successful send in this pass, per event. */
  reachedRecipients: Map<string, Set<string>>;
  /**
   * Recipients an EARLIER pass already reached, per event. Only labels the
   * outcome: those recipients are excluded upstream, so they never appear in
   * `plannedRecipients` again.
   */
  previouslyReached?: Map<string, number>;
  /** Attempts at which we stop retrying. Mirrors the outbox query's filter. */
  maxAttempts: number;
}

export interface DrainPlan {
  /** Stamp push_delivered_at on these. */
  delivered: string[];
  /** Why each drained event drained. Every id in `delivered` has an entry. */
  outcomes: Map<string, DrainOutcome>;
  /**
   * Event ids grouped by the push_attempts value to write, so the caller issues
   * at most `maxAttempts` statements regardless of how many events are in
   * flight — PostgREST has no `column = column + 1`.
   */
  retryByNextAttempt: Map<number, string[]>;
  /** Events drained with at least one planned recipient never reached. Worth an error log. */
  givenUp: number;
  /** Recipients left unreached by the given-up events, for that log line. */
  givenUpRecipients: number;
}

/**
 * An event is done when EVERY recipient it was planned for has been reached,
 * OR when it had nothing to send in the first place.
 *
 * ── Completion is per recipient, not per event ──────────────────────────────
 *
 * This used to read "done once ANY send succeeded". That is the right rule for
 * one person — reaching one of their phones has reached them — and it was
 * applied to the event. A river event fans out to every subscriber of the
 * river, so one success and 99 failures drained the event and the 99 were
 * never retried. Recipient here means a user: devices are still pooled per
 * person, which keeps the two-phones rule intact. Gauge events carry exactly
 * one recipient, so for them the two rules coincide.
 *
 * A retry pass must therefore exclude the recipients already reached (the
 * caller does that from the delivery ledger) so the remaining ones are the
 * only ones planned, and nobody is pushed twice.
 *
 * ── Nothing to send ──────────────────────────────────────────────────────────
 *
 * Not a failure, and it must keep draining: no subscriber, every candidate on
 * cooldown, a spent one-shot, everyone already reached. Retrying those would
 * refill the outbox every five minutes with events nobody ever wanted.
 *
 * Retries are bounded because the outbox query itself filters on
 * `push_attempts < MAX_ATTEMPTS`. An event left undelivered at the limit would
 * never be selected again — stranded behind the partial index rather than
 * retried — so giving up has to mean draining it, loudly.
 */
export function planDrain(input: DrainInput): DrainPlan {
  const delivered: string[] = [];
  const outcomes = new Map<string, DrainOutcome>();
  const retryByNextAttempt = new Map<number, string[]>();
  let givenUp = 0;
  let givenUpRecipients = 0;

  for (const event of input.events) {
    const planned = input.plannedRecipients.get(event.id) ?? new Set<string>();
    const reached = input.reachedRecipients.get(event.id) ?? new Set<string>();
    const earlier = input.previouslyReached?.get(event.id) ?? 0;

    let unreached = 0;
    for (const recipient of planned) if (!reached.has(recipient)) unreached++;

    if (unreached === 0) {
      delivered.push(event.id);
      // Nothing planned on a retry whose recipients were all reached earlier is
      // still a sent event; nothing planned and nobody ever reached is a skip.
      outcomes.set(event.id, planned.size > 0 || earlier > 0 ? 'sent' : 'skipped');
      continue;
    }

    const next = event.attempts + 1;
    if (next >= input.maxAttempts) {
      delivered.push(event.id);
      outcomes.set(event.id, 'given_up');
      givenUp++;
      givenUpRecipients += unreached;
      continue;
    }

    const bucket = retryByNextAttempt.get(next);
    if (bucket) bucket.push(event.id);
    else retryByNextAttempt.set(next, [event.id]);
  }

  return { delivered, outcomes, retryByNextAttempt, givenUp, givenUpRecipients };
}

/**
 * Which one-shot subscriptions to stamp `fired_at` on.
 *
 * `candidates` is fanout's `oneShotSubscriptionIds` — the one-shots this pass
 * planned messages FOR, which is not the same as spent. The cron used to treat
 * the two as identical and stamped every candidate regardless of outcome, and
 * that is a worse bug than the event-level one planDrain was written to fix,
 * because it compounds rather than merely losing a push:
 *
 *   1. Every send fails, but fired_at is stamped anyway.
 *   2. planDrain does its job and schedules the event for another pass.
 *   3. On that pass, fanout skips the subscription as `one_shot_spent`, so the
 *      event has nothing planned — and "nothing planned" is exactly the state
 *      planDrain reads as finished, above.
 *
 * The retry cancels itself, the event drains without ever reaching a device,
 * and it does not even land in `givenUp`. A user's single notification about a
 * river is consumed by a transient Expo error nobody can see.
 *
 * One success is enough, matching the partial-delivery rule above: a
 * subscription fans out to every device its owner has registered, and reaching
 * one of them has reached the person.
 *
 * There is no attempts budget here and deliberately no equivalent of `givenUp`.
 * `alert_subscriptions` carries no attempts column, and an undelivered one-shot
 * simply stays armed — bounded by the event's own MAX_ATTEMPTS, since once the
 * event drains there is nothing left to match it. Staying armed is the safe
 * direction: the cost is at worst one duplicate push, against a user who
 * otherwise never hears about their river at all.
 */
export function spentOneShots(
  candidates: readonly string[],
  successBySubscription: Map<string, number>
): string[] {
  return candidates.filter((id) => (successBySubscription.get(id) ?? 0) > 0);
}
