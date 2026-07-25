import assert from 'node:assert/strict';
import test from 'node:test';
import { isEntitlementActive } from './entitlement';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const FUTURE = '2027-01-01T00:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';

test('access is derived from expires_at, not a stored flag', () => {
  assert.equal(isEntitlementActive({ expires_at: FUTURE }, { now: NOW }), true);
  assert.equal(isEntitlementActive({ expires_at: PAST }, { now: NOW }), false);
});

test('a missing or malformed expiry is never active', () => {
  assert.equal(isEntitlementActive(null, { now: NOW }), false);
  assert.equal(isEntitlementActive(undefined, { now: NOW }), false);
  assert.equal(isEntitlementActive({ expires_at: null }, { now: NOW }), false);
  assert.equal(isEntitlementActive({ expires_at: 'not-a-date' }, { now: NOW }), false);
});

test('a cancelled-but-paid-through subscription still has access', () => {
  // will_renew=false must NOT revoke early — the user paid for the period.
  assert.equal(isEntitlementActive({ expires_at: FUTURE, will_renew: false }, { now: NOW }), true);
});

test('a billing issue inside the grace period still has access', () => {
  assert.equal(
    isEntitlementActive(
      { expires_at: FUTURE, billing_issue_detected_at: '2026-07-20T00:00:00.000Z' },
      { now: NOW }
    ),
    true
  );
});

// ── sandbox gating (single Supabase project serves web + iOS) ────

test('sandbox entitlements are ignored unless explicitly allowed', () => {
  const sandbox = { expires_at: FUTURE, environment: 'SANDBOX' };
  assert.equal(isEntitlementActive(sandbox, { now: NOW, allowSandbox: false }), false);
  assert.equal(isEntitlementActive(sandbox, { now: NOW, allowSandbox: true }), true);
});

test('production entitlements are unaffected by the sandbox flag', () => {
  const prod = { expires_at: FUTURE, environment: 'PRODUCTION' };
  assert.equal(isEntitlementActive(prod, { now: NOW, allowSandbox: false }), true);
});

test('rows with no recorded environment are treated as production', () => {
  assert.equal(isEntitlementActive({ expires_at: FUTURE }, { now: NOW, allowSandbox: false }), true);
});

test('an expired sandbox entitlement is inactive even when sandbox is allowed', () => {
  assert.equal(
    isEntitlementActive({ expires_at: PAST, environment: 'SANDBOX' }, { now: NOW, allowSandbox: true }),
    false
  );
});
