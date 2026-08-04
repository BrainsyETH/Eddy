import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveInvariantFindings, invariantRuleKey, type InvariantRow } from './schema-invariants';
import { SCHEMA_INVARIANT_RULES, isRuleClassified, severityForRule } from '../severity';

function row(overrides: Partial<InvariantRow> = {}): InvariantRow {
  return {
    invariant_key: 'feedback_rls_enabled',
    ok: true,
    detail: 'row level security is enabled',
    ...overrides,
  };
}

// ── the basic contract ───────────────────────────────────────────

test('a passing invariant produces no finding', () => {
  assert.deepEqual(deriveInvariantFindings([row()]), []);
});

test('a failing invariant produces one finding carrying the catalog detail', () => {
  // The detail comes from the database, not from this file. It names the actual
  // grants or policies found, which is what makes the finding actionable
  // instead of a label.
  const findings = deriveInvariantFindings([
    row({
      invariant_key: 'feedback_no_public_mutation_grants',
      ok: false,
      detail: 'write grants still held (anon:INSERT, anon:UPDATE)',
    }),
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'schema_feedback_no_public_mutation_grants');
  assert.equal(findings[0].entityType, 'repo');
  assert.match(findings[0].detail, /anon:INSERT/);
});

test('mixed results report only the failures', () => {
  const findings = deriveInvariantFindings([
    row({ invariant_key: 'feedback_rls_enabled', ok: true }),
    row({ invariant_key: 'admin_policies_use_is_admin', ok: false, detail: '10 policies' }),
    row({ invariant_key: 'segment_cache_no_public_mutation', ok: true }),
  ]);
  assert.deepEqual(
    findings.map((f) => f.entityKey),
    ['admin_policies_use_is_admin'],
  );
});

// ── the prefix, and why it exists ────────────────────────────────

test('rule keys are namespaced so a schema assertion cannot collide with a river rule', () => {
  // Both feed one fingerprint space. An invariant named `threshold_order` would
  // otherwise share identity with validate_river_data()'s rule of that name and
  // resolve it.
  assert.equal(invariantRuleKey('feedback_rls_enabled'), 'schema_feedback_rls_enabled');
  for (const rule of SCHEMA_INVARIANT_RULES) {
    assert.match(rule, /^schema_/);
  }
});

test('every invariant the function can return has a severity', () => {
  // The SQL and this list have to move together; if trust_schema_invariants()
  // grows an assertion, it lands here or it files as unclassified.
  for (const rule of SCHEMA_INVARIANT_RULES) {
    assert.equal(isRuleClassified(rule), true, `${rule} is unclassified`);
  }
});

// ── the severity split is the judgement worth pinning ────────────

test('RLS being off outranks a missing REVOKE', () => {
  // These are not the same problem. A missing REVOKE is defence-in-depth that
  // is currently redundant — RLS is holding the line — whereas RLS being off
  // means every policy on the table is inert right now with nothing behind it.
  assert.equal(severityForRule('schema_feedback_rls_enabled'), 'critical');
  assert.equal(severityForRule('schema_feedback_no_public_mutation_grants'), 'high');
});

test('an INSERT policy reappearing on feedback is critical', () => {
  // 20260731010000_feedback_api_only.sql removes it deliberately: writes go
  // through /api/feedback with the service role. Its return means the anon key
  // — which Metro inlines into the shipped bundle — can write again.
  assert.equal(severityForRule('schema_feedback_no_public_insert_policy'), 'critical');
});

test('the finding records whether the invariant is one of the critical set', () => {
  const findings = deriveInvariantFindings([
    row({ invariant_key: 'feedback_rls_enabled', ok: false, detail: 'RLS is DISABLED' }),
    row({ invariant_key: 'admin_policies_use_is_admin', ok: false, detail: '10 policies' }),
  ]);
  assert.equal(findings[0].evidence?.critical, true);
  assert.equal(findings[1].evidence?.critical, false);
});

// ── shape ────────────────────────────────────────────────────────

test('an empty result set produces no findings', () => {
  // The check reports scopeCount separately; zero invariants asserted is caught
  // by reconcile.ts's empty_scope refusal, not by inventing a finding here.
  assert.deepEqual(deriveInvariantFindings([]), []);
});

test('findings cite the audit they come from', () => {
  const findings = deriveInvariantFindings([row({ ok: false, detail: 'x' })]);
  assert.equal(findings[0].evidence?.source, 'docs/legacy-schema-security-audit.md');
});
