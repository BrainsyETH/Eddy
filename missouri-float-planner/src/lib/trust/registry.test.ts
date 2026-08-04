import assert from 'node:assert/strict';
import test from 'node:test';
import { TRUST_CHECKS, isCheckDue, orderByStaleness } from './registry';
import { ALL_TRUST_RULES, isRuleClassified } from './severity';

const NOW = new Date('2026-08-04T12:00:00Z');
const HOUR = 60 * 60 * 1000;

// ── the registry itself ──────────────────────────────────────────

test('check ids are unique', () => {
  // The id is stored on every run and finding row; two checks sharing one would
  // reconcile against each other's findings and resolve them.
  const ids = TRUST_CHECKS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every registered check has a cadence the tick understands', () => {
  for (const check of TRUST_CHECKS) {
    assert.equal(['hourly', 'daily'].includes(check.cadence), true, `${check.id}`);
  }
});

test('the rule catalogue stays classified', () => {
  // Belt and braces with severity.test.ts: that file asserts the map is
  // complete, this one asserts nothing reaches the registry unclassified.
  for (const rule of ALL_TRUST_RULES) {
    assert.equal(isRuleClassified(rule), true, `${rule} is unclassified`);
  }
});

// ── cadence ──────────────────────────────────────────────────────

test('a check that has never run is due', () => {
  assert.equal(
    isCheckDue({ check: { id: 'x', cadence: 'daily' }, lastStartedAt: null, now: NOW }),
    true,
  );
});

test('an hourly check just run is not due', () => {
  assert.equal(
    isCheckDue({
      check: { id: 'x', cadence: 'hourly' },
      lastStartedAt: new Date(NOW.getTime() - 5 * 60 * 1000),
      now: NOW,
    }),
    false,
  );
});

test('an hourly check is due a few minutes early', () => {
  // The tick fires hourly and cron times drift. An exact comparison would skip
  // a check whose last run was 59 minutes ago and defer it a full extra hour,
  // silently halving the cadence.
  assert.equal(
    isCheckDue({
      check: { id: 'x', cadence: 'hourly' },
      lastStartedAt: new Date(NOW.getTime() - 55 * 60 * 1000),
      now: NOW,
    }),
    true,
  );
});

test('the early-run slack does not let a daily check run twice in a day', () => {
  assert.equal(
    isCheckDue({
      check: { id: 'x', cadence: 'daily' },
      lastStartedAt: new Date(NOW.getTime() - 12 * HOUR),
      now: NOW,
    }),
    false,
  );
  assert.equal(
    isCheckDue({
      check: { id: 'x', cadence: 'daily' },
      lastStartedAt: new Date(NOW.getTime() - 23 * HOUR),
      now: NOW,
    }),
    true,
  );
});

// ── the cursor ───────────────────────────────────────────────────

test('least-recently-run sorts first', () => {
  // This ordering IS the cursor, the way .order('last_synced_at') is in
  // src/lib/camping/sync.ts. Without it, a slow check at the head of a static
  // list would consume the budget every tick and starve everything behind it.
  const checks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const last = new Map<string, Date | null>([
    ['a', new Date(NOW.getTime() - 1 * HOUR)],
    ['b', new Date(NOW.getTime() - 9 * HOUR)],
    ['c', null],
  ]);

  assert.deepEqual(
    orderByStaleness(checks, last).map((c) => c.id),
    ['c', 'b', 'a'],
  );
});

test('checks that have never run come before any that have', () => {
  const checks = [{ id: 'ran' }, { id: 'never' }];
  const last = new Map<string, Date | null>([
    ['ran', new Date(NOW.getTime() - 100 * HOUR)],
    ['never', null],
  ]);
  assert.equal(orderByStaleness(checks, last)[0].id, 'never');
});

test('ties break on id so the order is stable across ticks', () => {
  const checks = [{ id: 'z' }, { id: 'a' }];
  const last = new Map<string, Date | null>([['z', null], ['a', null]]);
  assert.deepEqual(
    orderByStaleness(checks, last).map((c) => c.id),
    ['a', 'z'],
  );
});
