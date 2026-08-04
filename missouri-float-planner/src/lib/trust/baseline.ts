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
//
// ── Why a signature match is not enough ─────────────────────────────────
//
// The first version of this asked one question: is a finding with this
// signature open? On 2026-08-04 that produced a critical "a closed
// safety-critical defect is back" about `feedback-public-write-grants` while
// the grants were, on production, gone.
//
//   18:00:30  schema_invariants runs and raises the finding. Correct: the
//             grants were still there.
//   18:15:29  the revoke migration is applied.
//   18:19:51  TRUNCATE revoked too, and the invariant widened to check it.
//             The defect is now closed by every measure the check applies.
//   21:00:34  known_regressions runs — hourly — reads that still-open finding
//             and reports the repair as having failed.
//
// schema_invariants is a DAILY check. Nothing had re-examined the grants since
// 18:00, so nothing could have closed the finding. The ledger was not wrong
// about anything; it was asked a question it had no fresh evidence for and
// answered anyway.
//
// An open finding is not an observation. It is the residue of the last
// observation, and between a repair and the next run of the check that owns the
// signature that residue is guaranteed to be stale. reconcile.ts already
// refuses to assert an ABSENCE it did not observe — "a check can only be
// trusted to report an absence over a scope it actually looked at". This is the
// same error with the sign flipped: asserting a PRESENCE nothing observed. It
// landed on the one finding the Trust MVP gate treats as disqualifying.
//
// So a regression now requires a finding seen at or after the instant the
// repair landed. A finding older than the repair means the ledger has not
// looked since, which is neither a regression nor an all-clear — see
// `unverified` and `gateMet`.

export interface BaselineDefect {
  id: string;
  /** What was wrong, in the terms someone would search for later. */
  summary: string;
  /** Why it mattered enough to be on this list. */
  consequence: string;
  /** The migration or module that closed it. */
  closedBy: string;
  /** ISO date the fix was confirmed against production or CI. Prose only. */
  verifiedOn: string;
  /**
   * The finding that would appear if it regressed.
   *
   * `entityKey` is omitted when any entity matching the rule counts — the
   * geometry RPC failing is not about one river.
   */
  reappearsAs?: {
    checkId: string;
    ruleKey: string;
    entityKey?: string;
    /**
     * The instant the repair landed, to compare against a finding's
     * `last_seen_at`.
     *
     * It lives here rather than beside `verifiedOn` because it is only
     * meaningful for entries the ledger can see, and putting it inside the
     * signature makes it impossible to declare one without it.
     *
     * `verifiedOn` cannot do this job: it is a date, so it reads as midnight,
     * and the finding this whole rule exists to reject was last seen at 18:00
     * on the same day. Every stale finding would clear a date comparison.
     *
     * Use the instant the defect was closed as the check NOW measures it, which
     * is not always when the headline migration ran — see the feedback entry.
     */
    verifiedAt: string;
  };
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
    reappearsAs: {
      checkId: 'river_geometry',
      ruleKey: 'geometry_missing',
      verifiedAt: '2026-08-04T16:37:47Z',
    },
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
    closedBy:
      '20260804181529_revoke_public_write_grants_on_feedback.sql and ' +
      '20260804181951_feedback_revoke_truncate_and_check_it.sql',
    verifiedOn: '2026-08-04',
    reappearsAs: {
      checkId: 'schema_invariants',
      ruleKey: 'schema_feedback_no_public_mutation_grants',
      // 18:19:51, not the 18:15:29 revoke that gets the headline. That one left
      // TRUNCATE behind, and TRUNCATE is the privilege here RLS does not cover
      // at all; the invariant did not even look for it until 20260804181951
      // added it to the checked set. So between those two migrations the check
      // as it stands today would still have failed, and dating the repair from
      // the earlier one would let a genuine failure in that window read as a
      // post-repair observation. Later is the safe direction.
      verifiedAt: '2026-08-04T18:19:51Z',
    },
  },
  {
    id: 'gauge-reverse-lookup-ambiguous',
    summary: 'asking which river a shared gauge is on returned an arbitrary answer',
    consequence:
      'Every consumer used `find(l => l.isPrimary) || links[0]`, which returns whichever row the query ordered first, so USGS 07014000 could present as Huzzah on the map and Courtois on the detail screen within one session. docs/gauge-alerting-misalignment-audit.md is an entire document about what this class does when it reaches the alerting path.',
    closedBy: 'shared/primary-river-link.ts and 20260804141629_one_primary_gauge_per_river.sql',
    verifiedOn: '2026-08-04',
    reappearsAs: {
      checkId: 'gauge_wiring',
      ruleKey: 'gauge_dual_primary',
      verifiedAt: '2026-08-04T14:16:29Z',
    },
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
  /**
   * When a run last OBSERVED this finding, not when the row was written.
   *
   * Required, and deliberately not optional. A caller that forgets to select it
   * would otherwise silently reintroduce the timestamp-blind comparison, and
   * there is no default that is safe in both directions: treating it as recent
   * cries wolf, treating it as old hides a real regression. Failing to compile
   * is the only honest option.
   */
  last_seen_at: string;
}

export interface BaselineAssessment {
  total: number;
  /** Entries the ledger can speak to at all. */
  ledgerVisible: number;
  /** Entries observed to be open again by a run that post-dates the repair. */
  regressed: BaselineDefect[];
  /**
   * Entries whose only matching finding pre-dates the repair.
   *
   * The owning check has not looked since the fix landed, so the ledger holds
   * residue rather than evidence. Not a regression, and not proof it stayed
   * closed either — the state the gate has to be told about rather than shown a
   * confident answer for.
   *
   * No finding is filed for this. It is the ordinary state of every daily check
   * for up to a day after a repair, and a check that has genuinely STOPPED
   * running is ledger_heartbeat's job — it watches all eight checks, not just
   * the ones a baseline entry happens to point at.
   */
  unverified: BaselineDefect[];
  /** Entries no check can see; CI is the guard. */
  guardedElsewhere: BaselineDefect[];
  /**
   * The gate's answer for this criterion: false regressed, null unproven, true
   * clear.
   *
   * Three-valued for the reason the review route already gives about every
   * other criterion — "not measured" and "failing" are different answers, and
   * rendering the first as the second is how a dashboard trains an operator to
   * ignore it. The converse matters more here: rendering unproven as PASSING is
   * how the gate certifies a repair nothing has re-checked.
   *
   * Deliberately not a claim about the CI-guarded entries either: this function
   * has no evidence about those, and reporting them as clear would be asserting
   * on something it never looked at.
   */
  gateMet: boolean | null;
}

/** Pure. The register plus what is currently open, in; the gate answer, out. */
export function assessBaseline(
  entries: readonly BaselineDefect[],
  open: readonly OpenFindingKey[],
): BaselineAssessment {
  const regressed: BaselineDefect[] = [];
  const unverified: BaselineDefect[] = [];
  const guardedElsewhere: BaselineDefect[] = [];

  for (const entry of entries) {
    if (!entry.reappearsAs) {
      guardedElsewhere.push(entry);
      continue;
    }
    const signature = entry.reappearsAs;
    const matches = open.filter(
      (f) =>
        f.check_id === signature.checkId &&
        f.rule_key === signature.ruleKey &&
        (signature.entityKey === undefined || f.entity_key === signature.entityKey),
    );
    if (matches.length === 0) continue;

    // `last_seen_at` is the START of the run that observed the finding, which
    // is what makes this comparison sound: a run that started before the repair
    // cannot have read the repaired state, whatever it saw later in its pass.
    //
    // A run straddling the repair by seconds therefore counts as unverified
    // rather than regressed. That is the quiet direction on a knife-edge, and
    // it is the right one — the next run settles it within the cadence, while
    // the loud direction is precisely the false critical this rule exists to
    // stop. An unparseable timestamp lands here too, for the same reason.
    const verifiedAt = Date.parse(signature.verifiedAt);
    const observedSinceRepair = matches.some((f) => {
      const seen = Date.parse(f.last_seen_at);
      return Number.isFinite(seen) && seen >= verifiedAt;
    });

    if (observedSinceRepair) regressed.push(entry);
    else unverified.push(entry);
  }

  return {
    total: entries.length,
    ledgerVisible: entries.length - guardedElsewhere.length,
    regressed,
    unverified,
    guardedElsewhere,
    gateMet: regressed.length > 0 ? false : unverified.length > 0 ? null : true,
  };
}

/** The sentence a regressed defect files against itself. */
export function regressionDetail(entry: BaselineDefect): string {
  return (
    `This was closed on ${entry.verifiedOn} by ${entry.closedBy} and has come back. ` +
    `Why it mattered: ${entry.consequence} ` +
    `It is on the safety-critical baseline in src/lib/trust/baseline.ts, so the Trust MVP gate ` +
    `cannot pass while it is open. ` +
    // Says what standard of evidence this is claiming, because the first
    // version of this finding was raised on stale residue and read exactly the
    // same as a real one.
    `The finding was observed again by a run that started after the repair landed at ` +
    `${entry.reappearsAs?.verifiedAt ?? entry.verifiedOn}, so this is a fresh observation ` +
    `rather than a finding nothing has re-checked since.`
  );
}
