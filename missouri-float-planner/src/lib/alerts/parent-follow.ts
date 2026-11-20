// src/lib/alerts/parent-follow.ts
// When a river alert's setting changes, which of its gauge alerts change too?
//
// A gauge alert created from a river alert's edit screen copies that alert's
// setting: it is the same alert on another station, and the app draws it on the
// river's row as coverage ("Main gauge + Sullivan") rather than as a second
// alert. See docs/decisions/0006-gauge-alerts-belong-to-a-river-alert.md.
//
// That is only true while the two agree. Changing the river alert from
// "floatable" to "high water" used to change one row and leave every covered
// gauge on the old setting, so each one dropped out of the river's row as an
// exception — still firing on a trigger the user had just replaced.
//
// So a change to the river alert's setting is applied to the children that were
// FOLLOWING it. Not to every child: one that was given its own trigger on
// purpose keeps it. "Following" is decided against the river alert's setting
// BEFORE the change, which is the only moment the question has an answer.
//
// ── Why this is not the cascade ADR 0006 rejected ──────────────────────────
//
// Option B there wrote `enabled` to children when the parent was paused, which
// destroyed states the user had set and then had to be remembered. Pausing is
// still a gate and writes nothing. This writes the TRIGGER, on the server, in
// the request where the user changed the trigger, and only to rows that held
// the old one because they inherited it.
//
// I/O-free, like gating.ts beside it: the route does the querying and the
// writes, this owns the policy, so every case can be tested without a database.

import type { AlertSubscriptionKind } from '@/types/api';

/** The river alert's setting as stored before the change. */
export interface ParentSetting {
  kind: AlertSubscriptionKind;
  one_shot: boolean;
}

/** What the request asked to change. Absent fields are left alone. */
export interface ParentChange {
  kind?: AlertSubscriptionKind;
  oneShot?: boolean;
  /** Clear a spent one-shot so it can fire again. */
  rearm?: boolean;
}

/** The columns of a child gauge rule this decision reads. */
export interface FollowerCandidate {
  id: string;
  mode: 'condition' | 'threshold';
  condition_kind: AlertSubscriptionKind | null;
  one_shot: boolean;
  one_shot_fired_at: string | null;
}

export interface FollowerUpdate {
  id: string;
  update: {
    condition_kind?: AlertSubscriptionKind;
    one_shot?: boolean;
    one_shot_fired_at?: null;
    last_triggered_at?: null;
    enabled?: true;
  };
}

/**
 * Was this child on the river alert's own setting?
 *
 * Its pause flag is deliberately not part of the answer. A gauge paused by hand
 * is still the river alert's gauge; pausing it said "not now", not "on a
 * different trigger", and leaving it behind would hand it back later on a
 * setting the river alert no longer has.
 */
export function wasFollowing(child: FollowerCandidate, parent: ParentSetting): boolean {
  return (
    child.mode === 'condition' &&
    (child.condition_kind ?? 'all') === parent.kind &&
    child.one_shot === parent.one_shot
  );
}

/**
 * The writes that carry a river alert's change to the gauges following it.
 *
 * Empty when nothing about the setting changed — a pause or resume alone writes
 * to no child, which is the gate ADR 0006 chose.
 */
export function planFollowerUpdates(
  parent: ParentSetting,
  change: ParentChange,
  children: FollowerCandidate[],
): FollowerUpdate[] {
  const nextKind = change.kind !== undefined && change.kind !== parent.kind ? change.kind : null;
  const nextOneShot =
    change.oneShot !== undefined && change.oneShot !== parent.one_shot ? change.oneShot : null;
  if (nextKind === null && nextOneShot === null && !change.rearm) return [];

  const updates: FollowerUpdate[] = [];
  for (const child of children) {
    if (!wasFollowing(child, parent)) continue;

    const update: FollowerUpdate['update'] = {};
    if (nextKind !== null) update.condition_kind = nextKind;
    if (nextOneShot !== null) update.one_shot = nextOneShot;

    // A spent gauge is switched off by delivery (see gauge-delivery.ts). It
    // comes back when the river alert is re-armed — the user asking for the
    // alert again — and when the alert stops being one-time, because a rule
    // that is no longer a one-shot and still paused by its spend could never
    // fire and nothing on any screen would say why.
    //
    // Both columns, for the reason the gauge route's own rearm gives: one
    // spends the rule and the other holds its cooldown.
    const spent = child.one_shot && child.one_shot_fired_at != null;
    if (spent && (change.rearm || nextOneShot === false)) {
      update.one_shot_fired_at = null;
      update.last_triggered_at = null;
      update.enabled = true;
    }

    if (Object.keys(update).length > 0) updates.push({ id: child.id, update });
  }
  return updates;
}
