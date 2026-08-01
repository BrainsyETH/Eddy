import assert from 'node:assert/strict';
import test from 'node:test';
import { isEntitlementActive, sandboxEntitlementsAllowed } from './entitlement';

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

// ── The default, which is what App Review actually exercises ────────────────
//
// Every test above passes allowSandbox explicitly, so none of them covered the
// value used in production. That gap is the whole reason the old default
// survived: a sandbox purchase unlocking nothing was the documented, tested
// behaviour of the flag, and untested behaviour of the app.

test('sandbox entitlements are honoured unless explicitly denied', () => {
  const prior = process.env.DENY_SANDBOX_ENTITLEMENTS;
  try {
    delete process.env.DENY_SANDBOX_ENTITLEMENTS;
    assert.equal(sandboxEntitlementsAllowed(), true);

    // Not opt-in any more: absence of the old ALLOW flag must not deny.
    delete process.env.ALLOW_SANDBOX_ENTITLEMENTS;
    assert.equal(sandboxEntitlementsAllowed(), true);

    process.env.DENY_SANDBOX_ENTITLEMENTS = 'true';
    assert.equal(sandboxEntitlementsAllowed(), false);

    // Only the exact string denies; a stray value must not silently lock the
    // paid product for everyone who bought it.
    process.env.DENY_SANDBOX_ENTITLEMENTS = 'false';
    assert.equal(sandboxEntitlementsAllowed(), true);
    process.env.DENY_SANDBOX_ENTITLEMENTS = '1';
    assert.equal(sandboxEntitlementsAllowed(), true);
  } finally {
    if (prior === undefined) delete process.env.DENY_SANDBOX_ENTITLEMENTS;
    else process.env.DENY_SANDBOX_ENTITLEMENTS = prior;
  }
});

test("a reviewer's sandbox purchase unlocks with no flag set", () => {
  const prior = process.env.DENY_SANDBOX_ENTITLEMENTS;
  try {
    delete process.env.DENY_SANDBOX_ENTITLEMENTS;
    // No allowSandbox override — exactly what /api/me/profile does in production.
    assert.equal(
      isEntitlementActive({ expires_at: FUTURE, environment: 'SANDBOX' }, { now: NOW }),
      true,
    );
  } finally {
    if (prior === undefined) delete process.env.DENY_SANDBOX_ENTITLEMENTS;
    else process.env.DENY_SANDBOX_ENTITLEMENTS = prior;
  }
});

test('an expired sandbox entitlement is still expired', () => {
  const prior = process.env.DENY_SANDBOX_ENTITLEMENTS;
  try {
    delete process.env.DENY_SANDBOX_ENTITLEMENTS;
    assert.equal(
      isEntitlementActive({ expires_at: PAST, environment: 'SANDBOX' }, { now: NOW }),
      false,
    );
  } finally {
    if (prior === undefined) delete process.env.DENY_SANDBOX_ENTITLEMENTS;
    else process.env.DENY_SANDBOX_ENTITLEMENTS = prior;
  }
});
