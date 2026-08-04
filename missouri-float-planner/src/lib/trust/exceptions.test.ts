import assert from 'node:assert/strict';
import test from 'node:test';
import { exceptionFor, SCHEMA_EXCEPTIONS } from './exceptions';
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

test('an exception expires at the end of its stated day, not the start', () => {
  const e = SCHEMA_EXCEPTIONS[0];
  assert.equal(exceptionFor(e.invariantKey, new Date(`${e.expires}T00:00:00Z`)).kind, 'active');
  assert.equal(exceptionFor(e.invariantKey, new Date(`${e.expires}T12:00:00Z`)).kind, 'active');
  // An off-by-one here would wake findings a day early and teach the operator
  // that the dates are approximate.
  const dayAfter = new Date(`${e.expires}T23:59:59.999Z`).getTime() + 1;
  assert.equal(exceptionFor(e.invariantKey, new Date(dayAfter)).kind, 'expired');
});

test('an invariant with no exception has no verdict', () => {
  assert.equal(exceptionFor('feedback_rls_enabled', new Date('2026-08-04')).kind, 'none');
});

// ── what the ledger does with it ─────────────────────────────────

const GOVERNED = SCHEMA_EXCEPTIONS[0].invariantKey;
const BEFORE = new Date(`${SCHEMA_EXCEPTIONS[0].expires}T00:00:00Z`);
const AFTER = new Date(new Date(`${SCHEMA_EXCEPTIONS[0].expires}T23:59:59.999Z`).getTime() + 86_400_000);

function failing(key: string) {
  return [{ invariant_key: key, ok: false, detail: 'ten policies inline the user_roles lookup' }];
}

test('a governed failure is filed snoozed to the expiry, not open', () => {
  const [finding] = deriveInvariantFindings(failing(GOVERNED), BEFORE);
  assert.ok(finding.snoozeUntil, 'a live exception must pre-triage the finding');
  assert.equal(new Date(finding.snoozeUntil!).toISOString().slice(0, 10), SCHEMA_EXCEPTIONS[0].expires);
  assert.match(finding.title, /accepted until/);
  assert.match(finding.detail, /BrainsyETH/);
  // Severity is untouched. A snooze says "somebody looked", not "it matters
  // less" — downgrading it would lose the reason the exception was needed.
  assert.equal(severityForRule(finding.ruleKey), 'high');
});

test('a lapsed exception wakes the finding and names who accepted it', () => {
  const [finding] = deriveInvariantFindings(failing(GOVERNED), AFTER);
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
  const governed = deriveInvariantFindings(failing(GOVERNED), BEFORE)[0];
  const lapsed = deriveInvariantFindings(failing(GOVERNED), AFTER)[0];

  assert.equal(governed.entityType, lapsed.entityType);
  assert.equal(governed.entityKey, lapsed.entityKey);
  assert.equal(governed.ruleKey, lapsed.ruleKey);
});

test('an ungoverned failure is an ordinary open finding', () => {
  const [finding] = deriveInvariantFindings(
    [{ invariant_key: 'feedback_rls_enabled', ok: false, detail: 'RLS is DISABLED' }],
    BEFORE,
  );
  assert.equal(finding.snoozeUntil, undefined);
  assert.doesNotMatch(finding.title, /accepted|EXPIRED/);
});

// ── the register is itself checked ───────────────────────────────

test('an exception for an invariant that now passes is reported as stale', () => {
  const findings = deriveInvariantFindings(
    [{ invariant_key: GOVERNED, ok: true, detail: 'all ten policies call is_admin()' }],
    BEFORE,
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
  );
  assert.deepEqual(findings, []);
});

test('an exception is not judged stale by a run that never asserted its invariant', () => {
  // Guessing from a run that may itself be broken is how a check starts
  // reporting on things it cannot see — the failure this subsystem exists for.
  const findings = deriveInvariantFindings(
    [{ invariant_key: 'feedback_rls_enabled', ok: true, detail: 'enabled' }],
    BEFORE,
  );
  assert.equal(
    findings.filter((f) => f.ruleKey === STALE_EXCEPTION_RULE).length,
    0,
    'silence about an invariant is not evidence that it passes',
  );
});
