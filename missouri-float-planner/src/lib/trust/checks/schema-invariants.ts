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

/** Pure. Failed assertions become findings; passing ones become silence. */
export function deriveInvariantFindings(rows: readonly InvariantRow[]): RawFinding[] {
  return rows
    .filter((row) => !row.ok)
    .map((row) => ({
      entityType: 'repo' as const,
      entityKey: row.invariant_key,
      ruleKey: invariantRuleKey(row.invariant_key),
      title: `Schema invariant failed: ${row.invariant_key.replace(/_/g, ' ')}`,
      detail: row.detail,
      evidence: {
        invariant: row.invariant_key,
        source: 'docs/legacy-schema-security-audit.md',
        critical: CRITICAL_INVARIANTS.has(row.invariant_key),
      },
    }));
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
    return { scopeCount: rows.length, findings: deriveInvariantFindings(rows) };
  },
};
