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

/**
 * Eddy's numeric Apple app ID — App Store Connect → App Information → "Apple
 * ID". Not the bundle identifier: the redemption URL below is keyed on the
 * store's own number, and it is immutable for the life of the app record.
 */
const APPLE_APP_ID = '6794933267';

/**
 * The App Store's code-entry screen for this app's subscription offer codes.
 *
 * Offer codes are how a subscription is granted free for a period — an
 * influencer's month, not a discounted purchase — and redemption happens in
 * the App Store, not in the app. StoreKit does have an in-app sheet
 * (presentCodeRedemptionSheet), but it fires no completion callback and fails
 * silently often enough that RevenueCat's own docs steer to this URL instead.
 * The trade is that redemption leaves the app, so whoever opens this has to
 * sync when they come back — that is syncRedeemedPurchases() below, and the
 * two are only ever useful together.
 */
export const OFFER_CODE_REDEEM_URL = `https://apps.apple.com/redeem?ctx=offercodes&id=${APPLE_APP_ID}`;

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
  /**
   * The same price as a NUMBER, and the currency it is in.
   *
   * These exist only for arithmetic the store cannot do for us — the monthly
   * equivalent of an annual plan, and how much that saves against the monthly
   * plan. Everything charged is still quoted from `priceString`: nothing
   * derived from these two fields may ever be presented as the amount someone
   * will pay, and every function below that touches them returns null rather
   * than guessing when either is missing.
   */
  priceAmount: number | null;
  currencyCode: string | null;
  /** Free-trial length in days, when the product carries an introductory offer. */
  trialDays: number | null;
  /** Billing period, for copy like "per year". Null when it is neither. */
  period: 'year' | 'month' | null;
  /** Set on the option we want people to take. */
  recommended: boolean;
  /**
   * Whole percent saved against twelve months of the monthly plan, or null.
   *
   * Filled in by annotateSavings() because it cannot be known from one package
   * alone. Null whenever the comparison would be unsound — see that function.
   */
  savingsPercent: number | null;
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
 * ── The strings on a plan chooser ───────────────────────────────────────────
 *
 * The paywall used to be a stack of buttons, one per plan, each one carrying
 * the whole offer in its label ("Try 7 days free — then $69.99/year"). It is
 * now a chooser — two selectable rows with the yearly one preselected — and a
 * single button that buys whichever is selected. That splits one string into
 * three, so the rule that mattered about the old one has to hold across all
 * three together:
 *
 *   APPLE REQUIRES THE PRICE, THE BILLING PERIOD, AND WHAT A TRIAL TURNS INTO
 *   TO BE LEGIBLE ON THE SCREEN THAT TAKES THE MONEY.
 *
 * packagePriceLabel and packageCadence put the first two in the row; the
 * button says what it does and packageTerms says what it costs directly
 * beneath it. purchase-copy.test.ts asserts the whole set, because the failure
 * mode of splitting a string in three is that one of the pieces goes missing
 * and nothing notices.
 */

/** "/yr", "/mo", or nothing — the compact suffix used beside a row's price. */
function shortPeriod(period: PurchasePackage['period']): string {
  if (period === 'year') return '/yr';
  if (period === 'month') return '/mo';
  return '';
}

/** "/year", "/month", or nothing — spelled out where there is room for it. */
function longPeriod(period: PurchasePackage['period']): string {
  return period ? `/${period}` : '';
}

/**
 * What the plan costs, as the row's headline figure — "$69.99/yr".
 *
 * Empty when the store returned no price, which the row renders as nothing
 * rather than as a stray "/yr".
 */
export function packagePriceLabel(pkg: PurchasePackage): string {
  if (!pkg.priceString) return '';
  return `${pkg.priceString}${shortPeriod(pkg.period)}`;
}

/**
 * The monthly equivalent of an annual plan — "$5.83" — or null.
 *
 * THIS IS NOT A PRICE ANYONE IS CHARGED, and the only reason it is safe to
 * show is that packageCadence always prints it next to "billed annually". It
 * is what makes the two plans comparable at a glance; "$69.99 vs $9.99" is not
 * a comparison, it is a bigger number next to a smaller one.
 *
 * Formatted through Intl with the store's own currency code so the symbol,
 * separators and number of decimal places follow the storefront — ¥ has none,
 * most of Europe uses a comma. Anything missing or unformattable returns null
 * and the caller says less, which is the only safe direction on this screen.
 */
export function perMonthPriceString(pkg: PurchasePackage): string | null {
  if (pkg.period !== 'year') return null;
  if (!pkg.currencyCode) return null;

  const amount = pkg.priceAmount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: pkg.currencyCode,
    }).format(amount / 12);
  } catch {
    // An unrecognised currency code throws rather than falling back. Saying
    // nothing beats printing a bare number with no symbol on it.
    return null;
  }
}

/** How the plan bills, under its title — "$5.83/mo, billed annually". */
export function packageCadence(pkg: PurchasePackage): string | null {
  if (pkg.period === 'year') {
    const perMonth = perMonthPriceString(pkg);
    return perMonth ? `${perMonth}/mo, billed annually` : 'Billed once a year';
  }
  if (pkg.period === 'month') return 'Billed every month';
  return null;
}

/**
 * Whole percent the annual plan saves against twelve months of the monthly one.
 *
 * ROUNDED DOWN, always. An overstated saving is a false claim about money, and
 * the difference between 19% and 20% is worth nothing next to being wrong.
 *
 * Returns null rather than a number whenever the comparison would not be sound:
 * a missing price on either side, two different currencies (a storefront can
 * price one product and not the other), or a result outside 1–99%, which means
 * the two products are not the pair this is meant to compare.
 */
export function annualSavingsPercent(
  annual: PurchasePackage,
  monthly: PurchasePackage | null | undefined,
): number | null {
  if (!monthly) return null;
  if (annual.period !== 'year' || monthly.period !== 'month') return null;

  if (!annual.currencyCode || !monthly.currencyCode) return null;
  if (annual.currencyCode !== monthly.currencyCode) return null;

  const yearly = annual.priceAmount;
  const perMonth = monthly.priceAmount;
  if (typeof yearly !== 'number' || !Number.isFinite(yearly) || yearly <= 0) return null;
  if (typeof perMonth !== 'number' || !Number.isFinite(perMonth) || perMonth <= 0) return null;

  const twelveMonths = perMonth * 12;
  const percent = Math.floor(((twelveMonths - yearly) / twelveMonths) * 100);

  return percent >= 1 && percent < 100 ? percent : null;
}

/** The saving as the row prints it — "19% off" — or null. */
export function savingsLabel(pkg: PurchasePackage): string | null {
  return pkg.savingsPercent ? `${pkg.savingsPercent}% off` : null;
}

/**
 * Fill in `savingsPercent` across a set of packages.
 *
 * Separate from the mapping in fetchOfferings so it can be tested without the
 * native SDK — the discount is the one number on this screen that is computed
 * rather than quoted, so it is the one that most needs a test.
 */
export function annotateSavings(packages: PurchasePackage[]): PurchasePackage[] {
  const monthly = packages.find((pkg) => pkg.period === 'month') ?? null;
  return packages.map((pkg) =>
    pkg.period === 'year' ? { ...pkg, savingsPercent: annualSavingsPercent(pkg, monthly) } : pkg,
  );
}

/**
 * The label on the one purchase button.
 *
 * An action, not a receipt — the price sits in the selected row above it and in
 * packageTerms below it. A trial still has to be named here, because "Get Eddy
 * Premium" on a button that in fact starts a free week understates the offer
 * exactly as badly as the reverse would overstate it.
 */
export function packageCta(pkg: PurchasePackage): string {
  if (pkg.trialDays) return `Start ${pkg.trialDays}-day free trial`;
  return 'Get Eddy Premium';
}

/**
 * The fine print under that button: what is charged, when, and what a trial
 * turns into.
 *
 * "7 days free" alone reads as a gift rather than the start of a subscription,
 * which is the sentence this one exists to prevent.
 */
export function packageTerms(pkg: PurchasePackage): string {
  const per = longPeriod(pkg.period);

  // No price means the store did not return one. Promising a figure we do not
  // have would be worse than pointing at the sheet that will show it.
  if (!pkg.priceString) {
    return pkg.trialDays
      ? `Free for ${pkg.trialDays} days. The App Store shows the price before you confirm.`
      : 'The App Store shows the price before you confirm.';
  }

  if (pkg.trialDays) {
    return `Free for ${pkg.trialDays} days, then ${pkg.priceString}${per}.`;
  }
  return `${pkg.priceString}${per}, renewing until cancelled.`;
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
 * bought), so it leads, carries the trial, and — since the paywall became a
 * chooser rather than a stack of buttons — is the one selected when the sheet
 * opens. `recommended` is what marks it, and the paywall reads that flag rather
 * than assuming the first element.
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
      const amount = Number(pkg?.product?.price);
      return {
        id: String(pkg?.identifier ?? type),
        title: annual ? 'Yearly' : type === 'MONTHLY' ? 'Monthly' : String(pkg?.identifier ?? ''),
        priceString: String(pkg?.product?.priceString ?? ''),
        // Only ever used for the derived per-month figure and the discount —
        // see the field comments. Anything non-numeric becomes null so those
        // two say nothing rather than something wrong.
        priceAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
        currencyCode: pkg?.product?.currencyCode ? String(pkg.product.currencyCode) : null,
        trialDays: trialDaysFromIntroPrice(pkg?.product?.introPrice),
        period: annual ? 'year' : type === 'MONTHLY' ? 'month' : null,
        recommended: annual,
        savingsPercent: null,
        raw: pkg,
      };
    });

    mapped.sort((a, b) => Number(b.recommended) - Number(a.recommended));
    return { status: 'ok', packages: annotateSavings(mapped) };
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
 * The premium entitlement as the SDK sees it at one moment — captured before
 * a redemption leaves the app, compared after it comes back.
 *
 * WHY A SNAPSHOT AND NOT A BOOLEAN: Profile deliberately offers "Redeem a
 * code" to active subscribers (App Store Connect can issue offers for
 * existing ones), and for them "is the entitlement active" answers yes
 * whether or not a code was redeemed — backing out of Apple's screen would
 * have read as success. Worse, Apple applies an existing subscriber's code at
 * the NEXT RENEWAL, so even a genuine redemption may change nothing
 * observable at return time. The only honest claim is one grounded in an
 * observed change, which takes a before to compare an after against —
 * redemptionOutcome() below is that comparison.
 */
export interface EntitlementSnapshot {
  entitled: boolean;
  /** The entitlement's expiration as the SDK reports it, null when absent. */
  expiresAt: string | null;
}

function snapshotFromCustomerInfo(info: unknown): EntitlementSnapshot {
  const entitlement = (
    info as { entitlements?: { active?: Record<string, { expirationDate?: unknown }> } }
  )?.entitlements?.active?.[ENTITLEMENT_ID];
  return {
    entitled: Boolean(entitlement),
    expiresAt: entitlement?.expirationDate ? String(entitlement.expirationDate) : null,
  };
}

/**
 * Capture the snapshot, or null when the SDK cannot answer.
 *
 * Null is load-bearing: collapsing "could not read" into "not entitled"
 * would let a failed pre-read turn an existing subscription into a false
 * "code redeemed" on the return trip. redemptionOutcome() refuses to claim
 * anything against a null baseline instead.
 */
export async function entitlementSnapshot(): Promise<EntitlementSnapshot | null> {
  const Purchases = loadPurchases();
  if (!Purchases) return null;

  try {
    return snapshotFromCustomerInfo(await Purchases.getCustomerInfo());
  } catch {
    return null;
  }
}

/**
 * Pull an App Store offer-code redemption into RevenueCat.
 *
 * A code is redeemed OUTSIDE the app — on the App Store screen that
 * OFFER_CODE_REDEEM_URL opens — so the transaction lands on the Apple ID
 * without RevenueCat hearing about it. It only learns when this app hands it
 * the receipt, which is what syncPurchases() does; until then the webhook has
 * nothing to write and the paywall stays up for someone who just redeemed.
 *
 * MUST RUN UNDER A CONFIRMED IDENTITY. The sync attributes the receipt to
 * whichever appUserID the SDK is configured for; after a failed logIn that is
 * the PREVIOUS user, and a redemption synced under them is stranded on the
 * wrong account — the exact failure the file header exists to prevent.
 * Callers await identifyUser() successfully before calling this.
 *
 * Returns the post-sync snapshot (the SDK's view, not the verdict — the
 * server stays the authority, so callers still wait for the backend before
 * claiming anything), or null on failure. Quiet on failure by design: this
 * runs when the app foregrounds after MAYBE redeeming, and most returns from
 * the App Store are someone who backed out. An error alert on every one of
 * those would scold people for looking.
 */
export async function syncRedeemedPurchases(): Promise<EntitlementSnapshot | null> {
  const Purchases = loadPurchases();
  if (!Purchases) return null;

  try {
    await Purchases.syncPurchases();
    // Read the entitlement from getCustomerInfo() rather than syncPurchases()'s
    // return value: older SDK versions resolve the latter with nothing.
    return snapshotFromCustomerInfo(await Purchases.getCustomerInfo());
  } catch (error) {
    purchaseDiagnostics()?.report(error, { operation: 'revenuecat.syncRedeemedPurchases' });
    return null;
  }
}

/**
 * Did the trip to the App Store actually change anything?
 *
 * 'granted' only on an OBSERVED change: an entitlement that was not active
 * and now is, or an active one whose expiration moved. Everything else is
 * 'unchanged' — including the genuinely ambiguous case of an active
 * subscriber whose redemption Apple defers to the next renewal, which is
 * indistinguishable at return time from having backed out. Silence is the
 * honest answer there: the screen they return to looks the same either way,
 * and "Code redeemed" over a cancelled sheet is a false claim about money.
 *
 * A null baseline (the pre-read failed) never grants — claiming success
 * against a state that was never seen is the same false claim.
 */
export function redemptionOutcome(
  before: EntitlementSnapshot | null,
  after: EntitlementSnapshot | null,
): 'granted' | 'unchanged' {
  if (!after || !after.entitled) return 'unchanged';
  if (!before) return 'unchanged';
  if (!before.entitled) return 'granted';
  return before.expiresAt !== after.expiresAt ? 'granted' : 'unchanged';
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
