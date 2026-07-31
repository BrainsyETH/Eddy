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

/**
 * The entitlement identifier configured in the RevenueCat dashboard. A
 * dashboard key, not a display string — the product is called "Eddy Premium",
 * this is what RevenueCat sends.
 *
 * DUPLICATED from DEFAULT_ENTITLEMENT_ID in the web app's src/lib/entitlement.ts,
 * and it has to be: Vercel builds with Root Directory = missouri-float-planner/,
 * so the backend cannot import from packages/ at runtime and the constant cannot
 * live in @eddy/types where it belongs. src/lib/entitlement-id.test.ts in the web
 * app asserts the two literals agree — a mismatch fails silently, with rows
 * written that nothing reads and a paywall that never unlocks.
 */
export const ENTITLEMENT_ID = 'eddy_premium';

export type PurchasesUnavailableReason =
  | 'not_configured'
  | 'native_module_missing'
  | 'anonymous_user';

type PurchasesModule = any;

let cached: PurchasesModule | null = null;
let configuredFor: string | null = null;

/**
 * Purchases is imported by the web test harness, where Sentry's native module
 * is intentionally absent. Resolve diagnostics only when a real failure needs
 * reporting so this file keeps its native-safe import contract.
 */
interface PurchaseDiagnostics {
  report(error: unknown, context?: Record<string, unknown>): void;
  warn(tag: 'purchase', message: string, detail?: unknown): void;
}

function purchaseDiagnostics(): PurchaseDiagnostics | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { report, warn } = require('./monitoring') as PurchaseDiagnostics;
    return { report, warn };
  } catch {
    return null;
  }
}

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
 * Refuses anonymous ids outright — see the header. Safe to call repeatedly.
 *
 * CONFIGURE ONCE, THEN logIn. `configure()` is an initialiser and calling it a
 * second time is unsupported; switching identity afterwards is what `logIn()`
 * is for. The two are easy to conflate because both take a user id, and the
 * case that exercises the difference is the important one: someone launches
 * anonymous, then converts with Apple mid-session, which changes the id while
 * the SDK is already running.
 */
export async function identifyUser(userId: string, isAnonymous: boolean): Promise<boolean> {
  if (isAnonymous || !API_KEY) return false;

  const Purchases = loadPurchases();
  if (!Purchases) return false;

  try {
    if (configuredFor === null) {
      Purchases.configure({ apiKey: API_KEY, appUserID: userId });
      configuredFor = userId;
      return true;
    }

    if (configuredFor !== userId) {
      await Purchases.logIn(userId);
      configuredFor = userId;
    }
    return true;
  } catch {
    return false;
  }
}

/** One purchasable option, as the paywall renders it. */
export interface PurchasePackage {
  /** RevenueCat package identifier, used as a React key. */
  id: string;
  title: string;
  /**
   * Localised price string STRAIGHT FROM THE STORE — "$19.99", "£17.99", …
   *
   * Never construct this. Prices differ per storefront, Apple adjusts them on
   * its own schedule, and a hardcoded price that disagrees with what the
   * purchase sheet charges is both a review rejection and a refund request.
   */
  priceString: string;
  /** Free-trial length in days, when the product carries an introductory offer. */
  trialDays: number | null;
  /** Billing period, for copy like "per year". Null when it is neither. */
  period: 'year' | 'month' | null;
  /** Set on the option we want people to take. */
  recommended: boolean;
  /** The SDK's own package object, handed back to purchasePackage(). */
  raw: unknown;
}

/**
 * Days of free trial from a StoreKit introductory offer, or null.
 *
 * Deliberately defensive. The shape of `introPrice` has moved between SDK
 * versions and the fields arrive from native code, so anything unexpected
 * returns null — no trial mentioned — rather than a number. The failure to
 * avoid is confidently rendering "Try 0 days free", which is worse than saying
 * nothing about a trial at all.
 *
 * Exported for testing; the app reads `PurchasePackage.trialDays`.
 */
export function trialDaysFromIntroPrice(intro: unknown): number | null {
  const offer = intro as { price?: unknown; periodNumberOfUnits?: unknown; periodUnit?: unknown };
  if (!offer) return null;

  // A non-zero introductory price is a DISCOUNT, not a free trial. Calling it
  // one would be a false claim on a purchase screen.
  if (Number(offer.price) !== 0) return null;

  const units = Number(offer.periodNumberOfUnits);
  if (!Number.isFinite(units) || units <= 0) return null;

  switch (String(offer.periodUnit).toUpperCase()) {
    case 'DAY':
      return units;
    case 'WEEK':
      return units * 7;
    case 'MONTH':
      return units * 30;
    case 'YEAR':
      return units * 365;
    default:
      return null;
  }
}

/**
 * The label on a purchase button.
 *
 * Apple requires the price and the billing period to be legible on the purchase
 * screen, and a trial has to state what happens when it ends — "7 days free"
 * alone reads as a gift. Pulled out of the JSX so it can be tested: this is the
 * string that decides whether the offer is honest.
 */
export function packageCta(pkg: PurchasePackage): string {
  const per = pkg.period ? `/${pkg.period}` : '';

  if (pkg.trialDays && pkg.priceString) {
    return `Try ${pkg.trialDays} days free — then ${pkg.priceString}${per}`;
  }
  if (pkg.priceString) {
    return `${pkg.title} · ${pkg.priceString}${per}`;
  }
  // No price means the store did not return one; offering a button that cannot
  // say what it charges is worse than an obviously incomplete one.
  return pkg.title;
}

export type OfferingsResult =
  | { status: 'ok'; packages: PurchasePackage[] }
  | { status: 'unavailable'; packages: [] };

export const PREMIUM_UNAVAILABLE_COPY = "Premium isn't available right now.";

export function unavailableOfferings(): OfferingsResult {
  return { status: 'unavailable', packages: [] };
}

/**
 * The current offering's packages, annual first.
 *
 * Ordering is not cosmetic: annual is the product the business wants people on
 * (it hedges seasonal churn, and its renewal lands in the same month they
 * bought), so it leads and carries the trial.
 */
export async function fetchOfferings(): Promise<OfferingsResult> {
  const Purchases = loadPurchases();
  if (!Purchases) {
    return unavailableOfferings();
  }

  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    const available: PurchasesModule[] = current?.availablePackages ?? [];

    if (available.length === 0) {
      // Almost always configuration rather than code: no offering marked
      // current in RevenueCat, or products not yet approved in App Store
      // Connect. Say something a person can act on instead of showing nothing.
      purchaseDiagnostics()?.warn(
        'purchase',
        'RevenueCat returned no packages for the current offering',
      );
      return unavailableOfferings();
    }

    const mapped: PurchasePackage[] = available.map((pkg) => {
      const type = String(pkg?.packageType ?? '').toUpperCase();
      const annual = type === 'ANNUAL';
      return {
        id: String(pkg?.identifier ?? type),
        title: annual ? 'Yearly' : type === 'MONTHLY' ? 'Monthly' : String(pkg?.identifier ?? ''),
        priceString: String(pkg?.product?.priceString ?? ''),
        trialDays: trialDaysFromIntroPrice(pkg?.product?.introPrice),
        period: annual ? 'year' : type === 'MONTHLY' ? 'month' : null,
        recommended: annual,
        raw: pkg,
      };
    });

    mapped.sort((a, b) => Number(b.recommended) - Number(a.recommended));
    return { status: 'ok', packages: mapped };
  } catch (error) {
    // RevenueCat's errors describe dashboard and StoreKit configuration. They
    // belong in diagnostics, never verbatim on a customer-facing paywall.
    purchaseDiagnostics()?.report(error, { operation: 'revenuecat.fetchOfferings' });
    return unavailableOfferings();
  }
}

export type PurchaseOutcome =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Run a purchase.
 *
 * `cancelled` is its own outcome rather than an error. Backing out of Apple's
 * sheet is the single most common way this call ends, it is a decision rather
 * than a fault, and showing an alert for it would be the app scolding someone
 * for changing their mind.
 *
 * A `purchased` result means STOREKIT is done — not that the server knows. The
 * entitlement reaches us through RevenueCat's webhook, so the caller has to
 * wait for the backend to catch up (see waitForEntitlement in api/client.ts).
 */
export async function purchasePackage(pkg: PurchasePackage): Promise<PurchaseOutcome> {
  const Purchases = loadPurchases();
  if (!Purchases) {
    return { status: 'error', message: 'Subscriptions are unavailable in this build.' };
  }

  try {
    await Purchases.purchasePackage(pkg.raw);
    return { status: 'purchased' };
  } catch (err) {
    const e = err as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) return { status: 'cancelled' };
    return { status: 'error', message: e?.message ?? 'The purchase could not be completed.' };
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
    return 'There is a problem with your payment method — update it in Settings to keep Eddy Premium.';
  }

  if (!entitlement.expiresAt) return 'Active';

  const when = new Date(entitlement.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return entitlement.willRenew ? `Renews ${when}` : `Ends ${when}`;
}
