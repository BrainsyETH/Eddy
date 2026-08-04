// src/lib/trust/baseline.ts
// The safety-critical defects that were open when this subsystem started, and
// what would tell us any of them came back.
//
// ── The gate this exists for ────────────────────────────────────────────
//
// The revised Trust MVP gate added a criterion the first draft lacked: "every
// known safety-critical defect that existed at Phase 0 is closed, and the
// ledger shows it staying closed". Its own note explains why — every other
// criterion in that gate measures DETECTION, and a system can detect
// beautifully while nothing gets repaired. That is the difference between a
// repair and a better-formatted backlog.
//
// The criterion was unanswerable, because nothing enumerated the set. "Every
// known defect" is not a query. This file is the list, so the question has an
// answer that does not depend on whose memory is consulted.
//
// ── Why some entries have no ledger signature ───────────────────────────
//
// Two of these are code-shape defects, not data defects: a float time that
// disagreed across surfaces, and a staleness constant defined three times. No
// check can see those, because there is no row to look at — they are guarded by
// tests that fail CI instead. They are still listed, because the gate asks
// about the known set and a list that quietly omits what it cannot check is the
// same confident-pass failure this subsystem keeps finding in itself.
//
// Entries carry `guardedBy` instead of `reappearsAs`, and assessBaseline()
// reports them as guarded elsewhere rather than counting them clear on evidence
// it does not have.

export interface BaselineDefect {
  id: string;
  /** What was wrong, in the terms someone would search for later. */
  summary: string;
  /** Why it mattered enough to be on this list. */
  consequence: string;
  /** The migration or module that closed it. */
  closedBy: string;
  /** ISO date the fix was confirmed against production or CI. */
  verifiedOn: string;
  /**
   * The finding that would appear if it regressed.
   *
   * `entityKey` is omitted when any entity matching the rule counts — the
   * geometry RPC failing is not about one river.
   */
  reappearsAs?: { checkId: string; ruleKey: string; entityKey?: string };
  /** Where the CI guard lives, for defects no check can see. */
  guardedBy?: string;
}

export const SAFETY_BASELINE: readonly BaselineDefect[] = [
  {
    id: 'geometry-rpc-missing',
    summary: 'get_river_geometry_json() was absent from production',
    consequence:
      'PostgREST returns an error object rather than throwing, and the caller read only `data`, so a missing FUNCTION was indistinguishable from a river with no GEOMETRY. /api/admin/river-health reported "No geometry data found" for every river, and the ledger raised the same finding 24 times on its first run.',
    closedBy: '20260804163747_restore_get_river_geometry_json.sql',
    verifiedOn: '2026-08-04',
    reappearsAs: { checkId: 'river_geometry', ruleKey: 'geometry_missing' },
  },
  {
    id: 'invariants-blind-to-public',
    summary: 'trust_schema_invariants() could not see grants made to PUBLIC',
    consequence:
      'aclexplode() represents PUBLIC as grantee 0, which has no pg_roles row, so an INNER join dropped every PUBLIC grant. `GRANT INSERT ON feedback TO PUBLIC` — which reaches anon, because anon is a member of PUBLIC — passed the check clean. A security check reporting no problem because it could not see the problem.',
    closedBy: '20260804175222_trust_schema_invariants_see_public_grants.sql',
    verifiedOn: '2026-08-04',
    guardedBy: 'scripts/security/trust-invariants-public-acl.test.ts',
  },
  {
    id: 'feedback-public-write-grants',
    summary: 'feedback granted INSERT/UPDATE/DELETE to anon and authenticated',
    consequence:
      'RLS was holding, so nothing was writable in practice — but the publishable key is inlined into the shipped iOS bundle by design, and a table protected by one mechanism is one accidental permissive policy away from exposure.',
    closedBy: '20260804181529_revoke_public_write_grants_on_feedback.sql',
    verifiedOn: '2026-08-04',
    reappearsAs: {
      checkId: 'schema_invariants',
      ruleKey: 'schema_feedback_no_public_mutation_grants',
    },
  },
  {
    id: 'gauge-reverse-lookup-ambiguous',
    summary: 'asking which river a shared gauge is on returned an arbitrary answer',
    consequence:
      'Every consumer used `find(l => l.isPrimary) || links[0]`, which returns whichever row the query ordered first, so USGS 07014000 could present as Huzzah on the map and Courtois on the detail screen within one session. docs/gauge-alerting-misalignment-audit.md is an entire document about what this class does when it reaches the alerting path.',
    closedBy: 'shared/primary-river-link.ts and 20260804141629_one_primary_gauge_per_river.sql',
    verifiedOn: '2026-08-04',
    reappearsAs: { checkId: 'gauge_wiring', ruleKey: 'gauge_dual_primary' },
  },
  {
    id: 'float-time-cross-surface-divergence',
    summary: 'plan, chat and social quoted different float times for the same trip',
    consequence:
      'A float time is a go/no-go input. Two surfaces disagreeing means at least one of them is wrong, and the user has no way to tell which.',
    closedBy: 'a single shared implementation (Part B2)',
    verifiedOn: '2026-08-04',
    guardedBy: 'src/lib/calculations/float-time-parity.test.ts',
  },
  {
    id: 'stale-reading-hours-triplicated',
    summary: 'STALE_READING_HOURS was defined in three places',
    consequence:
      'Three definitions of "this reading is too old to trust" drift, and the surface with the most generous one keeps showing a confident badge over a dead sensor.',
    closedBy: 'a single shared constant (Part B4)',
    verifiedOn: '2026-08-04',
    guardedBy: 'shared/reading-staleness.test.ts',
  },
];

/** The shape assessBaseline needs from an open finding. */
export interface OpenFindingKey {
  check_id: string;
  rule_key: string;
  entity_key?: string;
}

export interface BaselineAssessment {
  total: number;
  /** Entries the ledger can speak to at all. */
  ledgerVisible: number;
  /** Entries whose defect is currently open again. */
  regressed: BaselineDefect[];
  /** Entries no check can see; CI is the guard. */
  guardedElsewhere: BaselineDefect[];
  /**
   * True only when nothing the ledger CAN see has regressed.
   *
   * Deliberately not a claim about the CI-guarded entries: this function has no
   * evidence about those, and reporting them as clear would be asserting on
   * something it never looked at.
   */
  allClosed: boolean;
}

/** Pure. The register plus what is currently open, in; the gate answer, out. */
export function assessBaseline(
  entries: readonly BaselineDefect[],
  open: readonly OpenFindingKey[],
): BaselineAssessment {
  const regressed: BaselineDefect[] = [];
  const guardedElsewhere: BaselineDefect[] = [];

  for (const entry of entries) {
    if (!entry.reappearsAs) {
      guardedElsewhere.push(entry);
      continue;
    }
    const signature = entry.reappearsAs;
    const hit = open.some(
      (f) =>
        f.check_id === signature.checkId &&
        f.rule_key === signature.ruleKey &&
        (signature.entityKey === undefined || f.entity_key === signature.entityKey),
    );
    if (hit) regressed.push(entry);
  }

  return {
    total: entries.length,
    ledgerVisible: entries.length - guardedElsewhere.length,
    regressed,
    guardedElsewhere,
    allClosed: regressed.length === 0,
  };
}

/** The sentence a regressed defect files against itself. */
export function regressionDetail(entry: BaselineDefect): string {
  return (
    `This was closed on ${entry.verifiedOn} by ${entry.closedBy} and has come back. ` +
    `Why it mattered: ${entry.consequence} ` +
    `It is on the safety-critical baseline in src/lib/trust/baseline.ts, so the Trust MVP gate ` +
    `cannot pass while it is open.`
  );
}
