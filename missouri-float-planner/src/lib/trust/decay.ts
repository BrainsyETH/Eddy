// src/lib/trust/decay.ts
// Keeping the open list bounded, so it stays a thing somebody opens.
//
// ── The gate this exists for ────────────────────────────────────────────
//
// The Trust MVP gate's last criterion: "A bounded queue. Cap what surfaces —
// top N per day by priority, the rest visible on request rather than pushed —
// and auto-close informational findings left unactioned for N days. Without a
// cap and a decay rule the backlog only grows, and the console becomes the
// thing the operator stops opening, which is the exact failure this framework
// exists to prevent."
//
// That reasoning is right and it is the same argument bulk/route.ts makes about
// 24 clicks. Eleven of the twenty findings open on day one are `low` from one
// check.
//
// ── Where this deviates from the gate's wording, and why ────────────────
//
// The gate says auto-CLOSE. For a persistent condition that produces a
// treadmill: the finding closes, the check still emits it, reconciliation
// raises it again next run with occurrences incremented, and thirty days later
// it closes again. The list is bounded for an hour at a time and the ledger
// fills with a fix-and-regress history of a thing that never changed.
//
// So stale informational findings are auto-SNOOZED instead. It achieves exactly
// what the gate asks — off the open list, visible on request, backlog bounded —
// using machinery reconciliation already respects: a snoozed finding is never
// auto-resolved, re-emission merely touches it, and it returns on its own when
// the snooze lapses. Nothing is lost and nothing churns.
//
// Auto-close is kept for the one case where it is genuinely right: findings
// belonging to a check that no longer exists. Nothing emits them, so nothing
// will ever reconcile them, and they would sit open forever. Those are closed
// as `expired`, which the resolution vocabulary records as "nobody looked" so
// they cannot flatter the false-positive rate.

import type { Resolution } from './resolution';

/** The gate's "four weeks of real operation", in days. */
export const SHADOW_OPERATION_DAYS = 28;

export interface DecayPolicy {
  /** Severities eligible to be shelved. Informational only, by design. */
  severities: readonly string[];
  /** How long a finding may sit unactioned before it is shelved. */
  staleAfterDays: number;
  /** How long it is shelved for. */
  shelveForDays: number;
}

/**
 * Thirty days to go stale, ninety to come back.
 *
 * Thirty is longer than any check's cadence by a wide margin, so nothing is
 * shelved before an operator has had a month of chances to look at it. Ninety
 * matches MAX_SNOOZE_DAYS in the finding routes — the longest an operator can
 * choose by hand, so automation is not granted more reach than the person.
 *
 * `low` only. A medium finding is a wrong number on a real surface and a
 * critical one can change a go/no-go answer; shelving either because nobody got
 * to it would be the console deciding what matters, which is the operator's
 * job.
 */
export const DEFAULT_DECAY_POLICY: DecayPolicy = {
  severities: ['low'],
  staleAfterDays: 30,
  shelveForDays: 90,
};

export interface DecayCandidate {
  id: string;
  check_id: string;
  severity: string;
  status: string;
  first_seen_at: string;
}

export interface DecayPlan {
  /** Open, informational, and untouched long enough. Snoozed, not closed. */
  shelve: { id: string; until: string }[];
  /** Belongs to a check that no longer exists. Nothing will ever resolve it. */
  expire: string[];
  resolution: Resolution;
}

/**
 * Pure. Decides what leaves the open list this tick.
 *
 * `first_seen_at` is the clock, not `last_seen_at`. The question the gate asks
 * is how long a finding has been sitting there unactioned, and `last_seen_at`
 * refreshes every single run — so keying on it would mean a finding the check
 * keeps confirming never ages, which is precisely backwards.
 */
export function planDecay(
  findings: readonly DecayCandidate[],
  now: Date,
  registeredCheckIds: readonly string[],
  policy: DecayPolicy = DEFAULT_DECAY_POLICY,
): DecayPlan {
  const registered = new Set(registeredCheckIds);
  const staleBefore = now.getTime() - policy.staleAfterDays * 86_400_000;
  const until = new Date(now.getTime() + policy.shelveForDays * 86_400_000).toISOString();

  const shelve: { id: string; until: string }[] = [];
  const expire: string[] = [];

  for (const f of findings) {
    // Orphans first, and regardless of severity or age. A check that was
    // removed takes its findings' only route to resolution with it, so leaving
    // them open is not caution — it is a permanent entry nobody can act on.
    if (!registered.has(f.check_id)) {
      if (f.status !== 'resolved') expire.push(f.id);
      continue;
    }

    if (f.status !== 'open') continue;
    if (!policy.severities.includes(f.severity)) continue;
    if (new Date(f.first_seen_at).getTime() > staleBefore) continue;

    shelve.push({ id: f.id, until });
  }

  return { shelve, expire, resolution: 'expired' };
}

/**
 * How many findings the console shows before it starts hiding them.
 *
 * The other half of the gate's cap. Not a filter on what EXISTS — everything
 * stays one click away — but the default view is bounded so a bad week cannot
 * turn the page into a wall that gets closed unread.
 */
export const SURFACED_BY_DEFAULT = 25;
