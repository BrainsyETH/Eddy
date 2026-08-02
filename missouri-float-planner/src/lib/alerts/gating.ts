// src/lib/alerts/gating.ts
// Is this gauge rule allowed to fire right now?
//
// Two things can stop it, and they are different in kind:
//
//   enabled = false            the user paused THIS rule
//   parent subscription off    the user paused the river alert it belongs to
//
// The second exists because a gauge alert created from a river alert's edit
// screen is part of that alert. Nesting it in the list promises the outer switch
// governs it, and the only way to keep that promise without writing to the
// children — which destroys whatever states they were in — is for the parent's
// flag to gate them at evaluation time. See migration
// 20260802143000_gauge_alert_parent_subscription.sql.
//
// ── Why this is a module and not an inline `&&` ─────────────────────────────
//
// Two independent passes have to agree about it. evaluate-gauge-alerts decides
// whether a rule may produce an OUTBOX ROW; deliver-push decides whether an
// outbox row may become a NOTIFICATION, minutes later, by which time the answer
// can have changed. If those two ever disagree, the disagreement is invisible
// — a paused alert that buzzes, or a live one that does not — and there is no
// log line to find it by. One predicate, imported by both.
//
// I/O-free on purpose, like fanout.ts and gate.ts beside it: the caller does the
// querying, this owns the policy, so every case can be tested without a
// database.

export interface GatedRule {
  /** The rule's own pause flag. */
  enabled: boolean;
  /** The river alert it belongs to, or null when it stands on its own. */
  parent_subscription_id?: string | null;
}

/**
 * The parent subscriptions that are currently PAUSED.
 *
 * Deliberately the paused set rather than the live one, so that a parent the
 * caller failed to look up — deleted mid-pass, or a query that returned short —
 * is absent and therefore treated as not-paused. Failing OPEN is right here and
 * only here: the alternative is silently withholding somebody's flood warning
 * because a second query hiccupped, and every rule in this set has already been
 * asked for explicitly by the person who would not receive it.
 *
 * The cascade makes the deleted-parent case moot in practice — the children go
 * with it — but a predicate should not depend on a foreign key to be safe.
 */
export type PausedParents = ReadonlySet<string>;

export function isRuleLive(rule: GatedRule, pausedParents: PausedParents): boolean {
  if (!rule.enabled) return false;
  const parent = rule.parent_subscription_id;
  if (!parent) return true;
  return !pausedParents.has(parent);
}

/**
 * The distinct parent ids worth looking up, for the caller's own query.
 *
 * Returns [] when nothing is parented, which lets the caller skip the round
 * trip entirely — the common case, since most rules stand alone.
 */
export function parentIdsOf(rules: readonly GatedRule[]): string[] {
  const out = new Set<string>();
  for (const rule of rules) {
    if (rule.parent_subscription_id) out.add(rule.parent_subscription_id);
  }
  return [...out];
}
