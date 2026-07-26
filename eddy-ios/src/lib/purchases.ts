// eddy-ios/src/lib/purchases.ts
// RevenueCat, behind a lazy require and an optional API key.
//
// ── Two things this file exists to guarantee ──────────────────────────────
//
// 1. THE APP RUNS WITHOUT IT. `react-native-purchases` is a native module, so
//    it cannot load in Expo Go, and the API key is not set in every
//    environment. Both are ordinary states, not errors: the map already uses
//    this lazy-require shape (src/map/runtime.ts) for the same reason. Every
//    function below returns a value the caller can render rather than throwing.
//
// 2. IDENTITY IS NEVER ANONYMOUS. RevenueCat is configured with the Supabase
//    user id as its appUserID, and configure() is deliberately NOT called until
//    that id belongs to a signed-in user. An entitlement bought under an
//    anonymous id is stranded the moment that id is replaced — a reinstall, a
//    sign-out — and the buyer has no way to recover it. That failure was the
//    major finding of the strategy's first review pass, so the guard is here
//    rather than left to callers to remember.
//
// The SERVER remains the authority on entitlement. RevenueCat's webhook writes
// to `entitlements` and /api/me/profile derives `isActive` from expires_at.
// What this module is for is the purchase and restore FLOW, not the verdict.

import type { MeEntitlement } from '@eddy/types';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

/** The entitlement identifier configured in the RevenueCat dashboard. */
export const ENTITLEMENT_ID = 'eddy_plus';

export type PurchasesUnavailableReason =
  | 'not_configured'
  | 'native_module_missing'
  | 'anonymous_user';

type PurchasesModule = any;

let cached: PurchasesModule | null = null;
let configuredFor: string | null = null;

/**
 * The native module, or null in Expo Go.
 *
 * Required lazily so that merely importing this file cannot break the JS
 * bundle where the native side is absent.
 */
function loadPurchases(): PurchasesModule | null {
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    cached = mod.default ?? mod;
    return cached;
  } catch {
    return null;
  }
}

export function purchasesUnavailableReason(
  userId: string | null,
  isAnonymous: boolean,
): PurchasesUnavailableReason | null {
  if (!API_KEY) return 'not_configured';
  if (!loadPurchases()) return 'native_module_missing';
  if (!userId || isAnonymous) return 'anonymous_user';
  return null;
}

/**
 * Point RevenueCat at a specific Supabase user.
 *
 * Refuses anonymous ids outright — see the header. Safe to call repeatedly;
 * it reconfigures only when the id actually changes, which is what happens
 * when an anonymous user converts.
 */
export function configurePurchases(userId: string, isAnonymous: boolean): boolean {
  if (isAnonymous || !API_KEY) return false;

  const Purchases = loadPurchases();
  if (!Purchases) return false;

  if (configuredFor === userId) return true;

  try {
    Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    configuredFor = userId;
    return true;
  } catch {
    return false;
  }
}

export interface RestoreResult {
  ok: boolean;
  /** True when the restore found a live entitlement attached to this Apple ID. */
  entitled: boolean;
  message: string;
}

/**
 * Restore Purchases. App Review requires this control to exist and work on any
 * app that sells a subscription — a reviewer WILL look for it.
 *
 * The message is written for the case that actually happens: someone taps it
 * expecting their subscription back and it finds nothing, usually because they
 * are signed into a different Apple ID than the one that paid.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  const Purchases = loadPurchases();
  if (!Purchases) {
    return { ok: false, entitled: false, message: 'Purchases are unavailable in this build.' };
  }

  try {
    const info = await Purchases.restorePurchases();
    const entitled = Boolean(info?.entitlements?.active?.[ENTITLEMENT_ID]);

    return {
      ok: true,
      entitled,
      message: entitled
        ? 'Your subscription is restored.'
        : 'No subscription found for this Apple ID. If you paid with a different one, sign into that Apple ID in Settings and try again.',
    };
  } catch (err) {
    const message = (err as { message?: string })?.message;
    return {
      ok: false,
      entitled: false,
      message: message ?? 'Could not reach the App Store. Please try again.',
    };
  }
}

/**
 * Human-readable renewal line for the Profile tab.
 *
 * Ordering matters here: a billing problem outranks the renewal date, because
 * it is the only state the user can still act on before losing access.
 */
export function subscriptionSummary(entitlement: MeEntitlement | null): string {
  if (!entitlement || !entitlement.isActive) return 'No active subscription';

  if (entitlement.billingIssue) {
    return 'There is a problem with your payment method — update it in Settings to keep Eddy+.';
  }

  if (!entitlement.expiresAt) return 'Active';

  const when = new Date(entitlement.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return entitlement.willRenew ? `Renews ${when}` : `Ends ${when}`;
}
