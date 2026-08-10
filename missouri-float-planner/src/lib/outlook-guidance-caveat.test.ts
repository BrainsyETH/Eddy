// src/lib/outlook-guidance-caveat.test.ts
// The weather-only disclaimer says the same thing on both platforms.
//
// ── Why this is a test and not a shared constant ──────────────────────────
// The two renderers cannot share one: the iOS card is
// eddy-ios/src/components/EddyTake.tsx, the web card is
// src/components/gauge/EddyOutlookFooter.tsx, and Vercel builds only
// missouri-float-planner — shippable web code may not import from outside it.
// Same arrangement, and same reason, as the PUBLIC_LAND_ACCESS_STYLE parity
// test: the table lives on one side, a test in this suite pins the two
// together.
//
// ── Why it is worth pinning at all ────────────────────────────────────────
// `isGuidance` is true only when a river has NO official hydrograph, so the
// forecast strip above this line is weather and nothing else. The line is what
// stops a reader taking it for a river-level forecast — the claim
// docs/river-guide-style.md refuses to let Eddy make, including by omission
// ("a planning input, not the safety authority"). A copy edit applied to one
// platform and not the other leaves half the users without it, silently, and
// nothing else in either build would notice.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IOS = join(process.cwd(), '../eddy-ios/src/components/EddyTake.tsx');
const WEB = join(process.cwd(), 'src/components/gauge/EddyOutlookFooter.tsx');

/**
 * The string, as both files must contain it.
 *
 * Changing the copy means changing it here and in both components, which is the
 * point: three edits in one commit, rather than one edit and a silent drift.
 */
const CAVEAT = 'Weather only — no river-level forecast.';

test('the guidance caveat is present and identical on iOS and web', () => {
  const ios = readFileSync(IOS, 'utf8');
  const web = readFileSync(WEB, 'utf8');

  assert.ok(ios.includes(CAVEAT), `EddyTake.tsx no longer contains: ${CAVEAT}`);
  assert.ok(web.includes(CAVEAT), `EddyOutlookFooter.tsx no longer contains: ${CAVEAT}`);
});

test('neither platform has kept the superseded wording', () => {
  // The sentence this replaced. Catches a half-applied revert, which would
  // otherwise leave the two platforms disagreeing while both still "have a
  // caveat" and any looser assertion would pass.
  const OLD = 'future river levels are not predicted';
  assert.ok(!readFileSync(IOS, 'utf8').includes(OLD));
  assert.ok(!readFileSync(WEB, 'utf8').includes(OLD));
});

test('the caveat is still gated on isGuidance on both platforms', () => {
  // An unconditional caveat is a different bug from a missing one: it would
  // tell every reader their river has no hydrograph, including the ones whose
  // river has an official forecast rendered directly above it.
  assert.match(readFileSync(IOS, 'utf8'), /outlook\.isGuidance\s*\?/);
  assert.match(readFileSync(WEB, 'utf8'), /isGuidance\s*&&/);
});
