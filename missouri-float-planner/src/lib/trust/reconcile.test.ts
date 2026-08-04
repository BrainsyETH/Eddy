import assert from 'node:assert/strict';
import test from 'node:test';
import { planReconcile, reconcileAnomalyDetail, type ReconcileInput } from './reconcile';

function reconcile(overrides: Partial<ReconcileInput> = {}) {
  return planReconcile({
    checkStatus: 'ok',
    scopeCount: 13,
    openFingerprints: ['a', 'b'],
    emittedFingerprints: ['a', 'b'],
    ...overrides,
  });
}

// ── ordinary operation ───────────────────────────────────────────

test('a finding that is still emitted is touched, not re-raised', () => {
  const plan = reconcile();
  assert.deepEqual(plan.touch.sort(), ['a', 'b']);
  assert.deepEqual(plan.raise, []);
  assert.deepEqual(plan.resolve, []);
  assert.equal(plan.suppressedReason, undefined);
});

test('a newly emitted fingerprint is raised', () => {
  const plan = reconcile({ emittedFingerprints: ['a', 'b', 'c'] });
  assert.deepEqual(plan.raise, ['c']);
  assert.deepEqual(plan.touch.sort(), ['a', 'b']);
});

test('an open finding that stopped being emitted resolves', () => {
  // This is the whole point of the ledger: it is what proves a fix held.
  const plan = reconcile({ emittedFingerprints: ['a'] });
  assert.deepEqual(plan.resolve, ['b']);
  assert.deepEqual(plan.touch, ['a']);
});

test('a fingerprint that is neither open nor snoozed is raised even if it once resolved', () => {
  // Recurrence after a fix must be visible. The caller upserts on the unique
  // fingerprint, so the original first_seen_at survives and the row shows a
  // problem that came back rather than a brand new one.
  const plan = reconcile({ openFingerprints: [], emittedFingerprints: ['a'] });
  assert.deepEqual(plan.raise, ['a']);
});

// ── the failure mode this module exists to prevent ───────────────

test('a check that threw resolves nothing at all', () => {
  // The regression this guards: a check with a typo'd RPC name emits nothing,
  // which is indistinguishable in the output from "everything is fixed". Left
  // ungated, one broken deploy silently closes every open finding and the
  // console goes green over data nobody checked.
  const plan = reconcile({ checkStatus: 'error', emittedFingerprints: [] });
  assert.deepEqual(plan.resolve, []);
  assert.equal(plan.suppressedReason, 'check_error');
});

test('a failed run does not raise findings either', () => {
  // Half an answer is not an answer. Findings attributed to a run that is on
  // record as having failed would be unattributable evidence.
  const plan = reconcile({ checkStatus: 'error', emittedFingerprints: ['c'] });
  assert.deepEqual(plan.raise, []);
  assert.deepEqual(plan.touch, []);
});

test('examining zero entities is treated as a failure, not a pass', () => {
  // A rivers query returning zero rows, a credential change, the wrong project:
  // all produce an empty findings array over an empty scope. Only scopeCount
  // separates "I looked at 13 rivers and they are fine" from "I looked at
  // nothing".
  const plan = reconcile({ scopeCount: 0, emittedFingerprints: [] });
  assert.deepEqual(plan.resolve, []);
  assert.equal(plan.suppressedReason, 'empty_scope');
});

test('a run that would resolve most of the open set is refused', () => {
  const open = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const plan = reconcile({ openFingerprints: open, emittedFingerprints: ['a'] });
  assert.deepEqual(plan.resolve, []);
  assert.equal(plan.suppressedReason, 'mass_resolve');
});

test('a suppressed mass-resolve still records what the run positively found', () => {
  // Only the disappearances are refused. A disappearance is an assertion about
  // something the run did not mention, and this run has lost the standing to
  // make one — but what it did say is still evidence.
  const open = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const plan = reconcile({ openFingerprints: open, emittedFingerprints: ['a', 'zz'] });
  assert.deepEqual(plan.raise, ['zz']);
  assert.deepEqual(plan.touch, ['a']);
  assert.deepEqual(plan.resolve, []);
});

// ── the mass-resolve threshold is deliberately two conditions ────

test('fixing the only open finding is not a mass resolve', () => {
  // The fraction test alone fires on 1 of 1, which is an ordinary good day and
  // exactly the outcome the ledger is meant to record.
  const plan = reconcile({ openFingerprints: ['a'], emittedFingerprints: [] });
  assert.deepEqual(plan.resolve, ['a']);
  assert.equal(plan.suppressedReason, undefined);
});

test('five resolutions out of five is under the absolute floor and allowed', () => {
  // Small numbers stay legible to a human reading the console; the guard is for
  // the case where the volume itself is the reason to be suspicious.
  const open = ['a', 'b', 'c', 'd', 'e'];
  const plan = reconcile({ openFingerprints: open, emittedFingerprints: [] });
  assert.deepEqual(plan.resolve.sort(), open);
  assert.equal(plan.suppressedReason, undefined);
});

test('a big absolute count that is a small fraction is allowed', () => {
  // The absolute test alone would fire on 6 of 400, which is an ordinary
  // afternoon of fixing access-point snapping.
  const open = Array.from({ length: 400 }, (_, i) => `f${i}`);
  const emitted = open.slice(6);
  const plan = reconcile({ openFingerprints: open, emittedFingerprints: emitted });
  assert.equal(plan.resolve.length, 6);
  assert.equal(plan.suppressedReason, undefined);
});

test('the mass-resolve thresholds are overridable for a noisy check', () => {
  const open = ['a', 'b', 'c', 'd', 'e', 'f'];
  const plan = reconcile({
    openFingerprints: open,
    emittedFingerprints: [],
    massResolveMinAbsolute: 100,
  });
  assert.equal(plan.resolve.length, 6);
  assert.equal(plan.suppressedReason, undefined);
});

// ── snoozing ─────────────────────────────────────────────────────

test('a snoozed finding is never auto-resolved', () => {
  // A snooze is an operator saying "I know, stop telling me" — not "this is
  // fixed". Closing it on the next quiet run would lose the fact that the
  // problem was acknowledged and never repaired.
  const plan = reconcile({
    openFingerprints: [],
    snoozedFingerprints: ['s'],
    emittedFingerprints: [],
  });
  assert.deepEqual(plan.resolve, []);
});

test('a re-emitted snoozed finding is touched, not raised as new', () => {
  const plan = reconcile({
    openFingerprints: [],
    snoozedFingerprints: ['s'],
    emittedFingerprints: ['s'],
  });
  assert.deepEqual(plan.touch, ['s']);
  assert.deepEqual(plan.raise, []);
});

test('snoozed findings do not count toward the mass-resolve fraction', () => {
  // Otherwise snoozing a batch would make the next ordinary run look like a
  // mass resolve and suppress a legitimate one.
  const plan = reconcile({
    openFingerprints: ['a'],
    snoozedFingerprints: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'],
    emittedFingerprints: [],
  });
  assert.deepEqual(plan.resolve, ['a']);
  assert.equal(plan.suppressedReason, undefined);
});

// ── the operator-facing explanation ──────────────────────────────

test('every suppression reason produces a distinct explanation', () => {
  // A refusal that only reached the logs would be a monitoring gap of exactly
  // the kind this module exists to prevent, so it has to be sayable.
  const counts = { openCount: 10, wouldResolve: 9, scopeCount: 13 };
  const reasons = ['check_error', 'empty_scope', 'mass_resolve'] as const;
  const messages = reasons.map((r) => reconcileAnomalyDetail('validate_river_data', r, counts));

  assert.equal(new Set(messages).size, 3);
  for (const m of messages) assert.match(m, /validate_river_data/);
  assert.match(messages[2], /9 of 10/);
});
