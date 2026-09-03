// src/lib/revenuecat/api.ts
// Asking RevenueCat what a subscriber owns, instead of only being told.
//
// ── Why a pull exists alongside the push ──────────────────────────────────
//
// The webhook (src/app/api/webhooks/revenuecat/route.ts) is a STREAM. It hears
// about a subscription as things happen to it and writes each change down, and
// that is enough right up until the moment the thing it wrote down is gone.
//
// This product deliberately destroys it. `entitlements.user_id` references
// auth.users ON DELETE CASCADE (migration 00180), so deleting an account —
// which App Store Guideline 5.1.1(v) requires us to offer, in the app, to
// someone who may well still be subscribed — takes the entitlement row with it.
//
// Now read the restore path against that. Someone deletes their account, signs
// in with Apple again (a NEW Supabase user id, which is the appUserID), and
// taps Restore purchases. RevenueCat moves the purchase to the new id and sends
// exactly one webhook: TRANSFER. And a TRANSFER event carries no entitlement
// state at all — no expiration_at_ms, no product_id, no entitlement_ids, only
// `transferred_from` and `transferred_to` (RevenueCat's event-fields reference).
// So the ONLY place the handler could read the moved entitlement from was the
// source user's row — the row the deletion just cascaded away.
//
// The result was silent and total: the SDK reported the restore succeeded, the
// server never wrote anything, /api/me/profile kept answering isActive:false,
// and a paying customer stayed locked out until their next RENEWAL — up to a
// year away on the annual plan. Nothing logged an error, because nothing had
// failed; the copy loop simply had nothing to copy.
//
// A stream cannot recover state it was never sent. This module is the pull that
// can: given an app user id, ask RevenueCat's REST API what that subscriber
// owns right now, and write it down.
//
// ── What this is NOT ──────────────────────────────────────────────────────
//
// Not a second writer competing with the webhook. reconcileEntitlement() can
// only GRANT or EXTEND, never revoke or shorten (see the expiry guard there),
// so a reconcile racing a fresh webhook write can never undo it. Revocation
// stays exactly where it was: EXPIRATION, CANCELLATION and refunds arrive as
// events and only the webhook applies them.
//
// That one-way rule is also what makes it safe to expose to the app, which
// /api/me/entitlement/refresh does. The client never says what it bought — it
// asks the server to go and ask RevenueCat about the caller's own id.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntitlementPatch } from './events';

/** RevenueCat's REST v1 root. Overridable only in tests, via fetchImpl. */
export const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

/** How long to wait on RevenueCat before giving up. */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * The v1 SECRET key — RevenueCat → Project Settings → API Keys → "Secret API
 * key" (`sk_…`). NOT the `appl_…` key the app ships with, which can only read
 * offerings and start purchases.
 *
 * Absent is an ordinary state, not a misconfiguration: local dev and preview
 * deploys will not have it, and every caller below degrades to exactly the
 * behaviour that existed before this file did.
 */
export function revenueCatSecretKey(): string | null {
  const key = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  return key ? key : null;
}

/** Parse whatever RevenueCat put in a date field into an ISO string, or null. */
function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * The REST API reports stores lowercase (`app_store`); webhook events report
 * them upper (`APP_STORE`). Both write the same column, so normalise here —
 * otherwise the same subscription reads as two different stores depending on
 * which path last touched the row.
 */
function normalizeStore(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.toUpperCase() : undefined;
}

/**
 * Reduce a v1 subscriber payload to the same patch shape a webhook event
 * produces, for ONE entitlement id.
 *
 * Pure, and separate from the fetch, because this is where the mapping between
 * two different vocabularies for the same subscription lives — `expires_date`
 * vs `expiration_at_ms`, `is_sandbox` vs `environment`,
 * `unsubscribe_detected_at` vs `will_renew` — and getting one of those backwards
 * grants or revokes access without any error to show for it.
 *
 * Returns null when RevenueCat knows of no such entitlement, which the callers
 * treat as "write nothing": absence here is not evidence of expiry, and
 * revoking is not this module's job.
 */
export function subscriberEntitlementPatch(
  subscriber: unknown,
  entitlementId: string
): EntitlementPatch | null {
  const record = subscriber as
    | {
        entitlements?: Record<string, unknown> | null;
        subscriptions?: Record<string, unknown> | null;
      }
    | null
    | undefined;

  const entitlement = record?.entitlements?.[entitlementId] as
    | { expires_date?: unknown; product_identifier?: unknown }
    | undefined;
  if (!entitlement) return null;

  // A null expires_date means a NON-EXPIRING entitlement — a lifetime grant.
  // The schema states access purely as expires_at (see the events module), so
  // there is no honest way to write one, and Eddy sells no such product. Say
  // nothing rather than invent a date; a wrong one either strands a lifetime
  // buyer or hands out free years.
  const expiresAt = isoOrNull(entitlement.expires_date);
  if (!expiresAt) return null;

  const productId =
    typeof entitlement.product_identifier === 'string' && entitlement.product_identifier
      ? entitlement.product_identifier
      : null;

  const subscription = productId
    ? (record?.subscriptions?.[productId] as
        | {
            store?: unknown;
            is_sandbox?: unknown;
            unsubscribe_detected_at?: unknown;
            billing_issues_detected_at?: unknown;
          }
        | undefined)
    : undefined;

  return {
    expires_at: expiresAt,
    product_id: productId,
    store: normalizeStore(subscription?.store),
    // Only stated when there is a subscription to read it from. The column is
    // CHECK-constrained to SANDBOX/PRODUCTION, and guessing which one a
    // purchase came from is precisely the guess that decides whether a
    // TestFlight tester and a paying customer get the same answer.
    environment: subscription
      ? subscription.is_sandbox
        ? 'SANDBOX'
        : 'PRODUCTION'
      : undefined,
    // RevenueCat records the moment auto-renew was switched off rather than a
    // flag, so its absence is what "will renew" means. No subscription entry at
    // all is a one-off purchase, which by definition does not renew.
    will_renew: subscription ? !subscription.unsubscribe_detected_at : false,
    billing_issue_detected_at: isoOrNull(subscription?.billing_issues_detected_at),
  };
}

export type SubscriberFetch =
  | { status: 'ok'; subscriber: unknown }
  | { status: 'not_configured' }
  | { status: 'not_found' }
  | { status: 'error'; detail: string };

export interface FetchOptions {
  apiKey?: string | null;
  /** Injected in tests, the same way src/lib/push/expo.ts injects fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * GET /v1/subscribers/{app_user_id}.
 *
 * Never throws: RevenueCat being slow or down must degrade a restore to "we
 * have not seen it yet", which the callers already say, rather than 500 a
 * webhook RevenueCat would then retry against an outage it is itself having.
 */
export async function fetchSubscriber(
  appUserId: string,
  options: FetchOptions = {}
): Promise<SubscriberFetch> {
  const apiKey = options.apiKey ?? revenueCatSecretKey();
  if (!apiKey) return { status: 'not_configured' };

  const doFetch = options.fetchImpl ?? fetch;

  try {
    const response = await doFetch(
      `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        // Same reason createAdminClient() forces it: Next patches global fetch
        // with a Data Cache keyed on method+URL, and this URL is stable per
        // user. A cached entitlement answer is a stale entitlement answer.
        cache: 'no-store',
      }
    );

    // Defensive, and in practice unreached: RevenueCat's v1 GET creates an
    // empty subscriber for an unknown app_user_id and answers 201, so a user
    // who never bought comes back as `ok` with no entitlements, not as 404.
    // (It also means every never-purchased Restore leaves a subscriber record
    // in RevenueCat; harmless to entitlement.) Kept for the day the API's
    // behaviour changes, because the alternative is treating 404 as an error.
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) return { status: 'error', detail: `HTTP ${response.status}` };

    const body = (await response.json()) as { subscriber?: unknown } | null;
    return { status: 'ok', subscriber: body?.subscriber ?? null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 'error', detail };
  }
}

export type ReconcileStatus =
  | 'granted'
  | 'current'
  | 'none'
  | 'not_configured'
  | 'unknown_user'
  | 'error';

export interface ReconcileOutcome {
  status: ReconcileStatus;
  /** The expiry now on the row, when this call could establish one. */
  expiresAt: string | null;
  detail?: string;
}

export interface ReconcileParams extends FetchOptions {
  userId: string;
  entitlementId: string;
  /** Webhook event provenance, when a webhook is what triggered this. */
  stamp?: { id: string | null; type: string | null; at: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

/** The forward-only writer. See its migration for why it is one statement. */
export const RECONCILE_RPC = 'reconcile_entitlement';

/**
 * Bring one user's entitlement row up to what RevenueCat currently reports.
 *
 * ── The expiry guard, which is the whole safety story ─────────────────────
 *
 * The write lands only when RevenueCat's expiry is LATER than the one already
 * stored. Three things follow, and all three are load-bearing:
 *
 *   * It cannot revoke. A reconcile that raced a RENEWAL, or ran against a
 *     RevenueCat replica a second behind, would otherwise walk a subscriber
 *     backwards to an expiry they had already passed.
 *   * It cannot be used as an attack. The route that exposes this is
 *     authenticated and scoped to the caller's own id, but even if it were not,
 *     the worst it can do is re-assert what RevenueCat already believes.
 *   * A no-op is reported honestly (`current`) rather than as a write, so the
 *     app can tell "already correct" from "just fixed".
 *
 * ── And why that guard is not in this file ────────────────────────────────
 *
 * It was, once: read the stored expiry, compare, upsert. Which is not the rule
 * above — it is the rule above with a gap in the middle. A RENEWAL webhook
 * landing between the read and the write gets silently overwritten by the older
 * expiry this was holding, which is precisely the revocation the guard exists
 * to forbid, on a live subscriber, reported as success. Small window, ordinary
 * trigger: a restore on the day a subscription renews.
 *
 * So the comparison and the write are one statement, in Postgres, under the row
 * lock — public.reconcile_entitlement(). A guarantee that has to hold under
 * concurrency cannot be enforced by a process that only observes it.
 *
 * Called with a SERVICE-ROLE client: `entitlements` has no write policy for
 * anyone (migration 00180), by design, and the function is granted to
 * service_role alone.
 */
export async function reconcileEntitlement(
  admin: AdminClient,
  params: ReconcileParams
): Promise<ReconcileOutcome> {
  const { userId, entitlementId, stamp } = params;

  // Taken BEFORE the REST read, and handed to the function as p_observed_at:
  // a row that learned something after this moment — a refund whose webhook
  // landed while the read was in flight — refuses to be moved forward by a
  // snapshot older than what it knows. See the migration that added the
  // argument. Before the read, not after, so the window it closes is the
  // whole round trip and not just the tail of it.
  const observedAt = new Date().toISOString();

  const fetched = await fetchSubscriber(userId, params);
  if (fetched.status === 'not_configured') return { status: 'not_configured', expiresAt: null };
  if (fetched.status === 'not_found') return { status: 'none', expiresAt: null };
  if (fetched.status === 'error') {
    return { status: 'error', expiresAt: null, detail: fetched.detail };
  }

  const patch = subscriberEntitlementPatch(fetched.subscriber, entitlementId);
  if (!patch?.expires_at) return { status: 'none', expiresAt: null };

  const { data, error } = await admin.rpc(RECONCILE_RPC, {
    p_user_id: userId,
    p_entitlement_id: entitlementId,
    p_expires_at: patch.expires_at,
    p_will_renew: patch.will_renew ?? null,
    p_product_id: patch.product_id ?? null,
    p_store: patch.store ?? null,
    p_environment: patch.environment ?? null,
    p_billing_issue_detected_at: patch.billing_issue_detected_at ?? null,
    p_last_event_id: stamp?.id ?? null,
    p_last_event_type: stamp?.type ?? null,
    p_last_event_at: stamp?.at ?? null,
    p_observed_at: observedAt,
  });

  if (error) {
    // Includes the function not existing yet, which is a deployment that ran
    // ahead of its migration. Reported as an error rather than swallowed: the
    // webhook then 5xxes and RevenueCat retries, so the entitlement survives
    // the gap instead of being dropped on the floor.
    return { status: 'error', expiresAt: null, detail: error.message };
  }

  if (data === 'granted') return { status: 'granted', expiresAt: patch.expires_at };
  if (data === 'unknown_user') return { status: 'unknown_user', expiresAt: null };
  if (data === 'current') return { status: 'current', expiresAt: null };

  // A status this file does not know is a function it does not know. Treating
  // it as success would report a write nobody can show happened.
  return { status: 'error', expiresAt: null, detail: `unexpected rpc result: ${String(data)}` };
}
