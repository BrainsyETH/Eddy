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

/**
 * Bring one user's entitlement row up to what RevenueCat currently reports.
 *
 * ── The expiry guard, which is the whole safety story ─────────────────────
 *
 * This writes only when RevenueCat's expiry is LATER than the one already
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
 * Takes a SERVICE-ROLE client: `entitlements` has no write policy for anyone
 * (migration 00180), by design.
 */
export async function reconcileEntitlement(
  admin: AdminClient,
  params: ReconcileParams
): Promise<ReconcileOutcome> {
  const { userId, entitlementId, stamp } = params;

  const fetched = await fetchSubscriber(userId, params);
  if (fetched.status === 'not_configured') return { status: 'not_configured', expiresAt: null };
  if (fetched.status === 'not_found') return { status: 'none', expiresAt: null };
  if (fetched.status === 'error') {
    return { status: 'error', expiresAt: null, detail: fetched.detail };
  }

  const patch = subscriberEntitlementPatch(fetched.subscriber, entitlementId);
  if (!patch?.expires_at) return { status: 'none', expiresAt: null };

  const { data: existing, error: readError } = await admin
    .from('entitlements')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('entitlement_id', entitlementId)
    .maybeSingle();

  if (readError) {
    return { status: 'error', expiresAt: null, detail: readError.message };
  }

  const stored = existing?.expires_at ? new Date(existing.expires_at).getTime() : null;
  const wanted = new Date(patch.expires_at).getTime();
  if (stored !== null && !Number.isNaN(stored) && stored >= wanted) {
    return { status: 'current', expiresAt: existing.expires_at };
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    entitlement_id: entitlementId,
    rc_app_user_id: userId,
    ...(stamp
      ? { last_event_id: stamp.id, last_event_type: stamp.type, last_event_at: stamp.at }
      : {}),
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) row[key] = value;
  }

  const { error: upsertError } = await admin
    .from('entitlements')
    .upsert(row, { onConflict: 'user_id,entitlement_id' });

  if (upsertError) {
    // 23503 = FK violation: a well-formed uuid with no auth user behind it.
    // Reconciling a deleted account is not retryable and not an error worth
    // 500-ing a webhook over.
    if (upsertError.code === '23503') return { status: 'unknown_user', expiresAt: null };
    return { status: 'error', expiresAt: null, detail: upsertError.message };
  }

  return { status: 'granted', expiresAt: patch.expires_at };
}
