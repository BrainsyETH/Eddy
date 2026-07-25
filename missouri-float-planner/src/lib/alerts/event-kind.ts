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

/** Kinds that may generate a push. `recovery`/`info` are feed-only. */
export function isPushableKind(kind: EventKind): boolean {
  return kind === 'floatable' || kind === 'warning' || kind === 'easing';
}

/**
 * Whether a push of this kind requires an active Eddy+ entitlement.
 *
 * Safety-adjacent warnings are FREE: the product principle is that condition
 * display is always free including "dangerous", and putting a hazard warning
 * behind a paywall is both a liability and a trust problem. The paid moat is
 * the floatability translation — "your stretch is floatable" — not the hazard.
 */
export function kindRequiresEntitlement(kind: EventKind): boolean {
  return kind !== 'warning';
}
