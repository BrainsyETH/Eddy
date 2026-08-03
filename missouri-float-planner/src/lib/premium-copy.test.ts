import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PREMIUM_BENEFITS,
  PREMIUM_LOCK_TITLE,
  PREMIUM_TITLE,
  premiumPitch,
  premiumSubtitle,
} from '../../../eddy-ios/src/lib/premiumCopy';

// The paywall has advertised free features twice, in both directions, on one
// screen — see the header of premiumCopy.ts for the history. These tests are
// what make the third time fail here instead of in the App Store.

/**
 * Capabilities Eddy does NOT gate. Grep the app for entitlement checks and
 * there is exactly one, on Eddy's written read; everything below is free, and
 * naming any of it on a subscription page is both a lie and a bad trade.
 *
 * `offline` and the map download are on the list for a different reason: they
 * no longer exist at all.
 */
const NEVER_SOLD = [
  /\balerts?\b/i,
  /\bpush\b/i,
  /\bnotification/i,
  /\bhazard/i,
  /\bgauge readings?\b/i,
  /\boffline\b/i,
  /\bdownload/i,
  /72[- ]hour/i,
  /\bfloat plan/i,
];

function benefitText(): string {
  return PREMIUM_BENEFITS.map((b) => `${b.title} ${b.body}`).join('\n');
}

test('the benefit list names something, and names it once', () => {
  assert.ok(PREMIUM_BENEFITS.length > 0, 'a paywall with no benefits sells nothing');
  const titles = PREMIUM_BENEFITS.map((b) => b.title);
  assert.equal(new Set(titles).size, titles.length, 'duplicate benefit titles');
  for (const benefit of PREMIUM_BENEFITS) {
    assert.ok(benefit.title.trim().length > 0);
    assert.ok(benefit.body.trim().length > 0);
    assert.ok(benefit.symbol.trim().length > 0);
  }
});

test('no benefit sells a capability that is free', () => {
  // THE test. Every pattern below has been on this paywall at some point while
  // the thing it named was free to everyone.
  const text = benefitText();
  for (const pattern of NEVER_SOLD) {
    assert.doesNotMatch(text, pattern, `benefits must not advertise ${pattern}`);
  }
});

test('the headline and both subtitles avoid the same claims', () => {
  const text = [
    PREMIUM_TITLE,
    premiumSubtitle(null),
    premiumSubtitle('Huzzah Creek'),
    premiumPitch(null),
    premiumPitch('Huzzah Creek'),
  ].join('\n');
  for (const pattern of NEVER_SOLD) {
    assert.doesNotMatch(text, pattern, `the pitch must not advertise ${pattern}`);
  }
});

test('the river-specific and generic pitches say the same thing', () => {
  // They drifted for months — the gauge screen kept listing offline maps and
  // 72-hour trends after the paywall sheet had stopped. Both forms now come
  // from one function, and both must name the written read.
  for (const text of [premiumSubtitle(null), premiumSubtitle('Huzzah Creek')]) {
    assert.match(text, /read/i);
  }
  for (const text of [premiumPitch(null), premiumPitch('Huzzah Creek')]) {
    assert.match(text, /read/i);
  }
  assert.match(premiumSubtitle('Huzzah Creek'), /Huzzah Creek/);
  assert.match(premiumPitch('Huzzah Creek'), /Huzzah Creek/);
});

test('the lock row names the product AND the action', () => {
  // Two earlier titles each got one half. "Unlock Eddy's take" was all
  // mechanism — what the button does, in Eddy's word for the thing rather than
  // the reader's. "A daily report on your favorite river" was all product: a
  // good description sitting on a control with nothing to say it was a control.
  assert.match(PREMIUM_LOCK_TITLE, /daily/i, 'must say how often it arrives');
  assert.match(PREMIUM_LOCK_TITLE, /report/i, 'must say what the thing is');
  assert.match(PREMIUM_LOCK_TITLE, /unlock/i, 'must read as something you can tap');
  assert.match(PREMIUM_LOCK_TITLE, /premium/i, 'must name the subscription it buys');
});

test('the lock row does not advertise anything free', () => {
  // Same rule as the benefit list, applied to the surface that broke it first.
  // The row is a single string now, which is the whole of what it may claim.
  for (const pattern of NEVER_SOLD) {
    assert.doesNotMatch(
      PREMIUM_LOCK_TITLE,
      pattern,
      `the lock row must not advertise ${pattern}`,
    );
  }
});

test('the lock row is ONE line', () => {
  // It carried a title, a body naming the three sections, and a note about what
  // stays free. Every one was defensible alone; together they made the smallest
  // control on the screen the wordiest thing on it. The body in particular read
  // the screen back to the reader — EDDY'S READ, WEATHER and BOTTOM LINE are
  // directly above it, sharp, in the same card.
  //
  // Asserted against the component rather than the constants, because the way
  // this regresses is a second <Text> appearing in the row, not a new export.
  const take = readFileSync('../eddy-ios/src/components/EddyTake.tsx', 'utf8');
  const row = take.slice(take.indexOf('accessibilityLabel={PREMIUM_LOCK_TITLE}'));
  const body = row.slice(0, row.indexOf('</Pressable>'));
  assert.equal(
    (body.match(/<Text/g) ?? []).length,
    1,
    'the lock row renders exactly one line of copy',
  );
});

test('EddyTake reads the lock copy rather than holding its own', () => {
  // The third surface, and the last one to be inlined. It drifted the same way
  // the other two did and for the same reason: nothing could see it.
  const take = readFileSync('../eddy-ios/src/components/EddyTake.tsx', 'utf8');
  assert.match(take, /from '@\/lib\/premiumCopy'/);
  assert.match(take, /PREMIUM_LOCK_TITLE/);
});

test('no paywall surface enumerates what is free', () => {
  // ── The reversal, and why it is not a loss of honesty ──────────────────
  //
  // Both surfaces used to list what a subscription does NOT gate: the sheet at
  // length (conditions, readings, the trend, hazards, alerts, float plans, and
  // that the last ones you saw stay on the phone) and the lock row in short.
  // The instinct was right — a paywall straight about the free half is the only
  // kind worth trusting about the paid one — and the placement was wrong. It
  // was a seven-item feature list in small grey type on the screen where
  // somebody has already decided to look at the price, spending that moment
  // enumerating reasons not to pay.
  //
  // What actually keeps this honest survives untouched and is tested above:
  // nothing on either surface may NAME a free capability. The Terms say what is
  // free at length, where it is a commitment rather than a sales aside.
  const paywall = readFileSync('../eddy-ios/src/components/PaywallSheet.tsx', 'utf8');
  const take = readFileSync('../eddy-ios/src/components/EddyTake.tsx', 'utf8');
  for (const source of [paywall, take]) {
    assert.doesNotMatch(source, /PREMIUM_FREE_NOTE/);
    assert.doesNotMatch(source, /PREMIUM_LOCK_FREE_NOTE/);
  }
});

test('the gratitude line thanks without itemising', () => {
  // Two earlier versions justified the price instead: one listed "the gauges,
  // the maps and the alerts" — free features, on the page whose entire history
  // of mistakes is exactly that — and the next named the servers and the river
  // data, which is true but is still a receipt.
  const thanks = PREMIUM_BENEFITS.find((b) => /thank/i.test(b.title));
  assert.ok(thanks, 'the benefit list still carries the thanks');
  assert.match(thanks.body, /one person/i);
  assert.doesNotMatch(thanks.body, /server/i, 'gratitude does not need an invoice');
});

test('both paywall surfaces read from the shared copy', () => {
  // The reason this module exists. Either surface holding its own string is
  // how the two came to disagree, and neither could have caught the other.
  const paywall = readFileSync('../eddy-ios/src/components/PaywallSheet.tsx', 'utf8');
  assert.match(paywall, /from '@\/lib\/premiumCopy'/);
  assert.match(paywall, /PREMIUM_BENEFITS/);
  assert.match(paywall, /premiumSubtitle\(/);

  const gauge = readFileSync('../eddy-ios/app/gauge/[siteId].tsx', 'utf8');
  assert.match(gauge, /from '@\/lib\/premiumCopy'/);
  assert.match(gauge, /premiumPitch\(/);
});

test('no iOS surface still claims Premium includes alerts or offline maps', () => {
  // Same shape as safety-copy.test.ts's retired-copy walk: the point is not
  // that today's files are clean, it is that a reintroduction fails a test.
  const surfaces = [
    '../eddy-ios/src/components/PaywallSheet.tsx',
    '../eddy-ios/app/gauge/[siteId].tsx',
    '../eddy-ios/app/(tabs)/profile.tsx',
    '../eddy-ios/src/components/EddyTake.tsx',
  ];
  const retired = [
    /Unlock Eddy's daily river reads, 72-hour trends/i,
    /a map that still works when the signal doesn't/i,
    /offline maps? (are|is) (a )?(paid|premium)/i,
  ];
  for (const path of surfaces) {
    const source = readFileSync(path, 'utf8');
    for (const pattern of retired) {
      assert.doesNotMatch(source, pattern, `${path} still carries retired copy ${pattern}`);
    }
  }
});
