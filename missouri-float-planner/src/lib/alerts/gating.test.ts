import assert from 'node:assert/strict';
import test from 'node:test';
import { isRuleLive, parentIdsOf } from './gating';

// The two passes that import this decide, minutes apart, whether a rule may
// produce an outbox row and whether that row may become a notification. A
// disagreement between them is invisible from the outside — a paused alert that
// buzzes, or a live one that does not — so the predicate is pinned here.

test('an ordinary rule with no parent is live', () => {
  assert.equal(isRuleLive({ enabled: true, parent_subscription_id: null }, new Set()), true);
  // The column is optional on the interface: a caller that has not selected it
  // must not accidentally gate everything.
  assert.equal(isRuleLive({ enabled: true }, new Set()), true);
});

test('the rule’s own pause still wins', () => {
  assert.equal(isRuleLive({ enabled: false, parent_subscription_id: null }, new Set()), false);
  assert.equal(isRuleLive({ enabled: false, parent_subscription_id: 'sub-1' }, new Set()), false);
});

test('a paused parent gates a rule that is itself enabled', () => {
  // THE POINT. The child's own enabled stays true — nothing writes to it — so
  // resuming the parent restores it with no memory of any kind.
  assert.equal(
    isRuleLive({ enabled: true, parent_subscription_id: 'sub-1' }, new Set(['sub-1'])),
    false,
  );
});

test('a live parent does not gate', () => {
  assert.equal(
    isRuleLive({ enabled: true, parent_subscription_id: 'sub-1' }, new Set(['sub-2'])),
    true,
  );
});

test('an unknown parent fails OPEN', () => {
  // A parent the caller could not look up — a short query, a row deleted
  // mid-pass. Withholding somebody's flood warning because a second SELECT
  // hiccupped is the worse of the two failures, and every rule here was asked
  // for explicitly by the person who would not be told.
  assert.equal(
    isRuleLive({ enabled: true, parent_subscription_id: 'sub-gone' }, new Set()),
    true,
  );
});

test('parentIdsOf is deduped and skips the unparented', () => {
  assert.deepEqual(
    parentIdsOf([
      { enabled: true, parent_subscription_id: 'sub-1' },
      { enabled: false, parent_subscription_id: 'sub-1' },
      { enabled: true, parent_subscription_id: null },
      { enabled: true },
      { enabled: true, parent_subscription_id: 'sub-2' },
    ]),
    ['sub-1', 'sub-2'],
  );
});

test('parentIdsOf returns empty when nothing is parented, so callers can skip the query', () => {
  assert.deepEqual(parentIdsOf([{ enabled: true }, { enabled: true, parent_subscription_id: null }]), []);
});
