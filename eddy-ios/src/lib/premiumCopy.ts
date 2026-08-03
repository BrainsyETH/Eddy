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
// there is exactly one: EddyTake — and since Aug 2026 it gates the whole card,
// the written read, the weather paragraph and the bottom line together. That is
// the list. It is not a stylistic preference — a subscription page that advertises
// something the reader already has is both a lie and a bad trade, and this
// paywall has made that mistake twice:
//
//   * It sold "a push when a river becomes floatable" and "follow as many
//     rivers as you like" when both were free.
//   * It sold "the last 72 hours and weather ahead" when the 72-hour strip has
//     never had an entitlement check and is rendered before the gate on
//     purpose. What IS sold is Eddy's writing about the forecast, which is a
//     different thing and has to be worded as one.
//   * It sold the offline map download, which no longer exists.
//
// premium-copy.test.ts asserts no entry here mentions a free capability, so the
// next attempt fails a test rather than shipping.
//
// ── What is never gated ─────────────────────────────────────────────────────
//
// Conditions, gauge readings, the trend, hazards, agency notices, the 72-hour
// forecast strip, alerts, and the float plan. Safety data behind a paywall is a
// liability, and the free tier is the whole funnel. Note the split the weather
// bullet below has to respect: the forecast NUMBERS are free, Eddy's reading of
// them is not.

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
 * The whole of Eddy's take, in the two halves a reader would name separately,
 * plus the thanks. The shortness is the point: a list padded out with things
 * that are free reads as generous and is the opposite.
 */
export const PREMIUM_BENEFITS: PremiumBenefit[] = [
  {
    symbol: 'eddyRated',
    title: "Eddy's take on every river",
    body: "The full written report — what the water is doing, what the weather is about to do to it, and Eddy's bottom line. Rewritten every morning.",
  },
  {
    symbol: 'weather',
    title: 'What the forecast means for the water',
    body: 'Not a weather app — the rain, the heat and the river trend read together into one call on whether it holds.',
  },
  {
    symbol: 'heart',
    symbolSize: 30,
    title: 'Thank you for supporting Eddy',
    // Two earlier versions of this line went the wrong way for the same reason:
    // they tried to justify the price. One enumerated "the gauges, the maps and
    // the alerts", which is a feature list on a page whose entire history of
    // mistakes is listing free features as paid ones; the next named the
    // servers and the river data, which is truer but is still an itemised bill.
    //
    // Gratitude does not need a receipt attached. Who builds it and what the
    // money does, in two clauses, and then stop.
    body: 'Eddy is built by one person. Your subscription helps keep the app going.',
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

// ── The lock row on the river and gauge screens ─────────────────────────────
//
// Written inline in EddyTake.tsx once, which is precisely the arrangement this
// module exists to end: the gauge screen's pitch and the paywall sheet's pitch
// drifted for months because neither surface could see the other. The lock row
// was a third surface making the same mistake in slower motion.
//
// ── It is ONE LINE now, and it used to be three ─────────────────────────────
//
// A title, a body naming the three sections, and a note about what stays free.
// All three were defensible on their own and together they made the smallest
// control on the screen the wordiest thing on it — three stacked paragraphs
// under a blurred report, in a row whose entire job is to be tapped.
//
// The body went because the headings it named — EDDY'S READ, WEATHER, BOTTOM
// LINE — are directly above it, sharp, in the same card. It was reading the
// screen back to the reader.

/**
 * The offer, in a phrase.
 *
 * Names the product AND the action, which is the balance two earlier versions
 * each missed in opposite directions. "Unlock Eddy's take" was all mechanism:
 * it said what the button does rather than what you get, in Eddy's word for it
 * rather than the reader's. "A daily report on your favorite river" was all
 * product: a good description of the thing, sitting on a control with nothing
 * to say that it was a control. This is both, and the subscription is named,
 * so the row and the sheet it opens agree about what is being bought.
 */
export const PREMIUM_LOCK_TITLE =
  'Unlock Eddy Premium to get a daily report on your favorite river';

/**
 * Forecast uncertainty, on the screen that takes money for the outlook.
 *
 * A general river disclaimer does not say this. purchase-copy.test.ts asserts
 * this sentence reaches the paywall.
 */
export const PREMIUM_FORECAST_CAVEAT =
  'The outlook is a forecast, not a promise. Conditions can change before your trip.';
