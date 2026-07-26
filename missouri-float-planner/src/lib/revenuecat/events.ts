// src/lib/revenuecat/events.ts
// Pure RevenueCat webhook event → entitlement-state reduction.
//
// Kept free of I/O so the full event vocabulary can be unit-tested without a
// database (see events.test.ts). The route handler in
// src/app/api/webhooks/revenuecat/route.ts owns auth, persistence and
// idempotency; this module owns the semantics.
//
// Reference: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields

/** Event types we act on. Anything else is acknowledged and ignored. */
export const HANDLED_EVENT_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'TRANSFER',
] as const;

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

export interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string | null;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  environment?: string | null;
  store?: string | null;
  cancel_reason?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

/**
 * Patch to apply to the entitlements row. `undefined` means "leave as-is";
 * `null` means "clear". This distinction matters for BILLING_ISSUE, which
 * must not clobber the existing expires_at when the store sends no grace date.
 */
export interface EntitlementPatch {
  expires_at?: string | null;
  will_renew?: boolean;
  product_id?: string | null;
  store?: string | null;
  environment?: string | null;
  billing_issue_detected_at?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Our appUserID IS the Supabase user id — the app signs the user in with
 * Apple before any purchase, precisely so entitlements never attach to an
 * anonymous identity that a reinstall would orphan (strategy pass-1 finding).
 * RevenueCat's own anonymous ids ($RCAnonymousID:…) are therefore rejected.
 */
export function toSupabaseUserId(appUserId: string | null | undefined): string | null {
  if (!appUserId) return null;
  const trimmed = appUserId.trim();
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

function msToIso(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Event time, used for ordering/idempotency. Falls back to now. */
export function eventTimestamp(event: RevenueCatEvent, now: Date = new Date()): string {
  return msToIso(event.event_timestamp_ms) ?? now.toISOString();
}

/** Entitlement ids the event applies to, defaulting to the Eddy Premium entitlement. */
export function entitlementIdsFor(event: RevenueCatEvent, fallback: string): string[] {
  const ids = (event.entitlement_ids ?? []).filter((id): id is string => !!id);
  if (ids.length) return [...new Set(ids)];
  if (event.entitlement_id) return [event.entitlement_id];
  return [fallback];
}

function normalizeEnvironment(value: string | null | undefined): string | null {
  const upper = value?.toUpperCase();
  return upper === 'SANDBOX' || upper === 'PRODUCTION' ? upper : null;
}

/**
 * Reduce an event to the entitlement state it implies.
 *
 * Access is expressed purely as expires_at — never a boolean — so grace
 * periods, "cancelled but paid through October", and refunds all fall out of
 * one comparison at read time (see isEntitlementActive).
 *
 * Returns null for event types that carry no entitlement state (TRANSFER is
 * handled by the caller as a re-key, not a patch).
 */
export function computeEntitlementPatch(
  event: RevenueCatEvent,
  now: Date = new Date()
): EntitlementPatch | null {
  const type = event.type?.toUpperCase();
  const expiresAt = msToIso(event.expiration_at_ms);
  const common = {
    product_id: event.product_id ?? undefined,
    store: event.store ?? undefined,
    environment: normalizeEnvironment(event.environment) ?? undefined,
  };

  switch (type) {
    // Active subscription states. A successful purchase/renewal also clears
    // any prior billing issue.
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
      return { ...common, expires_at: expiresAt, will_renew: true, billing_issue_detected_at: null };

    // Season Pass / consumable-style purchase: access until expiry, no renewal.
    case 'NON_RENEWING_PURCHASE':
      return { ...common, expires_at: expiresAt, will_renew: false, billing_issue_detected_at: null };

    case 'CANCELLATION':
      // Auto-renew turned off: the user KEEPS access until the period ends.
      // The exception is a support-issued refund, which revokes immediately
      // (strategy: "refunds via RevenueCat webhook → revoke entitlement").
      if (event.cancel_reason?.toUpperCase() === 'CUSTOMER_SUPPORT') {
        return { ...common, expires_at: eventTimestamp(event, now), will_renew: false };
      }
      return { ...common, will_renew: false };

    case 'EXPIRATION':
      // Access has ended. Trust the store's expiry when present, else stamp now.
      return { ...common, expires_at: expiresAt ?? eventTimestamp(event, now), will_renew: false };

    case 'BILLING_ISSUE': {
      // Billing failed. The user may still be inside a grace period — extend
      // to it when the store tells us, otherwise leave expires_at untouched
      // (do NOT revoke here; EXPIRATION arrives if grace runs out).
      const graceEnd = msToIso(event.grace_period_expiration_at_ms);
      return {
        ...common,
        expires_at: graceEnd ?? undefined,
        billing_issue_detected_at: eventTimestamp(event, now),
      };
    }

    case 'SUBSCRIPTION_PAUSED':
      return { ...common, expires_at: expiresAt ?? eventTimestamp(event, now), will_renew: false };

    default:
      return null;
  }
}
