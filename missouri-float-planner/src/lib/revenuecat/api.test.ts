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
import { readFileSync } from 'node:fs';
import {
  fetchSubscriber,
  reconcileEntitlement,
  RECONCILE_RPC,
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

/**
 * Stand-in for the service-role client, recording every RPC it was asked for.
 *
 * `result` is what public.reconcile_entitlement() answered — the forward-only
 * decision is the FUNCTION's, not this module's, which is the point of the
 * migration. So these tests check that the call carries the right arguments and
 * that each answer is reported honestly; the guarantee itself is SQL.
 */
function fakeAdmin(result: string | null, error: { message: string } | null = null) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, ...args });
      return { data: result, error };
    },
  };
  return { client, calls };
}

function okFetch() {
  return (async () =>
    new Response(JSON.stringify({ subscriber: subscriber() }), {
      status: 200,
    })) as unknown as typeof fetch;
}

test('a transferred subscription is handed to the forward-only writer', async () => {
  // The whole point: the buying account was deleted, its row cascaded away, and
  // the TRANSFER event carries no state to rebuild it from.
  const { client, calls } = fakeAdmin('granted');

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  assert.equal(outcome.status, 'granted');
  assert.equal(outcome.expiresAt, '2027-08-14T01:44:04.000Z');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, RECONCILE_RPC);
  assert.equal(calls[0].p_user_id, USER);
  assert.equal(calls[0].p_entitlement_id, ENTITLEMENT);
  assert.equal(calls[0].p_expires_at, '2027-08-14T01:44:04.000Z');
  assert.equal(calls[0].p_will_renew, true);
  assert.equal(calls[0].p_environment, 'PRODUCTION');
});

test('the compare-and-write is one statement, not a read then an upsert', () => {
  // A RENEWAL landing between a client-side read and its write is silently
  // overwritten by the older expiry — the exact revocation the forward-only
  // rule forbids, on a live subscriber, reported as success. The guarantee has
  // to hold under concurrency, so it lives under the row lock.
  const source = readFileSync('src/lib/revenuecat/api.ts', 'utf8');
  assert.doesNotMatch(source, /\.upsert\(/);

  const migration = readFileSync(
    'supabase/migrations/20260902125655_reconcile_entitlement_can_only_move_forward.sql',
    'utf8',
  );
  assert.match(migration, /on conflict \(user_id, entitlement_id\) do update/);
  assert.match(migration, /where e\.expires_at is null or e\.expires_at < excluded\.expires_at/);
  // PostgREST exposes every public function as an RPC, so the grants are the
  // access control on a SECURITY DEFINER writer of a table with no write policy.
  assert.match(migration, /revoke all on function public\.reconcile_entitlement/);
  assert.match(migration, /from public, anon, authenticated/);

  // The function that is LIVE is the one 20260902132840 defines: the same
  // forward-only clause, plus a refusal to move a row forward from a snapshot
  // older than the row's newest event — which closes the refund race the
  // first version left open. It replaces by DROP, because a new signature
  // under CREATE OR REPLACE is a second overload, not a replacement.
  const live = readFileSync(
    'supabase/migrations/20260902132840_a_reconcile_defers_to_a_newer_event.sql',
    'utf8',
  );
  assert.match(live, /drop function if exists public\.reconcile_entitlement\(/);
  assert.match(live, /where \(e\.expires_at is null or e\.expires_at < excluded\.expires_at\)/);
  assert.match(
    live,
    /and \(p_observed_at is null or e\.last_event_at is null or e\.last_event_at <= p_observed_at\)/,
  );
  assert.match(live, /revoke all on function public\.reconcile_entitlement/);
  assert.match(live, /to service_role/);
});

test('the reconcile tells the function when its snapshot was taken', async () => {
  // Taken BEFORE the REST read, so the refusal covers the whole round trip: a
  // refund whose webhook lands while the read is in flight stamps the row
  // with an event later than this, and the function keeps the row.
  const { client, calls } = fakeAdmin('granted');
  const before = Date.now();
  let readAt = 0;
  await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: async (...args: Parameters<typeof fetch>) => {
      readAt = Date.now();
      return okFetch()(...args);
    },
  });
  const observed = Date.parse(String(calls[0].p_observed_at));
  assert.ok(Number.isFinite(observed), 'p_observed_at must be an ISO timestamp');
  assert.ok(observed >= before && observed <= readAt, 'p_observed_at must predate the REST read');
});

test('already-current is reported as a no-op, not as a write', async () => {
  const { client } = fakeAdmin('current');

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  // The app tells "already correct" from "just fixed" by this, so reporting a
  // no-op as a refresh would let it claim it fixed something every time.
  assert.equal(outcome.status, 'current');
});

test('a deleted target account is reported as unknown, not retried forever', async () => {
  const { client } = fakeAdmin('unknown_user');

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  assert.equal(outcome.status, 'unknown_user');
});

test('webhook provenance is stamped when a webhook triggered the reconcile', async () => {
  const { client, calls } = fakeAdmin('granted');

  await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
    stamp: { id: 'evt_transfer_1', type: 'TRANSFER', at: '2026-08-24T20:32:00.000Z' },
  });

  assert.equal(calls[0].p_last_event_id, 'evt_transfer_1');
  assert.equal(calls[0].p_last_event_type, 'TRANSFER');
  assert.equal(calls[0].p_last_event_at, '2026-08-24T20:32:00.000Z');
});

test('without the secret key nothing is written and the caller is told why', async () => {
  const { client, calls } = fakeAdmin('granted');

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: null,
  });

  // Distinct from 'none': the difference is "they own nothing" versus "we did
  // not look", and only one of those is worth alerting a deployment about.
  assert.equal(outcome.status, 'not_configured');
  assert.equal(calls.length, 0);
});

test('a RevenueCat outage never writes and never claims an absence', async () => {
  const { client, calls } = fakeAdmin('granted');

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: (async () => {
      throw new Error('ETIMEDOUT');
    }) as unknown as typeof fetch,
  });

  assert.equal(outcome.status, 'error');
  assert.equal(calls.length, 0);
});

test('a database failure is an error, so the webhook can ask for a retry', async () => {
  // Includes the function not existing yet — a deploy that ran ahead of its
  // migration. Swallowing it would drop a live entitlement on the floor.
  const { client } = fakeAdmin(null, { message: 'function does not exist' });

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  assert.equal(outcome.status, 'error');
  assert.match(String(outcome.detail), /does not exist/);
});

test('an unrecognised rpc answer is never reported as a successful write', async () => {
  const { client } = fakeAdmin('something_new');

  const outcome = await reconcileEntitlement(client, {
    userId: USER,
    entitlementId: ENTITLEMENT,
    apiKey: 'sk_test',
    fetchImpl: okFetch(),
  });

  assert.equal(outcome.status, 'error');
});

test('a transfer that resolved to nothing asks RevenueCat to try again', () => {
  // RevenueCat retries 5xx and never retries a 200. Acknowledging a transfer
  // that wrote no row strands a billed customer exactly as the copy-only
  // handler did — the failure this branch exists to remove.
  const route = readFileSync('src/app/api/webhooks/revenuecat/route.ts', 'utf8');
  assert.match(
    route,
    /if \(sourceRows === 0 && reconciled\.status === 'error'\)[\s\S]{0,400}return \{ status: 'error' \}/,
  );
  // Not configured is the one that must NOT retry: no redelivery adds an
  // environment variable.
  assert.match(
    route,
    /if \(sourceRows === 0 && reconciled\.status === 'not_configured'\)[\s\S]{0,600}console\.error/,
  );
});
