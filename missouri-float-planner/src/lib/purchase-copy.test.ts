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
import {
  packageCta,
  PREMIUM_UNAVAILABLE_COPY,
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
    trialDays: null,
    period: 'year',
    recommended: true,
    raw: {},
    ...overrides,
  };
}

test('a free trial states the price it turns into', () => {
  // "7 days free" on its own reads as a gift rather than the start of a
  // subscription, and Apple requires the follow-on terms to be legible here.
  assert.equal(
    packageCta(pkg({ trialDays: 7 })),
    'Try 7 days free — then $19.99/year',
  );
});

test('no trial shows the plan, the price and the period', () => {
  assert.equal(packageCta(pkg({ title: 'Monthly', period: 'month', priceString: '$1.99' })),
    'Monthly · $1.99/month');
});

test('a missing price never renders as an empty or bare button', () => {
  // The store failing to return a price is rare but real. A button reading
  // "Yearly · " would be worse than one that simply names the plan.
  assert.equal(packageCta(pkg({ priceString: '' })), 'Yearly');
  assert.equal(packageCta(pkg({ priceString: '', trialDays: 7 })), 'Yearly');
});

test('empty offerings produce a safe customer-facing unavailable state', () => {
  assert.deepEqual(unavailableOfferings(), { status: 'unavailable', packages: [] });
  assert.equal(PREMIUM_UNAVAILABLE_COPY, "Premium isn't available right now.");
  assert.doesNotMatch(PREMIUM_UNAVAILABLE_COPY, /configuration|sdk|revenuecat|storekit/i);
});

test('the localised price string is passed through untouched', () => {
  // Never reconstructed from a number: storefronts differ in symbol, placement
  // and separator, and Apple charges what IT says, not what we format.
  assert.match(packageCta(pkg({ priceString: '£17,99' })), /£17,99/);
  assert.match(packageCta(pkg({ priceString: '¥3,000' })), /¥3,000/);
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
