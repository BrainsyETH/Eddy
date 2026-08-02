import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PREMIUM_BENEFITS,
  PREMIUM_FREE_NOTE,
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

test('the free note names what a subscription does not gate', () => {
  // Being straight about what is free is the only thing that makes a paywall
  // trustworthy about what is not — and this note is the sheet's one place to
  // say so, which is why the NEVER_SOLD list deliberately does not apply here.
  for (const pattern of [/conditions/i, /readings/i, /hazard/i, /alerts/i, /float plan/i]) {
    assert.match(PREMIUM_FREE_NOTE, pattern);
  }
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
