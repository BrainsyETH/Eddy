// src/lib/alerts/quiet-hours-rearm.ts
// Which rules to put back on the far side of their line, now that the user's
// quiet window has ended.
//
// ── The gap this closes ──────────────────────────────────────────────────────
// A threshold event suppressed by quiet hours used to be drained and forgotten.
// The rule's crossing state had advanced at evaluation, so the user never heard
// about a level the river crossed at 2am — not at 7am, not ever, until the
// water left the band and re-entered it. See the header of quiet-hours.ts.
//
// ── Why re-arm, not hold ─────────────────────────────────────────────────────
// Holding the 2am event and sending it at 7am would send a five-hour-old
// reading, which the three-hour drain rule exists to forbid. Re-arming the rule
// instead lets the ORDINARY evaluation pass re-read the current number and
// write a fresh event if the water is still there. No second state machine, no
// scheduler, nothing stale on the wire; a rule whose water has since left the
// band simply does not fire, which is the right answer.
//
// ── What re-arming means, per mode ──────────────────────────────────────────
// Threshold rules: last_state back to 'outside', last_triggered_at cleared so
// the six-hour cooldown from the suppressed evaluation cannot swallow the
// morning crossing, and last_reading_at cleared so the very next pass
// re-evaluates the reading it already holds rather than waiting for a new one.
//
// Condition rules ("Eddy's call") are NOT re-armed here. Their previous verdict
// is not stored — last_condition_code is overwritten on every look — so there
// is nothing to put back; and the condition kinds people set for the night
// (floatable) are exactly the ones a reading from the night should not vouch
// for. They stay recorded as suppressed and legible in the activity list.
//
// I/O-free like the rest of this directory: the delivery pass does the
// querying and the writes, this owns the decision.

import { isQuietAt } from './quiet-hours';
import type { NotificationPreferences } from '@/types/api';

export interface SuppressedEvent {
  id: string;
  subscriptionId: string;
  userId: string;
  mode: 'condition' | 'threshold';
}

export interface RearmPlan {
  /** Threshold rules to put back on the far side of their line. */
  subscriptionIds: string[];
  /** Every suppressed event whose user's window has ended — stamped rearmed_at. */
  eventIds: string[];
}

/**
 * Decide, for each suppressed event, whether its user's window has ended.
 *
 * A user still inside their window keeps waiting; one whose window has ended
 * (or who has since turned quiet hours off — a null or disabled preferences
 * row is "never quiet") has every suppressed event resolved now. The event is
 * stamped either way so the lookup shrinks; only threshold rules are re-armed.
 */
export function planRearm(
  suppressed: SuppressedEvent[],
  prefsByUser: ReadonlyMap<string, NotificationPreferences>,
  now: Date,
): RearmPlan {
  const subscriptionIds = new Set<string>();
  const eventIds: string[] = [];

  for (const event of suppressed) {
    const prefs = prefsByUser.get(event.userId) ?? null;
    if (isQuietAt(prefs, now)) continue;
    eventIds.push(event.id);
    if (event.mode === 'threshold') subscriptionIds.add(event.subscriptionId);
  }

  return { subscriptionIds: [...subscriptionIds], eventIds };
}

/** The column values that put a threshold rule back on the far side of its line. */
export const REARMED_RULE_STATE = {
  last_state: 'outside',
  last_triggered_at: null,
  last_reading_at: null,
} as const;
