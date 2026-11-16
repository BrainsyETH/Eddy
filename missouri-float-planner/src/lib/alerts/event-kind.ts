// src/lib/alerts/event-kind.ts
// Classifies a condition transition for the ALERT OUTBOX (river_condition_events).
//
// This is deliberately SEPARATE from classifyTransition() in
// src/lib/social/condition-alerts.ts, which decides what gets posted to
// Facebook/Instagram/TikTok. The two answer different questions:
//
//   classifyTransition  → "should Eddy post about this publicly?"  (narrow)
//   classifyEventKind   → "what kind of change was this?"          (total)
//
// The outbox records EVERY transition, including ones social deliberately
// ignores — most importantly `low|too_low → good|flowing`, the "your river is
// floatable again" moment the whole iOS conversion funnel is named for, which
// the social classifier drops on purpose.
//
// Keeping these apart is what stops the outbox from resurrecting the
// "all-clear" posts that were deliberately removed from social. This module is
// used for exactly one thing: the `kind` argument to record_condition_transition.
// Do not wire it into the publish path.

import type { ConditionCode } from '@/types/api';

/** Must stay in sync with the river_condition_events.kind CHECK (migration 00182). */
export const EVENT_KINDS = ['floatable', 'warning', 'easing', 'recovery', 'info'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

const ELEVATED: ReadonlySet<string> = new Set(['high', 'dangerous']);
const FLOATABLE: ReadonlySet<string> = new Set(['good', 'flowing']);
const BELOW_FLOATABLE: ReadonlySet<string> = new Set(['low', 'too_low']);

/**
 * Total function over the condition vocabulary — every pair yields a kind, so
 * nothing is silently dropped from the outbox.
 */
export function classifyEventKind(
  oldCode: ConditionCode | string,
  newCode: ConditionCode | string
): EventKind {
  // First-ever reading, or a gauge coming back from an outage. Recorded for the
  // feed but never pushed: "unknown → good" is not news, it's initialization.
  if (oldCode === 'unknown' || newCode === 'unknown') return 'info';

  if (oldCode === newCode) return 'info';

  const wasElevated = ELEVATED.has(oldCode);
  const isElevated = ELEVATED.has(newCode);

  // Escalation into (or deeper into) elevated water.
  if (isElevated && !(wasElevated && newCode === 'high')) return 'warning';

  // dangerous → high: still elevated, but improving.
  if (wasElevated && isElevated) return 'easing';

  // Dropping out of elevated water entirely. Recorded, never pushed — this is
  // the all-clear that social deliberately stopped sending.
  if (wasElevated && !isElevated) return 'recovery';

  // The funnel moment: too low to float → floatable.
  if (BELOW_FLOATABLE.has(oldCode) && FLOATABLE.has(newCode)) return 'floatable';

  // Everything else: good↔flowing, low↔too_low, good→low, etc.
  return 'info';
}

/**
 * How far into elevated water a condition is: 0 below it, 1 high, 2 dangerous.
 *
 * Not `severity` from shared/condition-system.ts, which orders all six codes
 * for display. This ranks only the two a `warning` can land on, for the one
 * question the cooldowns ask: is this worse than what the user last heard?
 */
export function elevatedRank(code: ConditionCode | string | null | undefined): number {
  if (code === 'dangerous') return 2;
  if (code === 'high') return 1;
  return 0;
}

/**
 * Is this event news that the water got WORSE than the user was last told?
 *
 * ── The rule every alert cooldown has to respect ────────────────────────────
 *
 * A cooldown exists to stop repeats: a gauge hovering at a band edge must not
 * buzz a phone every pass. It was also stopping something that is not a repeat.
 * `low → high` and `high → dangerous` are both `warning`, so a river that came
 * up to high at 1pm and reached flood at 3pm sent "high water" and then nothing
 * — the second, worse warning was read as a duplicate of the first. That is how
 * Ozark rivers actually rise, and it left the user's last word from Eddy less
 * severe than the river.
 *
 * So: a cooldown may withhold a warning only when the user has already heard
 * something at least as bad. Both passes ask this before honouring theirs.
 *
 * It bounds oscillation on its own. At a flapping high/dangerous edge the user
 * hears "dangerous" once; after that their last word IS dangerous, nothing
 * outranks it, and the cooldown holds as before.
 *
 * `lastToldRank` is what the user last heard, as elevatedRank. Callers that
 * cannot tell which of high or dangerous an earlier warning was pass 1: an
 * unknown must not withhold a flood warning, and at worst it repeats one.
 */
export function worsensWhatWasTold(
  kind: EventKind | string,
  newCode: ConditionCode | string,
  lastToldRank: number,
): boolean {
  return kind === 'warning' && elevatedRank(newCode) > lastToldRank;
}

/**
 * Kinds that may generate a push. `recovery`/`info` are feed-only.
 *
 * This is now the ONLY thing standing between an event and a notification.
 * There was a companion `kindRequiresEntitlement()` here, gating everything but
 * `warning` behind Eddy Premium; it is gone because alerting is free in its
 * entirety. Splitting the alert engine along a paid boundary is what produced
 * the state where a `warning` was nominally free yet unreachable, since the only
 * route that could create the subscription to receive one demanded payment.
 */
export function isPushableKind(kind: EventKind): boolean {
  return kind === 'floatable' || kind === 'warning' || kind === 'easing';
}
