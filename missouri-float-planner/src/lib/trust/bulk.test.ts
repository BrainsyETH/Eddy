import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_MAX_BATCH, describeRefusal, planBulkAction } from './bulk';

test('a group matching what the operator saw is allowed', () => {
  const plan = planBulkAction({ matchedIds: ['a', 'b', 'c'], expectedCount: 3 });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ok && plan.ids, ['a', 'b', 'c']);
});

// ── the guard this module exists for ─────────────────────────────

test('a set that grew since the page rendered is refused', () => {
  // The realistic case is mundane: the hourly tick lands between render and
  // click and raises a 25th finding under the same rule. Resolving 25 when the
  // operator verified 24 would silently close something nobody looked at —
  // which for this system is worse than leaving it open.
  const plan = planBulkAction({ matchedIds: ['a', 'b', 'c', 'd'], expectedCount: 3 });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.ok === false && plan.refusal, {
    reason: 'count_mismatch',
    expected: 3,
    actual: 4,
  });
});

test('a set that shrank is refused too', () => {
  // Someone else resolving two of them is a benign cause, but the operator's
  // verification still no longer describes the set. Cheap to re-check.
  const plan = planBulkAction({ matchedIds: ['a'], expectedCount: 3 });
  assert.equal(plan.ok, false);
  assert.equal(plan.ok === false && plan.refusal.reason, 'count_mismatch');
});

test('an empty match is refused rather than treated as success', () => {
  // Zero rows updated and "done" look identical from the UI otherwise.
  const plan = planBulkAction({ matchedIds: [], expectedCount: 0 });
  assert.equal(plan.ok, false);
  assert.equal(plan.ok === false && plan.refusal.reason, 'empty');
});

test('an oversized batch is refused before the count is even considered', () => {
  // A malformed filter must not be able to close the whole ledger, and the
  // ceiling should not be defeatable by sending a matching expectedCount.
  const ids = Array.from({ length: DEFAULT_MAX_BATCH + 1 }, (_, i) => `f${i}`);
  const plan = planBulkAction({ matchedIds: ids, expectedCount: ids.length });
  assert.equal(plan.ok, false);
  assert.equal(plan.ok === false && plan.refusal.reason, 'too_large');
});

test('duplicate ids are collapsed before counting', () => {
  // A join fanning out would otherwise inflate the count and refuse a
  // legitimate action.
  const plan = planBulkAction({ matchedIds: ['a', 'a', 'b'], expectedCount: 2 });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ok && plan.ids, ['a', 'b']);
});

test('the largest real batch so far is under the ceiling', () => {
  // 24 — every river carrying one false finding from the missing geometry RPC.
  const ids = Array.from({ length: 24 }, (_, i) => `f${i}`);
  assert.equal(planBulkAction({ matchedIds: ids, expectedCount: 24 }).ok, true);
});

// ── the operator has to be able to act on the refusal ────────────

test('every refusal explains what to do about it', () => {
  const messages = [
    describeRefusal({ reason: 'empty' }),
    describeRefusal({ reason: 'too_large', actual: 500, max: 200 }),
    describeRefusal({ reason: 'count_mismatch', expected: 24, actual: 25 }),
  ];
  assert.equal(new Set(messages).size, 3);
  assert.match(messages[2], /24/);
  assert.match(messages[2], /25/);
});
