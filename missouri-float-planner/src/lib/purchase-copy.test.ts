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
  assert.equal(packagePriceLabel(pkg({ priceString: '$69.99' })), '$69.99/yr');
  assert.equal(packagePriceLabel(monthlyPkg({ priceString: '$9.99' })), '$9.99/mo');
  // An unrecognised package type has no period to name, so it names none
  // rather than guessing one.
  assert.equal(packagePriceLabel(pkg({ period: null, priceString: '$5.00' })), '$5.00');
});

// ── The derived monthly figure ──────────────────────────────────────────────

test('an annual plan is quoted per month AND labelled as billed annually', () => {
  // The per-month figure is the whole point of the row — $69.99 beside $9.99
  // reads as expensive beside cheap — but it is not what anyone is charged, so
  // it may never appear without "billed annually" beside it.
  const cadence = packageCadence(pkg({ priceString: '$69.99', priceAmount: 69.99 }));
  assert.match(String(cadence), /5[.,]83/);
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
  const percent = annualSavingsPercent(
    pkg({ priceAmount: 71.88 }),
    monthlyPkg({ priceAmount: 7.99 }),
  );
  assert.equal(percent, 25);
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
  const [annual, monthly] = annotateSavings([
    pkg({ priceAmount: 71.88 }),
    monthlyPkg({ priceAmount: 7.99 }),
  ]);
  assert.equal(annual.savingsPercent, 25);
  assert.equal(savingsLabel(annual), '25% off');

  // The monthly plan is the baseline; it cannot be a discount on itself.
  assert.equal(monthly.savingsPercent, null);
  assert.equal(savingsLabel(monthly), null);

  // An offering with no monthly plan has nothing to compare against.
  const [alone] = annotateSavings([pkg({ priceAmount: 71.88 })]);
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
