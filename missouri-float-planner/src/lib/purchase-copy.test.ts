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
import {
  annotateSavings,
  annualSavingsPercent,
  OFFER_CODE_REDEEM_URL,
  packageCadence,
  packageCta,
  packagePriceLabel,
  packageTerms,
  perMonthPriceString,
  PREMIUM_UNAVAILABLE_COPY,
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
// URL and syncs the receipt when it foregrounds again. These tests pin the
// URL itself and, in the style of the render checks above, that both surfaces
// actually run the flow: a redemption whose receipt is never synced is a free
// month RevenueCat has not heard about and a paywall still up for someone who
// just redeemed.

test('the redeem URL is the App Store offer-code screen for this app', () => {
  // The id is Eddy's numeric Apple app ID, not the bundle identifier. Wrong
  // id means someone's code opens redemption for a different app.
  assert.equal(
    OFFER_CODE_REDEEM_URL,
    'https://apps.apple.com/redeem?ctx=offercodes&id=6794933267',
  );
});

test('both redeem surfaces open the URL and sync the receipt on return', () => {
  for (const path of [
    '../eddy-ios/src/components/PaywallSheet.tsx',
    '../eddy-ios/app/(tabs)/profile.tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /Linking\.openURL\(OFFER_CODE_REDEEM_URL\)/);
    assert.match(source, /syncRedeemedPurchases\(\)/);
    // The sync runs on the RETURN TRIP, not on a timer or a tap — the
    // AppState listener is what makes redemption in another app land here.
    assert.match(source, /AppState\.addEventListener\('change'/);
    // And the SDK's view is not the verdict: the server is re-read before
    // anything is claimed or unlocked.
    assert.match(source, /waitForEntitlement\(token\)/);
  }
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
