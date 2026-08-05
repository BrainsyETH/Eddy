import assert from 'node:assert/strict';
import test from 'node:test';
import { exceptionFor, SCHEMA_EXCEPTIONS, type SchemaException } from './exceptions';
import { deriveInvariantFindings, STALE_EXCEPTION_RULE } from './checks/schema-invariants';
import { severityForRule } from './severity';

// ── the register itself ──────────────────────────────────────────

test('every exception carries an owner, an expiry and exit criteria', () => {
  // docs/legacy-schema-security-audit.md:56 requires an owner and an expiry.
  // Exit criteria are this repo's addition: without them "temporary" is a label
  // rather than a state, and the renewal conversation has nothing to be about.
  for (const e of SCHEMA_EXCEPTIONS) {
    assert.ok(e.owner.length > 0, `${e.invariantKey} needs an owner`);
    assert.match(e.expires, /^\d{4}-\d{2}-\d{2}$/, `${e.invariantKey} needs an ISO expiry`);
    assert.ok(e.rationale.length > 40, `${e.invariantKey} needs a real rationale`);
    assert.ok(e.exitCriteria.length > 40, `${e.invariantKey} needs real exit criteria`);
  }
});

test('the live register is empty, and that is the goal rather than a gap', () => {
  // An exception is a holding position, not a resting place. This is not a
  // freeze — add one and this assertion is the prompt to say why in the commit,
  // not a reason to avoid recording it.
  assert.deepEqual(
    SCHEMA_EXCEPTIONS.map((e) => e.invariantKey),
    [],
  );
});

// ── what the ledger does with one ────────────────────────────────
//
// Against a FIXTURE, not against the live register. These tests used to index
// SCHEMA_EXCEPTIONS[0], so retiring the last real exception did not fail them —
// it crashed them, and had the register merely been allowed to be empty they
// would have silently stopped testing granting, expiry and renewal altogether.
// The behaviour has to stay covered for the next exception, which is exactly
// when nobody will be re-reading this file.

const GOVERNED = 'admin_policies_use_is_admin';
const EXPIRES = '2026-11-04';

const REGISTER: readonly SchemaException[] = [
  {
    invariantKey: GOVERNED,
    owner: 'BrainsyETH',
    expires: EXPIRES,
    rationale:
      'Fixture standing in for a real exception: ten policies inline the user_roles lookup ' +
      'instead of calling is_admin(), and rewriting them in one pass risks locking admins out.',
    exitCriteria:
      'All ten policies call is_admin(), verified by trust_schema_invariants() returning ok ' +
      'for this key on production rather than by a migration existing.',
  },
];

const BEFORE = new Date(`${EXPIRES}T00:00:00Z`);
const AFTER = new Date(new Date(`${EXPIRES}T23:59:59.999Z`).getTime() + 86_400_000);

test('an exception expires at the end of its stated day, not the start', () => {
  assert.equal(exceptionFor(GOVERNED, new Date(`${EXPIRES}T00:00:00Z`), REGISTER).kind, 'active');
  assert.equal(exceptionFor(GOVERNED, new Date(`${EXPIRES}T12:00:00Z`), REGISTER).kind, 'active');
  // An off-by-one here would wake findings a day early and teach the operator
  // that the dates are approximate.
  const dayAfter = new Date(`${EXPIRES}T23:59:59.999Z`).getTime() + 1;
  assert.equal(exceptionFor(GOVERNED, new Date(dayAfter), REGISTER).kind, 'expired');
});

test('an invariant with no exception has no verdict', () => {
  assert.equal(exceptionFor('feedback_rls_enabled', new Date('2026-08-04'), REGISTER).kind, 'none');
});

test('an empty register governs nothing', () => {
  assert.equal(exceptionFor(GOVERNED, BEFORE, []).kind, 'none');
});

function failing(key: string) {
  return [{ invariant_key: key, ok: false, detail: 'ten policies inline the user_roles lookup' }];
}

test('a governed failure is filed snoozed to the expiry, not open', () => {
  const [finding] = deriveInvariantFindings(failing(GOVERNED), BEFORE, REGISTER);
  assert.ok(finding.snoozeUntil, 'a live exception must pre-triage the finding');
  assert.equal(new Date(finding.snoozeUntil!).toISOString().slice(0, 10), EXPIRES);
  assert.match(finding.title, /accepted until/);
  assert.match(finding.detail, /BrainsyETH/);
  // Severity is untouched. A snooze says "somebody looked", not "it matters
  // less" — downgrading it would lose the reason the exception was needed.
  assert.equal(severityForRule(finding.ruleKey), 'high');
});

test('a lapsed exception wakes the finding and names who accepted it', () => {
  const [finding] = deriveInvariantFindings(failing(GOVERNED), AFTER, REGISTER);
  assert.equal(finding.snoozeUntil, undefined, 'an expired exception must not keep snoozing it');
  assert.match(finding.title, /EXPIRED/);
  assert.match(finding.detail, /expired on /);
  assert.match(finding.detail, /BrainsyETH/);
  assert.match(finding.detail, /renew the exception/);
});

test('granting, expiring and renewing never fork the finding identity', () => {
  // The property that makes an expiry auditable at all. If the fingerprint
  // moved, the ledger would show the exception lapsing as a NEW problem and the
  // history of the thing it governs would restart.
  const governed = deriveInvariantFindings(failing(GOVERNED), BEFORE, REGISTER)[0];
  const lapsed = deriveInvariantFindings(failing(GOVERNED), AFTER, REGISTER)[0];

  assert.equal(governed.entityType, lapsed.entityType);
  assert.equal(governed.entityKey, lapsed.entityKey);
  assert.equal(governed.ruleKey, lapsed.ruleKey);
});

test('an ungoverned failure is an ordinary open finding', () => {
  const [finding] = deriveInvariantFindings(
    [{ invariant_key: 'feedback_rls_enabled', ok: false, detail: 'RLS is DISABLED' }],
    BEFORE,
    REGISTER,
  );
  assert.equal(finding.snoozeUntil, undefined);
  assert.doesNotMatch(finding.title, /accepted|EXPIRED/);
});

// ── the register is itself checked ───────────────────────────────

test('an exception for an invariant that now passes is reported as stale', () => {
  const findings = deriveInvariantFindings(
    [{ invariant_key: GOVERNED, ok: true, detail: 'all ten policies call is_admin()' }],
    BEFORE,
    REGISTER,
  );

  const stale = findings.find((f) => f.ruleKey === STALE_EXCEPTION_RULE);
  assert.ok(stale, 'a passing invariant with a live exception must be reported');
  assert.equal(severityForRule(stale!.ruleKey), 'low');
  assert.match(stale!.detail, /exceptions\.ts/);
});

test('a passing invariant with no exception stays silent', () => {
  const findings = deriveInvariantFindings(
    [{ invariant_key: 'feedback_rls_enabled', ok: true, detail: 'enabled' }],
    BEFORE,
    REGISTER,
  );
  assert.deepEqual(findings, []);
});

test('an exception is not judged stale by a run that never asserted its invariant', () => {
  // Guessing from a run that may itself be broken is how a check starts
  // reporting on things it cannot see — the failure this subsystem exists for.
  const findings = deriveInvariantFindings(
    [{ invariant_key: 'feedback_rls_enabled', ok: true, detail: 'enabled' }],
    BEFORE,
    REGISTER,
  );
  assert.equal(
    findings.filter((f) => f.ruleKey === STALE_EXCEPTION_RULE).length,
    0,
    'silence about an invariant is not evidence that it passes',
  );
});

test('a passing invariant governed by an empty register files nothing stale', () => {
  // The live shape after an exception is retired: the invariant passes and
  // there is no entry left to complain about.
  const findings = deriveInvariantFindings(
    [{ invariant_key: GOVERNED, ok: true, detail: 'all ten policies call is_admin()' }],
    BEFORE,
    [],
  );
  assert.deepEqual(findings, []);
});
