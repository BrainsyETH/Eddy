import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeEntitlementPatch,
  entitlementIdsFor,
  eventTimestamp,
  toSupabaseUserId,
  type RevenueCatEvent,
} from './events';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const USER = '3f4b2c1a-8d9e-4f0a-b1c2-d3e4f5a6b7c8';

function event(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt_1',
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    product_id: 'eddy_plus_annual',
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    event_timestamp_ms: NOW.getTime(),
    expiration_at_ms: new Date('2027-07-25T12:00:00.000Z').getTime(),
    ...overrides,
  };
}

// ── appUserID mapping ────────────────────────────────────────────

test('accepts a Supabase uuid as the app user id', () => {
  assert.equal(toSupabaseUserId(USER), USER);
  assert.equal(toSupabaseUserId(`  ${USER.toUpperCase()}  `), USER);
});

test('rejects RevenueCat anonymous ids so entitlements never attach to them', () => {
  assert.equal(toSupabaseUserId('$RCAnonymousID:8f9a0b1c'), null);
  assert.equal(toSupabaseUserId(''), null);
  assert.equal(toSupabaseUserId(undefined), null);
});

// ── active states ────────────────────────────────────────────────

test('initial purchase grants access until the store expiry and clears billing issues', () => {
  const patch = computeEntitlementPatch(event(), NOW);
  assert.equal(patch?.expires_at, '2027-07-25T12:00:00.000Z');
  assert.equal(patch?.will_renew, true);
  assert.equal(patch?.billing_issue_detected_at, null);
  assert.equal(patch?.environment, 'PRODUCTION');
});

test('renewal extends the expiry', () => {
  const patch = computeEntitlementPatch(
    event({ type: 'RENEWAL', expiration_at_ms: new Date('2028-07-25T12:00:00.000Z').getTime() }),
    NOW
  );
  assert.equal(patch?.expires_at, '2028-07-25T12:00:00.000Z');
  assert.equal(patch?.will_renew, true);
});

test('a non-renewing purchase (Season Pass) grants access without renewal', () => {
  const patch = computeEntitlementPatch(event({ type: 'NON_RENEWING_PURCHASE' }), NOW);
  assert.equal(patch?.will_renew, false);
  assert.equal(patch?.expires_at, '2027-07-25T12:00:00.000Z');
});

// ── cancellation / expiry / refunds ──────────────────────────────

test('cancellation keeps paid-through access and only stops renewal', () => {
  const patch = computeEntitlementPatch(event({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }), NOW);
  assert.equal(patch?.will_renew, false);
  // Crucially does NOT touch expires_at — the user paid through the period.
  assert.equal(patch?.expires_at, undefined);
});

test('a support-issued refund revokes access immediately', () => {
  const patch = computeEntitlementPatch(
    event({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }),
    NOW
  );
  assert.equal(patch?.expires_at, NOW.toISOString());
  assert.equal(patch?.will_renew, false);
});

test('expiration ends access', () => {
  const patch = computeEntitlementPatch(
    event({ type: 'EXPIRATION', expiration_at_ms: new Date('2026-07-20T00:00:00.000Z').getTime() }),
    NOW
  );
  assert.equal(patch?.expires_at, '2026-07-20T00:00:00.000Z');
  assert.equal(patch?.will_renew, false);
});

test('expiration with no store expiry falls back to the event time', () => {
  const patch = computeEntitlementPatch(event({ type: 'EXPIRATION', expiration_at_ms: null }), NOW);
  assert.equal(patch?.expires_at, NOW.toISOString());
});

// ── billing issues / grace ───────────────────────────────────────

test('a billing issue does not revoke access when no grace date is sent', () => {
  const patch = computeEntitlementPatch(
    event({ type: 'BILLING_ISSUE', expiration_at_ms: null }),
    NOW
  );
  // undefined = leave the existing expiry alone; EXPIRATION revokes later.
  assert.equal(patch?.expires_at, undefined);
  assert.equal(patch?.billing_issue_detected_at, NOW.toISOString());
});

test('a billing issue extends access to the grace-period end when provided', () => {
  const patch = computeEntitlementPatch(
    event({
      type: 'BILLING_ISSUE',
      grace_period_expiration_at_ms: new Date('2026-08-10T00:00:00.000Z').getTime(),
    }),
    NOW
  );
  assert.equal(patch?.expires_at, '2026-08-10T00:00:00.000Z');
});

// ── misc ─────────────────────────────────────────────────────────

test('unknown event types produce no patch', () => {
  assert.equal(computeEntitlementPatch(event({ type: 'SUBSCRIBER_ALIAS' }), NOW), null);
  assert.equal(computeEntitlementPatch(event({ type: 'TRANSFER' }), NOW), null);
});

test('sandbox events are tagged so read-time gating can ignore them', () => {
  const patch = computeEntitlementPatch(event({ environment: 'sandbox' }), NOW);
  assert.equal(patch?.environment, 'SANDBOX');
});

test('entitlement ids fall back to the Eddy Premium default', () => {
  assert.deepEqual(entitlementIdsFor(event({ entitlement_ids: null }), 'eddy_plus'), ['eddy_plus']);
  assert.deepEqual(entitlementIdsFor(event({ entitlement_ids: ['a', 'b', 'a'] }), 'eddy_plus'), ['a', 'b']);
  assert.deepEqual(entitlementIdsFor(event({ entitlement_ids: [], entitlement_id: 'legacy' }), 'eddy_plus'), [
    'legacy',
  ]);
});

test('event timestamp falls back to now when the store omits it', () => {
  assert.equal(eventTimestamp(event({ event_timestamp_ms: null }), NOW), NOW.toISOString());
  assert.equal(eventTimestamp(event(), NOW), NOW.toISOString());
});
