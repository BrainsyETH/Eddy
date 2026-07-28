// src/lib/alerts/drain.ts
// Decides which outbox events are FINISHED and which get another pass.
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

export interface DrainInput {
  events: DrainEvent[];
  /** Messages planned per event id. Absent or 0 means nothing to send. */
  plannedByEvent: Map<string, number>;
  /** Successful sends per event id. */
  successByEvent: Map<string, number>;
  /** Attempts at which we stop retrying. Mirrors the outbox query's filter. */
  maxAttempts: number;
}

export interface DrainPlan {
  /** Stamp push_delivered_at on these. */
  delivered: string[];
  /**
   * Event ids grouped by the push_attempts value to write, so the caller issues
   * at most `maxAttempts` statements regardless of how many events are in
   * flight — PostgREST has no `column = column + 1`.
   */
  retryByNextAttempt: Map<number, string[]>;
  /** Events drained without ever reaching a device. Worth an error log. */
  givenUp: number;
}

/**
 * An event is done when it reached at least one device, OR when it had nothing
 * to send in the first place.
 *
 * That second case is not a failure and must keep draining: no subscriber, every
 * candidate on cooldown, a spent one-shot. Retrying those would refill the
 * outbox every five minutes with events nobody ever wanted.
 *
 * Retries are bounded because the outbox query itself filters on
 * `push_attempts < MAX_ATTEMPTS`. An event left undelivered at the limit would
 * never be selected again — stranded behind the partial index rather than
 * retried — so giving up has to mean draining it, loudly.
 */
export function planDrain(input: DrainInput): DrainPlan {
  const delivered: string[] = [];
  const retryByNextAttempt = new Map<number, string[]>();
  let givenUp = 0;

  for (const event of input.events) {
    const planned = input.plannedByEvent.get(event.id) ?? 0;
    const succeeded = input.successByEvent.get(event.id) ?? 0;

    if (planned === 0 || succeeded > 0) {
      delivered.push(event.id);
      continue;
    }

    const next = event.attempts + 1;
    if (next >= input.maxAttempts) {
      delivered.push(event.id);
      givenUp++;
      continue;
    }

    const bucket = retryByNextAttempt.get(next);
    if (bucket) bucket.push(event.id);
    else retryByNextAttempt.set(next, [event.id]);
  }

  return { delivered, retryByNextAttempt, givenUp };
}
