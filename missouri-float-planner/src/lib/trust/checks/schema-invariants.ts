// src/lib/trust/checks/schema-invariants.ts
// The release invariants from docs/legacy-schema-security-audit.md, asked of
// the catalog on a schedule instead of by hand before a release.
//
// That audit closes with an instruction that had been outstanding since it was
// written: "Turn each confirmed critical invariant into a catalog-level
// automated check when the linked database test harness is available." This is
// it. The SQL lives in trust_schema_invariants(); this file is the wrapper that
// turns a failed assertion into a finding.
//
// ── Why the catalog, when two checks already cover this ground ───────────
//
// scripts/security/segment-cache-policy.test.ts and workflow-action-pins.test.ts
// both assert on FILE CONTENTS. A migration that says `revoke all ... from anon`
// proves someone wrote the intent down. It cannot prove the statement reached
// production — and the reason that audit exists at all is that local migration
// history and production history diverged before 00212.
//
// Only the catalog knows what is actually true, which is why this check runs
// against pg_class, pg_policies and pg_constraint rather than against .sql
// files.

import {
  activeExceptionDetail,
  exceptionFor,
  expiredExceptionDetail,
  SCHEMA_EXCEPTIONS,
  type SchemaException,
} from '../exceptions';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

export interface InvariantRow {
  invariant_key: string;
  ok: boolean;
  detail: string;
}

/**
 * Severity is per-invariant rather than per-rule, because these are not the
 * same kind of problem.
 *
 * A missing REVOKE is defence-in-depth that is currently redundant — RLS is
 * holding — so it is high, not critical. RLS being OFF would mean every policy
 * on the table is inert right now, with no second line, which is a different
 * thing entirely.
 */
const CRITICAL_INVARIANTS = new Set([
  'feedback_rls_enabled',
  'feedback_no_public_insert_policy',
  'segment_cache_no_public_mutation',
]);

export function invariantRuleKey(invariantKey: string): string {
  return `schema_${invariantKey}`;
}

/** The rule an unnecessary exception is filed under. */
export const STALE_EXCEPTION_RULE = 'schema_exception_unnecessary';

/**
 * Pure. Failed assertions become findings; passing ones become silence — except
 * where the register in exceptions.ts has something to say.
 *
 * Three outcomes rather than two:
 *
 *   failed, no exception     → an open finding, as before.
 *   failed, live exception   → the same finding, filed SNOOZED to the expiry.
 *                              It stays in the record with its full history and
 *                              its real severity; it just is not in the list of
 *                              things nobody has looked at. On the expiry date
 *                              the ledger's ordinary snooze-wake machinery
 *                              reopens it with no help from anyone.
 *   failed, lapsed exception → an open finding whose detail names the owner,
 *                              the date it ran out, and what closing it needs.
 *
 * The fingerprint is identical in all three: same entity, same rule. An
 * exception being granted, expiring, or being renewed does not fork the
 * finding's identity, so the history reads as one continuous story about one
 * problem — which is the only way an expiry is auditable at all.
 */
export function deriveInvariantFindings(
  rows: readonly InvariantRow[],
  now: Date = new Date(),
  // Defaults to the live register. Injectable only so the exception behaviour
  // stays testable when that register is empty, which is the state it is
  // supposed to be in — see exceptionFor().
  register: readonly SchemaException[] = SCHEMA_EXCEPTIONS,
): RawFinding[] {
  const findings: RawFinding[] = rows
    .filter((row) => !row.ok)
    .map((row) => {
      const verdict = exceptionFor(row.invariant_key, now, register);
      const base = {
        entityType: 'repo' as const,
        entityKey: row.invariant_key,
        ruleKey: invariantRuleKey(row.invariant_key),
        title: `Schema invariant failed: ${row.invariant_key.replace(/_/g, ' ')}`,
        evidence: {
          invariant: row.invariant_key,
          source: 'docs/legacy-schema-security-audit.md',
          critical: CRITICAL_INVARIANTS.has(row.invariant_key),
        },
      };

      if (verdict.kind === 'active') {
        return {
          ...base,
          title: `${base.title} (accepted until ${verdict.exception.expires})`,
          detail: row.detail + activeExceptionDetail(verdict.exception),
          evidence: {
            ...base.evidence,
            exception: {
              owner: verdict.exception.owner,
              expires: verdict.exception.expires,
              status: 'active',
            },
          },
          snoozeUntil: verdict.expiresAt.toISOString(),
        };
      }

      if (verdict.kind === 'expired') {
        return {
          ...base,
          title: `${base.title} — accepted exception EXPIRED`,
          detail: row.detail + expiredExceptionDetail(verdict.exception),
          evidence: {
            ...base.evidence,
            exception: {
              owner: verdict.exception.owner,
              expires: verdict.exception.expires,
              status: 'expired',
            },
          },
        };
      }

      return { ...base, detail: row.detail };
    });

  // An exception governing an invariant that now PASSES is stale, and a stale
  // exception is not harmless: it is a standing permission to break something
  // that is currently fine, which nobody will notice has outlived its reason
  // until the invariant fails again and quietly files itself as pre-accepted.
  //
  // Low severity — nothing is broken — but it belongs in the same list, because
  // the register is only trustworthy if it is also checked.
  const asserted = new Set(rows.map((r) => r.invariant_key));
  const passing = new Set(rows.filter((r) => r.ok).map((r) => r.invariant_key));

  for (const exception of register) {
    // Only judge what this run actually asserted. An exception naming an
    // invariant the function no longer returns is a different problem, and
    // guessing at it from a run that may itself be broken is how a check starts
    // reporting on things it cannot see.
    if (!asserted.has(exception.invariantKey)) continue;
    if (!passing.has(exception.invariantKey)) continue;

    findings.push({
      entityType: 'repo',
      entityKey: exception.invariantKey,
      ruleKey: STALE_EXCEPTION_RULE,
      title: `Accepted exception is no longer needed: ${exception.invariantKey.replace(/_/g, ' ')}`,
      detail:
        `The invariant "${exception.invariantKey}" now passes on production, but an accepted ` +
        `exception for it is still recorded in src/lib/trust/exceptions.ts, owned by ` +
        `${exception.owner} and running until ${exception.expires}. Delete the entry — an ` +
        `exception left behind is a standing permission to break this again without anyone ` +
        `being told.`,
      evidence: {
        invariant: exception.invariantKey,
        owner: exception.owner,
        expires: exception.expires,
      },
    });
  }

  return findings;
}

export const schemaInvariantsCheck: TrustCheck = {
  id: 'schema_invariants',
  title: 'Schema security invariants',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { data, error } = await ctx.supabase.rpc('trust_schema_invariants');
    if (error) {
      throw new Error(`trust_schema_invariants() failed: ${error.message}`);
    }

    const rows: InvariantRow[] = data ?? [];

    // Scope is the number of invariants ASSERTED, not the number that failed.
    // Zero means the function returned nothing — which for a security check is
    // the worst possible silence, and reconciliation refuses to resolve on it.
    return { scopeCount: rows.length, findings: deriveInvariantFindings(rows, ctx.now) };
  },
};
