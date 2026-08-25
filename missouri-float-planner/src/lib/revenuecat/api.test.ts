// src/lib/revenuecat/api.test.ts
// The RevenueCat REST pull: mapping a subscriber payload onto an entitlement
// row, and the guard that keeps the pull from ever revoking anything.
//
// This path exists because a webhook stream cannot recover state it was never
// sent (see api.ts). It is also the path with the least production traffic —
// transfers are rare and impossible to trigger by hand in sandbox — so what it
// gets is unit tests, and they carry the weight.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchSubscriber,
  reconcileEntitlement,
  subscriberEntitlementPatch,
} from './api';

const ENTITLEMENT = 'eddy_premium';
const USER = '0814306a-1c4b-4acd-968e-31e3034a3978';

/** A v1 subscriber holding a live annual sub, shaped as RevenueCat sends it. */
function subscriber(overrides: Record<string, unknown> = {}) {
  return {
    original_app_user_id: USER,
    entitlements: {
      [ENTITLEMENT]: {
        expires_date: '2027-08-14T01:44:04Z',
        product_identifier: 'eddy_annual',
        purchase_date: '2026-08-14T01:44:04Z',
      },
    },
    subscriptions: {
      eddy_annual: {
        expires_date: '2027-08-14T01:44:04Z',
        store: 'app_store',
        is_sandbox: false,
        unsubscribe_detected_at: null,
        billing_issues_detected_at: null,
      },
    },
    ...overrides,
  };
}

// ── Payload → entitlement row ────────────────────────────────────

test('maps a live subscription onto the columns the webhook writes', () => {
  const patch = subscriberEntitlementPatch(subscriber(), ENTITLEMENT);

  assert.equal(patch?.expires_at, '2027-08-14T01:44:04.000Z');
  assert.equal(patch?.product_id, 'eddy_annual');
  assert.equal(patch?.will_renew, true);
  assert.equal(patch?.billing_issue_detected_at, null);
});

test('store is upper-cased to match what webhook events write', () => {
  // The REST API says app_store, events say APP_STORE, and both write the same
  // column — so the same subscription would otherwise read as two stores.
  assert.equal(subscriberEntitlementPatch(subscriber(), ENTITLEMENT)?.store, 'APP_STORE');
});

test('is_sandbox becomes the environment the CHECK constraint allows', () => {
  const sandbox = subscriber({
    subscriptions: {
      eddy_annual: { store: 'app_store', is_sandbox: true, unsubscribe_detected_at: null },
    },
  });
  assert.equal(subscriberEntitlementPatch(sandbox, ENTITLEMENT)?.environment, 'SANDBOX');
  assert.equal(subscriberEntitlementPatch(subscriber(), ENTITLEMENT)?.environment, 'PRODUCTION');
});

test('a cancelled-but-paid-through subscription still restores, not renewing', () => {
  // Auto-renew off is NOT expiry: they keep access until the period ends, and a
  // restore has to bring that remaining time back.
  const cancelled = subscriber({
    subscriptions: {
      eddy_annual: {
        store: 'app_store',
        is_sandbox: false,
        unsubscribe_detected_at: '2026-08-20T00:00:00Z',
      },
    },
  });
  const patch = subscriberEntitlementPatch(cancelled, ENTITLEMENT);
  assert.equal(patch?.will_renew, false);
  assert.equal(patch?.expires_at, '2027-08-14T01:44:04.000Z');
});

test('a billing issue is carried across rather than dropped', () => {
  const billing = subscriber({
    subscriptions: {
      eddy_annual: {
        store: 'app_store',
        is_sandbox: false,
        unsubscribe_detected_at: null,
        billing_issues_detected_at: '2026-08-24T12:00:00Z',
      },
    },
  });
  assert.equal(
    subscriberEntitlementPatch(billing, ENTITLEMENT)?.billing_issue_detected_at,
    '2026-08-24T12:00:00.000Z',
  );
});

test('an unknown or absent entitlement writes nothing', () => {
  assert.equal(subscriberEntitlementPatch(subscriber(), 'something_else'), null);
  assert.equal(subscriberEntitlementPatch({ entitlements: {} }, ENTITLEMENT), null);
  assert.equal(subscriberEntitlementPatch(null, ENTITLEMENT), null);
});

test('a non-expiring entitlement writes nothing rather than a guessed date', () => {
  // Access is stated purely as expires_at, so there is no honest way to record
  // a lifetime grant — and Eddy sells none. Inventing a date either strands the
  // buyer or hands out free years.
  const lifetime = subscriber({
    entitlements: { [ENTITLEMENT]: { expires_date: null, product_identifier: 'eddy_lifetime' } },
  });
  assert.equal(subscriberEntitlementPatch(lifetime, ENTITLEMENT), null);
});

// ── Fetch ────────────────────────────────────────────────────────

test('a missing secret key is reported as unconfigured, not as an error', () => {
  return fetchSubscriber(USER, { apiKey: null }).then((result) => {
    assert.equal(result.status, 'not_configured');
  });
});

test('the subscriber is requested with the secret key and no cache', async () => {
  let seenUrl = '';
  let seenAuth = '';
  let seenCache: string | undefined;

  const result = await fetchSubscriber(USER, {
    apiKey: 'sk_test',
    fetchImpl: (async (url: string, init: RequestInit & { cache?: string }) => {
      seenUrl = String(url);
      seenAuth = String((init.headers as Record<string, string>).Authorization);
      seenCache = init.cache;
      return new Response(JSON.stringify({ subscriber: subscriber() }), { status: 200 });
    }) as unknown as typeof fetch,
  });

  assert.equal(result.status, 'ok');
  assert.equal(seenUrl, `https://api.revenuecat.com/v1/subscribers/${USER}`);
  assert.equal(seenAuth, 'Bearer sk_test');
  // Next patches global fetch with a Data Cache keyed on method+URL, and this
  // URL is stable per user — a cached answer is a stale entitlement.
  assert.equal(seenCache, 'no-store');
});

test('RevenueCat being down is an error, not an absent subscription', async () => {
  const result = await fetchSubscriber(USER, {
    apiKey: 'sk_test',
    fetchImpl: (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch,
  });
  // 'none' would mean "they own nothing", which would let a caller conclude a
  // live subscription does not exist because a socket dropped.
  assert.equal(result.status, 'error');
});

test('an unknown subscriber is reported as owning nothing', async () => {
  const result = await fetchSubscriber(USER, {
    apiKey: 'sk_test',
    fetchImpl: (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch,
  });
  assert.equal(result.status, 'not_found');
});

// ── Reconcile ────────────────────────────────────────────────────

/** Minimal stand-in for the service-role client, recording what it was asked. */
function fakeAdmin(existing: { expires_at: string } | null) {
  const upserts: Record<string, unknown>[] = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { maybeSingle: async () => ({ data: existing, error: null }) };
                },
              };
            },
          };
        },
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        },
      };
    },
  };
  return { client, upserts };
}

function okFetch() {
  return (async () =>
    new Response(JSON.stringify({ subscriber: subscriber() }), {
      status: 200,
    })) as unknown as typeof fetch;
}

test('a transferred subscription is written onto an account with no row', async () => {
  // The whole point: the buying account was deleted, its row cascaded away, and
  // the TRANSFER event carries no state to rebuild it from.
  const { client, upserts } = fakeAdmin(null);

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  assert.equal(outcome.status, 'granted');
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].user_id, USER);
  assert.equal(upserts[0].entitlement_id, ENTITLEMENT);
  assert.equal(upserts[0].expires_at, '2027-08-14T01:44:04.000Z');
  assert.equal(upserts[0].rc_app_user_id, USER);
});

test('a reconcile can never move an entitlement backwards', async () => {
  // A reconcile racing a fresh RENEWAL, or reading a replica a second behind,
  // must not walk a subscriber back to an expiry they have already passed.
  // This is what makes the endpoint safe to hand to the app.
  const { client, upserts } = fakeAdmin({ expires_at: '2028-01-01T00:00:00.000Z' });

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  assert.equal(outcome.status, 'current');
  assert.equal(upserts.length, 0);
});

test('an expired row is extended when RevenueCat reports a later expiry', async () => {
  const { client, upserts } = fakeAdmin({ expires_at: '2026-01-01T00:00:00.000Z' });

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  assert.equal(outcome.status, 'granted');
  assert.equal(upserts.length, 1);
});

test('webhook provenance is stamped when a webhook triggered the reconcile', async () => {
  const { client, upserts } = fakeAdmin(null);

  await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
    stamp: { id: 'evt_transfer_1', type: 'TRANSFER', at: '2026-08-24T20:32:00.000Z' },
  });

  assert.equal(upserts[0].last_event_id, 'evt_transfer_1');
  assert.equal(upserts[0].last_event_type, 'TRANSFER');
  assert.equal(upserts[0].last_event_at, '2026-08-24T20:32:00.000Z');
});

test('without the secret key nothing is written and the caller is told why', async () => {
  const { client, upserts } = fakeAdmin(null);

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: null,
  });

  // Distinct from 'none': the difference is "they own nothing" versus "we did
  // not look", and only one of those is worth alerting a deployment about.
  assert.equal(outcome.status, 'not_configured');
  assert.equal(upserts.length, 0);
});

test('a RevenueCat outage never writes and never claims an absence', async () => {
  const { client, upserts } = fakeAdmin(null);

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: (async () => {
      throw new Error('ETIMEDOUT');
    }) as unknown as typeof fetch,
  });

  assert.equal(outcome.status, 'error');
  assert.equal(upserts.length, 0);
});
