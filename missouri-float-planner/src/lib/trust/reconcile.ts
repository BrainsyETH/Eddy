// src/lib/trust/reconcile.ts
// Decides what one check run changes about the ledger.
//
// Same arrangement as src/lib/alerts/drain.ts and for the same reason: the cron
// does the querying and writing, this module owns the policy, so the rules can
// be tested exhaustively without a database. The decision is small and it is the
// one that determines whether this system can be believed.
//
// ── The direction that is dangerous ──────────────────────────────────────
//
// Auto-resolve is the point of the ledger. A check that stops emitting a finding
// it emitted yesterday means someone fixed it, and saying so is what makes the
// difference between a backlog and a record of repair.
//
// It is also the direction in which a broken system looks healthy. A check with
// a typo'd RPC name emits nothing. A check whose rivers query returns zero rows
// emits nothing. A check running against the wrong project emits nothing. Every
// one of those is indistinguishable, in the output alone, from "everything is
// fine now" — and the failure mode is not a missed alert, it is a green
// dashboard asserting that water nobody checked is safe.
//
// docs/OBSERVABILITY_AND_UPGRADES.md recorded this exact shape once already,
// after browser errors went nowhere for months behind a healthy-looking Sentry
// dashboard: "a monitoring gap does not announce itself — it looks exactly like
// an absence of errors."
//
// So resolution is refused in three cases. Refusing is cheap — a finding stays
// open one more hour — and accepting wrongly is not.

export type SuppressedReason = 'check_error' | 'empty_scope' | 'partial_scope' | 'mass_resolve';

/**
 * Which refusals are worth telling the operator about.
 *
 * A truncated pass is ordinary operational behaviour — the check ran out of its
 * time budget and will finish next hour. The other three mean something is
 * wrong with the checking itself, which is worse than anything the check
 * measures, so they go in the ledger rather than only the run row.
 */
export function suppressionWarrantsFinding(reason: SuppressedReason): boolean {
  return reason !== 'partial_scope';
}

export interface ReconcileInput {
  /** 'error' when the check threw. */
  checkStatus: 'ok' | 'error';
  /** Entities the check examined. Zero means it learned nothing. */
  scopeCount: number;
  /** The check reported on only part of its scope — see TrustCheckResult.partial. */
  partial?: boolean;
  /** Fingerprints currently status='open' for this check. The only ones resolvable. */
  openFingerprints: readonly string[];
  /** Fingerprints currently status='snoozed'. Refreshed on re-emission, never resolved. */
  snoozedFingerprints?: readonly string[];
  /** What this run emitted. */
  emittedFingerprints: readonly string[];
  /** Below this many resolutions, never suspect a mass resolve. Default 5. */
  massResolveMinAbsolute?: number;
  /** Fraction of the open set above which a resolve is suspect. Default 0.5. */
  massResolveFraction?: number;
}

export interface ReconcilePlan {
  /** Create, or re-open a previously resolved row. Recurrence after a fix belongs here. */
  raise: string[];
  /** Already open or snoozed — refresh detail, evidence, last_seen_at, occurrences. */
  touch: string[];
  /** Open and no longer emitted — the check says these are fixed. */
  resolve: string[];
  suppressedReason?: SuppressedReason;
}

const DEFAULT_MASS_RESOLVE_MIN_ABSOLUTE = 5;
const DEFAULT_MASS_RESOLVE_FRACTION = 0.5;

/**
 * A run that learned nothing changes nothing.
 *
 * Note that this refuses `raise` and `touch` as well, not just `resolve`. A
 * check that threw partway through has produced half an answer, and half an
 * answer is not an answer — raising findings from it would put entries in the
 * ledger attributed to a run that is on record as having failed.
 */
function refuse(reason: SuppressedReason): ReconcilePlan {
  return { raise: [], touch: [], resolve: [], suppressedReason: reason };
}

export function planReconcile(input: ReconcileInput): ReconcilePlan {
  if (input.checkStatus === 'error') {
    return refuse('check_error');
  }

  // Zero entities examined is not zero problems found. A check can only be
  // trusted to report an absence over a scope it actually looked at, and this
  // is the only signal that distinguishes the two.
  if (input.scopeCount <= 0) {
    return refuse('empty_scope');
  }

  const open = new Set(input.openFingerprints);
  const snoozed = new Set(input.snoozedFingerprints ?? []);
  const emitted = new Set(input.emittedFingerprints);

  const raise: string[] = [];
  const touch: string[] = [];
  for (const fp of emitted) {
    if (open.has(fp) || snoozed.has(fp)) touch.push(fp);
    else raise.push(fp);
  }

  // A run that only reached half its rivers emitted nothing for the other half,
  // and that silence is not evidence. Raise and touch what it did find; resolve
  // nothing until a pass completes.
  if (input.partial) {
    return { raise, touch, resolve: [], suppressedReason: 'partial_scope' };
  }

  // Snoozed findings are excluded here as well as from `open`: a snooze is an
  // operator saying "I know, stop telling me", and having the next run quietly
  // close it would lose the fact that it was never actually fixed.
  const resolve = input.openFingerprints.filter((fp) => !emitted.has(fp));

  const minAbsolute = input.massResolveMinAbsolute ?? DEFAULT_MASS_RESOLVE_MIN_ABSOLUTE;
  const fraction = input.massResolveFraction ?? DEFAULT_MASS_RESOLVE_FRACTION;

  // Both conditions, not either. The fraction alone would fire on 1 of 1, which
  // is an ordinary fix; the absolute alone would fire on 6 of 400, which is an
  // ordinary afternoon. Together they describe the thing worth stopping for:
  // most of what was open went quiet at once.
  const suspicious =
    resolve.length > minAbsolute && resolve.length > input.openFingerprints.length * fraction;

  if (suspicious) {
    // Everything the run positively asserted still lands. It is only the
    // disappearances that are refused, because a disappearance is an assertion
    // about something the run did not mention, and this run has lost the
    // standing to make one.
    return { raise, touch, resolve: [], suppressedReason: 'mass_resolve' };
  }

  return { raise, touch, resolve };
}

/**
 * The finding a suppressed run files against itself.
 *
 * A refusal that only reached the logs would be a monitoring gap of exactly the
 * kind this module exists to prevent, so it goes in the ledger at the same
 * severity as the data problems it is standing in for.
 */
export function reconcileAnomalyDetail(
  checkId: string,
  reason: SuppressedReason,
  counts: { openCount: number; wouldResolve: number; scopeCount: number },
): string {
  switch (reason) {
    case 'check_error':
      return `Check "${checkId}" failed, so nothing was resolved. ${counts.openCount} finding(s) remain open and unverified.`;
    case 'empty_scope':
      return `Check "${checkId}" examined 0 entities and emitted nothing. That is indistinguishable from "all clear", so nothing was resolved. ${counts.openCount} finding(s) remain open and unverified.`;
    case 'partial_scope':
      return `Check "${checkId}" ran out of time after ${counts.scopeCount} entities and reported on only part of its scope, so nothing was resolved.`;
    case 'mass_resolve':
      return `Check "${checkId}" would have resolved ${counts.wouldResolve} of ${counts.openCount} open finding(s) in one run over ${counts.scopeCount} entities. Resolution was refused pending review — verify the check is still working before trusting the all-clear.`;
  }
}
