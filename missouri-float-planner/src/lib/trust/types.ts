// src/lib/trust/types.ts
// The contract a trust check implements.
//
// A check does one thing: look at something and describe what is wrong with it.
// It does not decide severity (severity.ts), does not decide whether a finding
// is new (reconcile.ts), and does not write to the ledger (the cron route). That
// split is what lets the whole policy be unit-tested without a database, which
// is the same arrangement src/lib/alerts/drain.ts uses and for the same reason.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * What a finding is attached to.
 *
 * `repo` and `global` exist because not every problem belongs to a river:
 * a schema invariant that has drifted is a fact about the deployment, and a
 * check reporting on its own reconciliation is a fact about the ledger.
 *
 * `service` is a directory business, keyed by its `nearby_services.id`. It is
 * not a river: one river carries dozens of services, and since the fingerprint
 * hashes the entity key, filing them under the river would merge every service
 * on the Current into a single finding.
 *
 * Mirrored by the `trust_findings_entity_type` CHECK constraint — widening this
 * union alone is not enough, because trust_apply_reconcile() inserts the value
 * unvalidated and the constraint is the only gate.
 */
export type TrustEntityType =
  | 'river'
  | 'gauge'
  | 'access_point'
  | 'service'
  | 'repo'
  | 'global';

export interface TrustCheckContext {
  /** Service-role client. Untyped, matching createAdminClient()'s own signature. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  now: Date;
  /** Date.now() value past which the check should stop and return what it has. */
  deadlineMs: number;
}

/**
 * A problem, before the ledger has decided anything about it.
 *
 * `ruleKey` is the stable name of the rule that fired — `threshold_order`, not
 * "Thresholds are out of order for Current @ Van Buren". It is half the
 * fingerprint, so it must not contain values. The human sentence goes in
 * `title`, and the values go in `detail` and `evidence`, all three of which may
 * change between runs without changing the finding's identity.
 */
export interface RawFinding {
  entityType: TrustEntityType;
  entityKey: string;
  ruleKey: string;
  title: string;
  detail: string;
  evidence?: Record<string, unknown>;
  /**
   * File this finding already snoozed, until the given instant.
   *
   * The one case for it is a governed exception: a deviation somebody has
   * explicitly accepted, with an owner and an expiry, in
   * src/lib/trust/exceptions.ts. Such a finding is real and must stay in the
   * record — but it is also already triaged, and leaving it in the open list
   * teaches the operator that the open list contains things nobody needs to act
   * on, which is the failure this whole console is arguing against.
   *
   * Honoured only when the finding is RAISED, never on a touch. An operator who
   * reopens a governed finding has overruled the register for that row, and a
   * scheduled run re-snoozing it every hour would be the ledger arguing with
   * the person it exists to serve.
   *
   * Everything else about it is ordinary: the expiry is a normal snooze
   * deadline, so classifyExisting() wakes it on its own when the date passes.
   */
  snoozeUntil?: string;
}

export interface TrustCheckResult {
  /**
   * How many entities the check actually examined.
   *
   * Load-bearing, not diagnostic. A check that examined zero rivers and a check
   * that examined thirteen healthy rivers both return an empty `findings` array,
   * and only this number tells them apart. Reconciliation refuses to resolve
   * anything when it is zero — see reconcile.ts.
   */
  scopeCount: number;
  findings: RawFinding[];
  /**
   * The check ran out of time and reported on only part of its scope.
   *
   * Load-bearing for the same reason scopeCount is. A truncated pass emits
   * findings for the entities it reached and silence for the ones it never
   * opened — and that silence is indistinguishable from "fixed". Without this
   * flag, one slow afternoon resolves every finding on whatever the check did
   * not get to.
   */
  partial?: boolean;
}

export interface TrustCheck {
  /** Stable across renames of anything else; it is stored in every row. */
  id: string;
  title: string;
  cadence: 'hourly' | 'daily';
  run(context: TrustCheckContext): Promise<TrustCheckResult>;
}

/** Narrowed shape of what the cron route loads for reconciliation. */
export interface ExistingFinding {
  id: string;
  fingerprint: string;
  status: 'open' | 'snoozed' | 'resolved';
}

export type { SupabaseClient };
