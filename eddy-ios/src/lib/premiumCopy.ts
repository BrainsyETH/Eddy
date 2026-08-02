// eddy-ios/src/lib/premiumCopy.ts
// Every word the app uses to sell Eddy Premium, in one place.
//
// ── Why this is centralised when nothing else about the paywall is ──────────
//
// The pitch lived inline in two components and drifted, exactly as inline copy
// does. The paywall sheet was cleaned up once to stop selling free features;
// the gauge screen's version was not, so the app shipped two different answers
// to "what does a subscription get me" — one of which still listed offline maps
// after they were removed. Neither surface could have caught the other.
//
// So the strings live here and both surfaces read them. Same pattern as
// notificationCopy.ts, readingCopy.ts, safetyCopy.ts and alertCopy.ts: pure,
// separate from the screen, and exercised by the web suite (the Expo app has no
// test runner of its own).
//
// ── The rule this file enforces ─────────────────────────────────────────────
//
// NAME ONLY WHAT IS ACTUALLY GATED. Grep the app for entitlement checks and
// there is exactly one: EddyTake, the written read on a river. That is the
// list. It is not a stylistic preference — a subscription page that advertises
// something the reader already has is both a lie and a bad trade, and this
// paywall has made that mistake twice:
//
//   * It sold "a push when a river becomes floatable" and "follow as many
//     rivers as you like" when both were free.
//   * It sold "the last 72 hours and weather ahead" when GaugeChart has no
//     entitlement check at all and EddyTake's own header says the Bottom line
//     and Weather are safety calls that stay free.
//   * It sold the offline map download, which no longer exists.
//
// premium-copy.test.ts asserts no entry here mentions a free capability, so the
// next attempt fails a test rather than shipping.
//
// ── What is never gated ─────────────────────────────────────────────────────
//
// Conditions, gauge readings, hazards, alerts, and the float plan. Safety data
// behind a paywall is a liability, and the free tier is the whole funnel.

export interface PremiumBenefit {
  /** An EddySymbol name — see src/components/EddySymbol.tsx. */
  symbol: string;
  symbolSize?: number;
  title: string;
  body: string;
}

/**
 * The one thing a subscription buys, plus the thanks.
 *
 * Two entries, and the shortness is the point. A list padded to four with
 * things that are free reads as generous and is the opposite; a list of one
 * real thing is a trade someone can actually evaluate.
 */
export const PREMIUM_BENEFITS: PremiumBenefit[] = [
  {
    symbol: 'eddyRated',
    title: "Eddy's daily take",
    body: "The full written report on the river — what the water is doing and why — rewritten every morning. The bottom line stays free.",
  },
  {
    symbol: 'heart',
    symbolSize: 30,
    title: 'Thank you for supporting Eddy',
    // The approved gratitude line used to enumerate "the gauges, the maps and
    // the alerts", which reads as a feature list on a page whose whole problem
    // has been listing free features as paid ones. Naming the infrastructure
    // instead says the same thing and is truer: a subscription pays for what
    // everyone here uses, whether or not they pay.
    body: 'Eddy is built by one person. Your subscription pays for the servers and river data everyone here uses — subscribers and not.',
  },
];

/** The paywall's headline. */
export const PREMIUM_TITLE = 'More than a number';

/**
 * The paywall's subtitle, named for the river when we know it.
 *
 * It used to promise "a map that still works when the signal doesn't", which
 * described the removed download. What survives losing signal is now free and
 * automatic, so promising it here would be selling the free product again.
 */
export function premiumSubtitle(riverName?: string | null): string {
  return riverName
    ? `Eddy's full read on the ${riverName} — what the water is doing, and why.`
    : "Eddy's full read on your rivers — what the water is doing, and why.";
}

/**
 * The short pitch on the gauge screen.
 *
 * Same promise as the sheet it opens, in one sentence. It said something
 * different for months, which is the reason this module exists.
 */
export function premiumPitch(riverName?: string | null): string {
  return riverName
    ? `Get Eddy's full written read on ${riverName}, rewritten every morning.`
    : "Unlock Eddy's full written read on your rivers, rewritten every morning.";
}

/**
 * What a subscription does NOT gate, said on the paywall itself.
 *
 * A subscription page that is straight about what is free is the only kind
 * worth trusting about what is not.
 */
export const PREMIUM_FREE_NOTE =
  'River conditions, gauge readings, hazard information, alerts and float plans are always free — and the last ones you saw stay on your phone when the signal goes.';

/**
 * Forecast uncertainty, on the screen that takes money for the outlook.
 *
 * A general river disclaimer does not say this. purchase-copy.test.ts asserts
 * this sentence reaches the paywall.
 */
export const PREMIUM_FORECAST_CAVEAT =
  'The outlook is a forecast, not a promise. Conditions can change before your trip.';
