// src/lib/purchase-copy.test.ts
// The strings on the purchase screen and the subscription row in Profile.
//
// Tested here because the Expo app has no test runner — the same arrangement as
// geo-tiles.test.ts and chunked-store.test.ts. purchases.ts is importable from
// Node because its only module-level import is `import type`, and the native
// SDK is behind a lazy require inside a function.
//
// These are not decorative strings. A purchase screen that misstates the price,
// the billing period, or what happens when a trial ends is an App Review
// rejection at best and a refund request at worst.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { MeEntitlement } from '@eddy/types';
import {
  annotateSavings,
  annualSavingsPercent,
  entitlementChanged,
  entitlementMatchesSnapshot,
  entitlementSnapshot,
  OFFER_CODE_REDEEM_URL,
  packageCadence,
  packageCta,
  packagePriceLabel,
  packageTerms,
  perMonthPriceString,
  PREMIUM_UNAVAILABLE_COPY,
  receiptBelongsToAnotherAccount,
  redemptionAlert,
  restoreAlert,
  savingsLabel,
  subscriptionSummary,
  trialDaysFromIntroPrice,
  unavailableOfferings,
  type PurchasePackage,
} from '../../../eddy-ios/src/lib/purchases';

// The two fixtures below carry the SHIPPED US prices — $19.99/yr and $1.99/mo,
// with the 7-day trial on annual (docs/REVENUECAT_SETUP.md). Nothing asserts
// the store must return those; they are here so the strings these tests read
// are the strings a buyer in the US actually sees, and so the arithmetic is
// exercised on the pair that ships rather than on invented round numbers.
function pkg(overrides: Partial<PurchasePackage> = {}): PurchasePackage {
  return {
    id: 'annual',
    title: 'Yearly',
    priceString: '$19.99',
    priceAmount: 19.99,
    currencyCode: 'USD',
    trialDays: null,
    period: 'year',
    recommended: true,
    savingsPercent: null,
    raw: {},
    ...overrides,
  };
}

function monthlyPkg(overrides: Partial<PurchasePackage> = {}): PurchasePackage {
  return pkg({
    id: 'monthly',
    title: 'Monthly',
    priceString: '$1.99',
    priceAmount: 1.99,
    period: 'month',
    recommended: false,
    ...overrides,
  });
}

// ── The purchase button and its fine print ──────────────────────────────────
//
// The paywall is a chooser now — rows per plan, one button — so the offer is
// spread across packagePriceLabel, packageCadence, packageCta and packageTerms
// rather than living in one button label. The requirement did not move with it:
// price, billing period, and what a trial turns into must all be legible on the
// screen that takes the money. These tests are what hold that together.

test('a free trial states the price it turns into', () => {
  // "7 days free" on its own reads as a gift rather than the start of a
  // subscription, and Apple requires the follow-on terms to be legible here.
  assert.equal(packageCta(pkg({ trialDays: 7 })), 'Start 7-day free trial');
  assert.equal(packageTerms(pkg({ trialDays: 7 })), 'Free for 7 days, then $19.99/year.');
});

test('no trial states the price, the period and that it renews', () => {
  const monthly = monthlyPkg();
  assert.equal(packageCta(monthly), 'Get Eddy Premium');
  assert.equal(packageTerms(monthly), '$1.99/month, renewing until cancelled.');
});

test('a missing price is never invented, on the button or under it', () => {
  // The store failing to return a price is rare but real. Pointing at the sheet
  // that will show it is the only honest thing left to say.
  assert.equal(packagePriceLabel(pkg({ priceString: '' })), '');
  assert.match(packageTerms(pkg({ priceString: '' })), /App Store shows the price/);
  assert.match(
    packageTerms(pkg({ priceString: '', trialDays: 7 })),
    /^Free for 7 days\. The App Store shows the price/,
  );
  // And nothing anywhere pretends the amount is known.
  assert.doesNotMatch(packageTerms(pkg({ priceString: '' })), /\d/);
});

test('the row states the price against the period it buys', () => {
  assert.equal(packagePriceLabel(pkg()), '$19.99/yr');
  assert.equal(packagePriceLabel(monthlyPkg()), '$1.99/mo');
  // An unrecognised package type has no period to name, so it names none
  // rather than guessing one.
  assert.equal(packagePriceLabel(pkg({ period: null, priceString: '$5.00' })), '$5.00');
});

// ── The derived monthly figure ──────────────────────────────────────────────

test('an annual plan is quoted per month AND labelled as billed annually', () => {
  // The per-month figure is the whole point of the row — $19.99 beside $1.99
  // reads as expensive beside cheap — but it is not what anyone is charged, so
  // it may never appear without "billed annually" beside it.
  const cadence = packageCadence(pkg());
  assert.match(String(cadence), /1[.,]67/);
  assert.match(String(cadence), /billed annually/);
});

test('the monthly equivalent follows the storefront, not the dollar', () => {
  // Symbol, separator and number of decimal places all vary by currency; yen
  // has no minor unit at all, so a hardcoded two-decimal format would invent
  // fractions of a yen.
  const yen = perMonthPriceString(pkg({ priceAmount: 7000, currencyCode: 'JPY' }));
  assert.match(String(yen), /583/);
  assert.doesNotMatch(String(yen), /583[.,]\d/);
});

test('a monthly equivalent is never shown without the numbers to compute it', () => {
  assert.equal(perMonthPriceString(pkg({ priceAmount: null })), null);
  assert.equal(perMonthPriceString(pkg({ currencyCode: null })), null);
  assert.equal(perMonthPriceString(pkg({ priceAmount: 0 })), null);
  assert.equal(perMonthPriceString(pkg({ currencyCode: 'NOT_A_CURRENCY' })), null);
  // Monthly plans are already per month; there is nothing to derive.
  assert.equal(perMonthPriceString(monthlyPkg()), null);

  // The row still says how the plan bills, just without the figure.
  assert.equal(packageCadence(pkg({ priceAmount: null })), 'Billed once a year');
  assert.equal(packageCadence(monthlyPkg()), 'Billed every month');
  assert.equal(packageCadence(pkg({ period: null })), null);
});

// ── The discount ────────────────────────────────────────────────────────────

test('the saving is measured against twelve months of the monthly plan', () => {
  // $19.99 against 12 × $1.99 = $23.88. The shipped pair, and a thin margin —
  // REVENUECAT_SETUP.md calls it a 1.19x premium — which is exactly why the
  // figure has to be computed from the store's numbers rather than written
  // down. Repricing either product moves it without anyone editing this app.
  assert.equal(annualSavingsPercent(pkg(), monthlyPkg()), 16);
});

test('the saving rounds DOWN, never up', () => {
  // 18.99% is not 19%. Overstating a discount is a false claim about money,
  // and the extra point is worth nothing next to being wrong.
  assert.equal(
    annualSavingsPercent(pkg({ priceAmount: 69.99 }), monthlyPkg({ priceAmount: 7.2 })),
    18,
  );
});

test('an unsound comparison yields no discount rather than a wrong one', () => {
  assert.equal(annualSavingsPercent(pkg(), null), null);
  // A storefront can price one product and not the other.
  assert.equal(annualSavingsPercent(pkg({ priceAmount: null }), monthlyPkg()), null);
  assert.equal(annualSavingsPercent(pkg(), monthlyPkg({ priceAmount: null })), null);
  // Two currencies are not comparable numbers.
  assert.equal(
    annualSavingsPercent(pkg({ priceAmount: 6900 }), monthlyPkg({ currencyCode: 'JPY' })),
    null,
  );
  // No saving at all, or a yearly plan that costs more than twelve months.
  assert.equal(
    annualSavingsPercent(pkg({ priceAmount: 23.88 }), monthlyPkg({ priceAmount: 1.99 })),
    null,
  );
  assert.equal(
    annualSavingsPercent(pkg({ priceAmount: 99.99 }), monthlyPkg({ priceAmount: 1.99 })),
    null,
  );
  // Compared against the wrong pair of periods.
  assert.equal(annualSavingsPercent(monthlyPkg(), monthlyPkg()), null);
});

test('only the annual plan carries a saving, and only when there is one to carry', () => {
  const [annual, monthly] = annotateSavings([pkg(), monthlyPkg()]);
  assert.equal(annual.savingsPercent, 16);
  assert.equal(savingsLabel(annual), '16% off');

  // The monthly plan is the baseline; it cannot be a discount on itself.
  assert.equal(monthly.savingsPercent, null);
  assert.equal(savingsLabel(monthly), null);

  // An offering with no monthly plan has nothing to compare against.
  const [alone] = annotateSavings([pkg()]);
  assert.equal(alone.savingsPercent, null);
  assert.equal(savingsLabel(alone), null);
});

test('empty offerings produce a safe customer-facing unavailable state', () => {
  assert.deepEqual(unavailableOfferings(), { status: 'unavailable', packages: [] });
  assert.equal(PREMIUM_UNAVAILABLE_COPY, "Premium isn't available right now.");
  assert.doesNotMatch(PREMIUM_UNAVAILABLE_COPY, /configuration|sdk|revenuecat|storekit/i);
});

test('offering failures stay customer-safe and reach diagnostics lazily', () => {
  const purchases = readFileSync('../eddy-ios/src/lib/purchases.ts', 'utf8');
  assert.match(purchases, /require\(['"]\.\/monitoring['"]\)/);
  assert.match(purchases, /report\(error, \{ operation: 'revenuecat\.fetchOfferings' \}\)/);
  assert.match(purchases, /warn\([\s\S]*'purchase'[\s\S]*no packages/);
});

test('the paywall states forecast uncertainty explicitly', () => {
  // The sentence moved from the component into premiumCopy.ts when the pitch
  // was centralised, so this now checks the copy module AND that the paywall
  // still renders it. Checking only the module would let someone drop the
  // render and keep the test green — which is the failure this guards against,
  // since the caveat is worthless anywhere but on screen.
  const copy = readFileSync('../eddy-ios/src/lib/premiumCopy.ts', 'utf8');
  assert.match(copy, /outlook is a forecast, not a promise/i);

  const paywall = readFileSync('../eddy-ios/src/components/PaywallSheet.tsx', 'utf8');
  assert.match(paywall, /PREMIUM_FORECAST_CAVEAT/);
});

test('the paywall opens on the recommended plan and buys the selected one', () => {
  // Same reasoning as the caveat test above: the logic is pure and tested, but
  // it is worth nothing if the screen stops calling it. The default in
  // particular is invisible in every unit test — it lives in which package the
  // component falls through to when nothing has been tapped.
  const paywall = readFileSync('../eddy-ios/src/components/PaywallSheet.tsx', 'utf8');

  // Derived from `recommended` rather than stored, so it re-defaults on every
  // open instead of remembering a plan somebody looked at and did not buy.
  assert.match(paywall, /packages\?\.find\(\(pkg\) => pkg\.recommended\)/);
  assert.match(paywall, /handleBuy\(selected\)/);
  assert.match(paywall, /packageTerms\(selected\)/);

  // Both halves of the comparison have to reach the row, or the yearly plan is
  // back to being the bigger number.
  assert.match(paywall, /packageCadence\(pkg\)/);
  assert.match(paywall, /savingsLabel\(pkg\)/);
});

test('the best-value ribbon is the branded object, not a grey chip', () => {
  // The chooser is otherwise deliberately plain — it uses the same selection
  // idiom as every other selectable row in the app. This one badge is where the
  // brand lands, so it is worth pinning: DESIGN.md's coral pill, DESIGN.md's
  // display face, and the otter mark that says whose recommendation it is.
  const paywall = readFileSync('../eddy-ios/src/components/PaywallSheet.tsx', 'utf8');
  assert.match(paywall, /backgroundColor: colors\.emphasisFill/);
  assert.match(paywall, /color: colors\.onEmphasis/);
  assert.match(paywall, /fontFamily: fonts\.display\b/);
  assert.match(paywall, /<EddySymbol name="eddyRated"/);

  // Coral as a fill has one legibility trap and this is it: the website's own
  // white-on-coral is 2.9:1, which is not good enough for 10pt type on a
  // purchase screen. The ink must stay the warm near-black.
  const palette = readFileSync('../eddy-ios/src/theme/palette.ts', 'utf8');
  assert.match(palette, /onEmphasis: neutral\[950\]/);
  assert.doesNotMatch(palette, /onEmphasis: '#FFFFFF'/);
});

test('the annual package is the one marked recommended', () => {
  // The paywall's default is only correct because this flag is. Nothing else
  // in the app sets it.
  const purchases = readFileSync('../eddy-ios/src/lib/purchases.ts', 'utf8');
  assert.match(purchases, /recommended: annual/);
  assert.match(purchases, /packages: annotateSavings\(mapped\)/);
});

test('the localised price string is passed through untouched', () => {
  // Never reconstructed from a number: storefronts differ in symbol, placement
  // and separator, and Apple charges what IT says, not what we format. The
  // package now carries a numeric price as well, for the per-month figure —
  // this is what stops that number from leaking into the quoted price.
  assert.match(packagePriceLabel(pkg({ priceString: '£17,99', priceAmount: 17.99 })), /£17,99/);
  assert.match(packageTerms(pkg({ priceString: '£17,99', priceAmount: 17.99 })), /£17,99/);
  assert.match(packagePriceLabel(pkg({ priceString: '¥3,000', priceAmount: 3000 })), /¥3,000/);
  assert.match(packageTerms(pkg({ priceString: '¥3,000', priceAmount: 3000 })), /¥3,000/);
});

test('trial length converts every StoreKit period unit to days', () => {
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 7, periodUnit: 'DAY' }), 7);
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 1, periodUnit: 'WEEK' }), 7);
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 1, periodUnit: 'MONTH' }), 30);
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 1, periodUnit: 'YEAR' }), 365);
  // Case is not guaranteed across SDK versions.
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 3, periodUnit: 'day' }), 3);
});

test('a discounted intro price is not called a free trial', () => {
  // An introductory OFFER can be a reduced price rather than a free period.
  // Advertising that as "free" is a false claim on a purchase screen.
  assert.equal(
    trialDaysFromIntroPrice({ price: 4.99, periodNumberOfUnits: 30, periodUnit: 'DAY' }),
    null,
  );
});

test('an unrecognised or malformed offer yields no trial rather than zero days', () => {
  // "Try 0 days free" is worse than saying nothing about a trial.
  assert.equal(trialDaysFromIntroPrice(null), null);
  assert.equal(trialDaysFromIntroPrice(undefined), null);
  assert.equal(trialDaysFromIntroPrice({}), null);
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 0, periodUnit: 'DAY' }), null);
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 7, periodUnit: 'FORTNIGHT' }), null);
  assert.equal(trialDaysFromIntroPrice({ price: 0, periodNumberOfUnits: 'seven', periodUnit: 'DAY' }), null);
});

// ── Offer-code redemption ───────────────────────────────────────────────────
//
// Subscription offer codes (the influencer month, the giveaway year) are
// redeemed on the App Store's own screen, not in the app — the in-app sheet
// fires no completion callback and fails silently, so the app opens Apple's
// URL and syncs the receipt when it foregrounds again.
//
// The heart of it is a comparison, not a boolean. Redemption happens where the
// app cannot watch, and the ONLY evidence it comes back to is what changed
// between a snapshot taken before the store opened and one taken after the
// receipt synced. Everything below tests that comparison and the copy built on
// it as pure functions; the two source checks at the end pin the wiring the
// Expo app has no runner to exercise.

test('the redeem URL is the App Store offer-code screen for this app', () => {
  // The id is Eddy's numeric Apple app ID, not the bundle identifier. Wrong
  // id means someone's code opens redemption for a different app.
  assert.equal(
    OFFER_CODE_REDEEM_URL,
    'https://apps.apple.com/redeem?ctx=offercodes&id=6794933267',
  );
});

/**
 * A CustomerInfo shaped the way react-native-purchases 10 returns one.
 *
 * The two halves are separate on purpose, because the SDK keeps them separate:
 * PurchasesEntitlementInfo carries the product and the dates,
 * `subscriptionsByProductIdentifier` carries the transaction id, and a fixture
 * that invented the second on the first would let a snapshot read a field the
 * real SDK never puts there.
 */
function customerInfo(
  entitlement: Record<string, unknown> | null,
  subscription: Record<string, unknown> | null = null,
) {
  const productIdentifier = entitlement?.productIdentifier;

  return {
    entitlements: { active: entitlement ? { eddy_premium: entitlement } : {} },
    subscriptionsByProductIdentifier:
      subscription && typeof productIdentifier === 'string'
        ? { [productIdentifier]: subscription }
        : {},
  };
}

const ACTIVE = {
  productIdentifier: 'eddy_premium_annual',
  expirationDate: '2027-01-01T00:00:00Z',
  latestPurchaseDate: '2026-01-01T00:00:00Z',
};

/** Results carry the post-sync snapshot; these tests only read status/entitled. */
function synced(status: 'changed' | 'unchanged', entitled: boolean) {
  return { status, entitled, snapshot: entitlementSnapshot(customerInfo(null)) } as const;
}

test('a snapshot reads the comparison keys, and survives a shape it does not know', () => {
  assert.deepEqual(
    entitlementSnapshot(customerInfo(ACTIVE, { storeTransactionId: '2000000123456789' })),
    {
      isActive: true,
      productIdentifier: 'eddy_premium_annual',
      expirationDate: '2027-01-01T00:00:00Z',
      latestPurchaseDate: '2026-01-01T00:00:00Z',
      storeTransactionId: '2000000123456789',
    },
  );

  // The transaction id comes from subscriptionsByProductIdentifier and NOWHERE
  // else. PurchasesEntitlementInfo has no such field in react-native-purchases
  // 10, so a snapshot that read it there had a fifth comparison key on paper
  // and four in fact — and a fixture that put it on the entitlement would have
  // agreed with the bug rather than caught it.
  assert.equal(
    entitlementSnapshot(customerInfo({ ...ACTIVE, storeTransactionId: '2000000123456789' }))
      .storeTransactionId,
    null,
  );

  // An entitlement with no matching subscription entry is ordinary, not broken.
  assert.equal(entitlementSnapshot(customerInfo(ACTIVE)).storeTransactionId, null);

  // No entitlement, and the two ways the SDK can hand back nothing at all.
  // A snapshot that throws here would take the whole return trip with it.
  for (const info of [customerInfo(null), null, undefined, {}]) {
    assert.deepEqual(entitlementSnapshot(info), {
      isActive: false,
      productIdentifier: null,
      expirationDate: null,
      latestPurchaseDate: null,
      storeTransactionId: null,
    });
  }
});

test('an existing subscriber who backs out of Apple’s screen has changed nothing', () => {
  // THE BUG THIS EXISTS FOR. The redeem control is offered to people who are
  // already subscribed, because App Store Connect can issue an offer to them.
  // Under the old boolean, an active entitlement WAS the success signal, so
  // cancelling out of the App Store confirmed a redemption that never happened.
  const before = entitlementSnapshot(customerInfo(ACTIVE));
  const after = entitlementSnapshot(customerInfo(ACTIVE));

  assert.equal(entitlementChanged(before, after), false);
  assert.equal(redemptionAlert(synced('unchanged', true), true), null);
});

test('a code that extends an existing subscription is a change', () => {
  // The other half of the same bug, pointed the other way: comparing
  // `isActive` alone would call this nothing happening, because an extension
  // offer leaves an active subscriber active. The dates are what move.
  const before = entitlementSnapshot(customerInfo(ACTIVE));
  const after = entitlementSnapshot(
    customerInfo({ ...ACTIVE, expirationDate: '2028-01-01T00:00:00Z' }),
  );

  assert.equal(entitlementChanged(before, after), true);
});

test('every comparison key on its own is enough to count as a change', () => {
  const before = entitlementSnapshot(customerInfo(ACTIVE));

  const moved: [Record<string, unknown>, Record<string, unknown> | null][] = [
    [{ ...ACTIVE, productIdentifier: 'eddy_premium_monthly' }, null],
    [{ ...ACTIVE, expirationDate: '2028-01-01T00:00:00Z' }, null],
    [{ ...ACTIVE, latestPurchaseDate: '2026-06-01T00:00:00Z' }, null],
    // Through subscriptionsByProductIdentifier, the only place it lives.
    [ACTIVE, { storeTransactionId: '2000000123456789' }],
  ];

  for (const [entitlement, subscription] of moved) {
    assert.equal(
      entitlementChanged(before, entitlementSnapshot(customerInfo(entitlement, subscription))),
      true,
    );
  }

  // And the transition that started this: nothing, then something.
  assert.equal(
    entitlementChanged(
      entitlementSnapshot(customerInfo(null)),
      entitlementSnapshot(customerInfo(ACTIVE)),
    ),
    true,
  );
});

test('a missing baseline never reports a change', () => {
  // The baseline read can fail — no native module, a throwing SDK. Absence of
  // evidence is not evidence: claiming a transaction nobody observed is the
  // exact failure this whole comparison exists to prevent.
  assert.equal(entitlementChanged(null, entitlementSnapshot(customerInfo(ACTIVE))), false);
});

test('a failed sync is told apart from someone who backed out', () => {
  // Both used to return `false` and both got silence, so a valid code plus a
  // dropped connection looked exactly like a cancellation and said nothing.
  const cancelled = redemptionAlert(synced('unchanged', false), false);
  assert.equal(cancelled, null);

  const failed = redemptionAlert({ status: 'error' }, false);
  assert.ok(failed, 'a failed check has to say so');
  // It must not imply the code was wasted, and it must leave a next step.
  assert.match(failed.message, /safe on your Apple ID/);
  assert.match(failed.message, /Restore purchases/);
});

test('the confirmation never claims a code was accepted', () => {
  // An ordinary renewal or a recovered billing problem moves the same fields,
  // and Apple's codes are not all immediate extensions. The app sees that the
  // subscription CHANGED; the offer identifier reaches only the webhook, so
  // "Code redeemed" is a claim this screen is not in a position to make.
  for (const serverConfirmed of [true, false]) {
    const alert = redemptionAlert(synced('changed', true), serverConfirmed);
    assert.ok(alert);
    assert.equal(alert.title, 'Subscription updated');
    assert.doesNotMatch(alert.title + alert.message, /code redeemed/i);
  }
});

test('a confirmation waits for the server before saying Premium is on', () => {
  // The SDK is not the authority — the card reads from the server, which
  // learns through RevenueCat's webhook. Saying "active" before the backend
  // agrees is how a card reads "no subscription" a beat after the good news.
  const live = redemptionAlert(synced('changed', true), true);
  assert.match(live!.message, /active on your account/);

  const pending = redemptionAlert(synced('changed', true), false);
  assert.match(pending!.message, /take a moment/);
  assert.doesNotMatch(pending!.message, /active on your account/);

  // Something moved and there is still no entitlement. Rare, and it must not
  // borrow either of the messages above.
  const notEntitled = redemptionAlert(synced('changed', false), false);
  assert.match(notEntitled!.message, /no active subscription/);
});

test('both redeem surfaces open the URL and sync against a baseline', () => {
  for (const path of [
    '../eddy-ios/src/components/PaywallSheet.tsx',
    '../eddy-ios/app/(tabs)/profile.tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    // Awaited, not fired and forgotten: the open rejects where the App Store
    // is unreachable, and the pending flag has to come back off when it does.
    assert.match(source, /await Linking\.openURL\(OFFER_CODE_REDEEM_URL\)/);
    // The baseline is captured BEFORE the store opens. RevenueCat observes
    // StoreKit itself and can refresh CustomerInfo as the app foregrounds, so
    // a baseline read on the return trip may already hold the redemption.
    assert.match(source, /redeemBaseline\.current = await readEntitlementSnapshot\(\)/);
    assert.match(source, /syncRedeemedPurchases\(before\)/);
    // The sync runs on the RETURN TRIP, not on a timer or a tap — the
    // AppState listener is what makes redemption in another app land here.
    assert.match(source, /AppState\.addEventListener\('change'/);
    // And the SDK's view is not the verdict: the server is re-read before
    // anything is claimed or unlocked. Either arity — the paywall asks the
    // default question (is there an entitlement at all), Profile passes a
    // predicate that asks the stricter one (has THIS change landed).
    assert.match(source, /waitForEntitlement\(token[,)]/);
  }

  // And Profile is the one that must ask the stricter question, because it is
  // the one making a claim about what changed.
  const profile = readFileSync('../eddy-ios/app/(tabs)/profile.tsx', 'utf8');
  assert.match(profile, /until: \(entitlement\) => entitlementMatchesSnapshot\(entitlement, target\)/);
});

test('the redeem controls are signed-in only, like every purchase control', () => {
  // The entitlement a code grants arrives through the receipt and must land
  // on a real account — the same identity guard the purchase flow enforces.
  // In the paywall the link lives inside the existing `signedIn ?` footer
  // block beside Restore; in Profile the button carries its own guard.
  const profile = readFileSync('../eddy-ios/app/(tabs)/profile.tsx', 'utf8');
  assert.match(profile, /\{signedIn && \([\s\S]{0,400}handleRedeem/);

  const paywall = readFileSync('../eddy-ios/src/components/PaywallSheet.tsx', 'utf8');
  const footer = paywall.slice(paywall.indexOf('footerLinks'));
  assert.match(footer, /\{signedIn \? \([\s\S]*handleRedeem[\s\S]*\) : null\}/);
});

test('the server is polled for THIS change, not for any entitlement at all', () => {
  // An existing subscriber is already active server-side, so "is there an
  // entitlement" is satisfied on the first poll — before the webhook has
  // written the extension. Confirming against that reads back the renewal date
  // they had BEFORE they redeemed, under a line saying it was updated.
  const target = entitlementSnapshot(
    customerInfo({ ...ACTIVE, expirationDate: '2028-01-01T00:00:00Z' }),
  );

  const server = (over: Partial<MeEntitlement> = {}): MeEntitlement => ({
    entitlementId: 'eddy_premium',
    isActive: true,
    expiresAt: '2027-01-01T00:00:00Z',
    willRenew: true,
    productId: 'eddy_premium_annual',
    billingIssue: false,
    ...over,
  });

  // Active, right product, stale expiry — the exact state the old check passed.
  assert.equal(entitlementMatchesSnapshot(server(), target), false);
  // The webhook lands.
  assert.equal(entitlementMatchesSnapshot(server({ expiresAt: '2028-01-01T00:00:00Z' }), target), true);
  // Further out than the SDK saw is still caught up — a renewal on top of it.
  assert.equal(entitlementMatchesSnapshot(server({ expiresAt: '2029-01-01T00:00:00Z' }), target), true);

  // A different product is a different subscription, however far out it runs.
  assert.equal(
    entitlementMatchesSnapshot(
      server({ expiresAt: '2029-01-01T00:00:00Z', productId: 'eddy_premium_monthly' }),
      target,
    ),
    false,
  );

  // Nothing to compare against is never a confirmation.
  assert.equal(entitlementMatchesSnapshot(null, target), false);
  assert.equal(entitlementMatchesSnapshot(server({ isActive: false }), target), false);
  assert.equal(entitlementMatchesSnapshot(server({ expiresAt: null }), target), false);

  // A target with no expiry to reach falls back to the product being live.
  const noExpiry = entitlementSnapshot(customerInfo({ ...ACTIVE, expirationDate: undefined }));
  assert.equal(entitlementMatchesSnapshot(server(), noExpiry), true);
});

test('every identity and purchase control is gated on the whole busy state', () => {
  // Restore and Redeem both sync receipts and both end in an alert; Sign out
  // changes the identity the receipt would land on; Get Eddy Premium opens a
  // second purchase flow with its own busy state and its own receipt-sync
  // listener. Any two of them at once is a race.
  //
  // Asserted control by control. The negative form this replaces — "no
  // `disabled={busy === }` survives" — passed just as happily with every
  // `disabled` prop deleted, which is the opposite of what it was pinning.
  const profile = readFileSync('../eddy-ios/app/(tabs)/profile.tsx', 'utf8');

  const control = (onPress: string): string => {
    const at = profile.indexOf(onPress);
    assert.notEqual(at, -1, `Profile has no control with ${onPress}`);
    const open = profile.lastIndexOf('<Pressable', at);
    const close = profile.indexOf('</Pressable>', at);
    assert.ok(open !== -1 && close !== -1, `${onPress} is not inside a Pressable`);
    return profile.slice(open, close);
  };

  for (const onPress of [
    'onPress={handleSignOut}',
    'onPress={() => setPaywallOpen(true)}',
    'onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)}',
    'onPress={handleRestore}',
    'onPress={() => void handleRedeem()}',
    'onPress={handleDelete}',
  ]) {
    assert.match(control(onPress), /disabled=\{busy !== null\}/, `${onPress} is not gated`);
  }

  // Apple's own button takes no `disabled` prop, and the HIG requires the real
  // control rather than a facsimile that would — so its wrapper is the gate.
  // It IS reachable mid-operation: Restore is offered to people who are not
  // signed in, which is exactly when this button renders.
  assert.match(profile, /pointerEvents=\{busy === null \? 'auto' : 'none'\}/);

  // And nothing may go back to gating on its own operation alone.
  assert.doesNotMatch(profile, /disabled=\{busy === /);
});

test('a billing problem outranks the renewal date', () => {
  // It is the only state the user can still act on before losing access, so it
  // must not be buried under a reassuring "Renews 1 June".
  const summary = subscriptionSummary({
    entitlementId: 'eddy_premium',
    isActive: true,
    expiresAt: '2027-06-01T00:00:00.000Z',
    willRenew: true,
    productId: 'annual',
    billingIssue: true,
  });
  assert.match(summary, /problem with your payment method/i);
  assert.doesNotMatch(summary, /renews/i);
});

test('a cancelled-but-live subscription says it ends, not that it renews', () => {
  const summary = subscriptionSummary({
    entitlementId: 'eddy_premium',
    isActive: true,
    expiresAt: '2027-06-01T00:00:00.000Z',
    willRenew: false,
    productId: 'annual',
    billingIssue: false,
  });
  assert.match(summary, /^Ends /);
});

test('no entitlement reads as no subscription', () => {
  assert.equal(subscriptionSummary(null), 'No active subscription');
  assert.equal(
    subscriptionSummary({
      entitlementId: 'eddy_premium',
      isActive: false,
      expiresAt: '2020-01-01T00:00:00.000Z',
      willRenew: false,
      productId: 'annual',
      billingIssue: false,
    }),
    'No active subscription',
  );
});

// ── Restore purchases ────────────────────────────────────────────

test('a failed restore is never reported as an empty one', () => {
  // These were the same alert. "Nothing to restore" over a dropped connection
  // tells a paying customer they never paid — the one wrong answer here.
  const failed = restoreAlert(
    { ok: false, entitled: false, message: 'Eddy could not reach the App Store.' },
    false,
  );
  assert.equal(failed.title, 'Could not restore');
  assert.doesNotMatch(failed.title, /nothing/i);

  const empty = restoreAlert({ ok: true, entitled: false, message: 'No subscription found.' }, false);
  assert.equal(empty.title, 'Nothing to restore');
});

test('the SDK finding a subscription is not enough to claim it is restored', () => {
  // The server is the authority on entitlement (purchases.ts header). Claiming
  // success on the SDK's word alone is how the alert says "restored" over a
  // Profile card that still reads "No active subscription" — which is exactly
  // what a restore after account deletion did.
  const found: Parameters<typeof restoreAlert>[0] = {
    ok: true,
    entitled: true,
    message: 'Your subscription is restored.',
  };

  const confirmed = restoreAlert(found, true);
  assert.equal(confirmed.title, 'Subscription restored');

  const pending = restoreAlert(found, false);
  assert.notEqual(pending.title, 'Subscription restored');
  // It must not read as a refusal either — the purchase is real and Apple has
  // confirmed it — and it has to leave a way out.
  assert.doesNotMatch(pending.title + pending.message, /no subscription found/i);
  assert.match(pending.message, /App Store confirms/);
  assert.match(pending.message, /support/);
});

test('both restore surfaces reconcile with the server before claiming anything', () => {
  for (const path of [
    '../eddy-ios/src/components/PaywallSheet.tsx',
    '../eddy-ios/app/(tabs)/profile.tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    // A restore onto an account that did not buy — anyone who deleted their
    // account and signed in again — arrives at the server as a TRANSFER, which
    // carries no entitlement state. Polling alone can wait that out forever, so
    // the reconcile has to be asked for first.
    assert.match(source, /await refreshEntitlement\(token\)/);
    assert.match(source, /serverConfirmed = await waitForEntitlement\(token\)/);
    // And the alert is the shared one, so neither screen can drift back into
    // titling a failure "Nothing to restore".
    assert.match(source, /restoreAlert\(result, /);
  }
});

test('the receipt-in-use branch reads the SDK enum instead of a written-down code', () => {
  // These codes are consecutive small integers with no mnemonic value and the
  // neighbours are traps: 7 is the one this wants, 8 is INVALID_RECEIPT, and 9
  // — one position away, and where this branch first landed — is
  // MISSING_RECEIPT_FILE. Off by one does not fail loudly. It shows the wrong
  // sentence to the one person who needs the right one.
  const codes = {
    RECEIPT_ALREADY_IN_USE_ERROR: '7',
    RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR: '13',
  };

  assert.equal(receiptBelongsToAnotherAccount({ code: '7' }, codes), true);
  assert.equal(receiptBelongsToAnotherAccount({ code: '13' }, codes), true);
  // The value arrives from native code and has been a number in past versions.
  assert.equal(receiptBelongsToAnotherAccount({ code: 7 }, codes), true);

  // MISSING_RECEIPT_FILE_ERROR, INVALID_RECEIPT_ERROR, NETWORK_ERROR: real
  // failures that must keep the "could not reach the App Store" message.
  for (const code of ['9', '8', '10', '', undefined, null]) {
    assert.equal(receiptBelongsToAnotherAccount({ code }, codes), false, `code ${code}`);
  }

  // No enum means the native module is absent, and a restore cannot have run.
  assert.equal(receiptBelongsToAnotherAccount({ code: '7' }, null), false);
  assert.equal(receiptBelongsToAnotherAccount({}, codes), false);

  // And the source reads the enum off the module rather than restating it.
  const purchases = readFileSync('../eddy-ios/src/lib/purchases.ts', 'utf8');
  assert.match(purchases, /loadPurchasesModule\(\)\?\.PURCHASES_ERROR_CODE/);
});

test('the SDK still exports both receipt-in-use codes under those names', () => {
  // Reads the installed types when they are there. CI's web job installs only
  // missouri-float-planner, so this is skipped rather than imported — a value
  // import from eddy-ios/node_modules is the MODULE_NOT_FOUND documented in
  // tsconfig.test.json. Local runs and the mobile checkout still catch a rename.
  let declaration: string;
  try {
    declaration = readFileSync(
      '../eddy-ios/node_modules/@revenuecat/purchases-typescript-internal/dist/generated/error-codes.d.ts',
      'utf8',
    );
  } catch {
    return; // the Expo app is not installed in this checkout
  }

  assert.match(declaration, /RECEIPT_ALREADY_IN_USE_ERROR = "\d+"/);
  assert.match(declaration, /RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR = "\d+"/);
  // The trap, asserted so a future SDK renumbering shows up here as a diff
  // rather than as a wrong alert in someone's hands.
  assert.match(declaration, /MISSING_RECEIPT_FILE_ERROR = "9"/);
  assert.match(declaration, /RECEIPT_ALREADY_IN_USE_ERROR = "7"/);
});
