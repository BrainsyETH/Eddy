// src/lib/eddy-read-parity.test.ts
// "Eddy's read" respects the public/Premium boundary on both platforms.
//
// ── The drift this exists to stop ─────────────────────────────────────────
// One model call writes three blocks — [SUMMARY], [EDDY_READ], [FULL] — into
// summary_text, eddy_read and quote_text (src/lib/eddy/generate-update.ts).
// For a while the heading "Eddy's read" named quote_text on iOS and eddy_read
// on web, so the same river read as four to six sentences in the app and as
// one line on the site, with the long version parked behind a "Full report"
// expander. Nothing failed; the two just quietly said different amounts.
//
// ── Why a source assertion and not a unit test ────────────────────────────
// The precedence is a component wiring decision on both sides, and the two
// renderers cannot share code: iOS is eddy-ios/src/components/EddyTake.tsx,
// web is src/components/gauge/RiverGaugeDetail.tsx, and Vercel builds only
// missouri-float-planner. Same arrangement, and same reason, as the caveat
// parity test next door in outlook-guidance-caveat.test.ts.
//
// ── Why the fallback is part of the contract ──────────────────────────────
// The long prose is null on public web responses and on free iOS outlooks. It
// is also withheld when live water has crossed into a different floatability
// class or the row is stale. Each platform must fall through to the public
// summary rather than reach around either guard.
//
// On iOS the fall-through is `outlook.fullRead || sections.eddyRead`. That is
// only a fall-through if the outlook's short Read went through the same
// guards and tier as fullRead: it is the same model run's eddy_read when one
// survives, and the code-written live line otherwise. The outlook route takes
// both from loadOutlookProse (src/lib/eddy/outlook-prose.ts); its behaviour is
// pinned in outlook-prose.test.ts, and the wiring is pinned below. Reading
// `eddy_read` straight off a stored row is the reach-around.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IOS = join(process.cwd(), '../eddy-ios/src/components/EddyTake.tsx');
const WEB = join(process.cwd(), 'src/components/gauge/RiverGaugeDetail.tsx');
const OUTLOOK = join(process.cwd(), 'src/app/api/rivers/[slug]/outlook/route.ts');

test('iOS prefers the entitled report, then the outlook\'s guarded short Read', () => {
  // iOS: `outlook.fullRead || sections?.eddyRead || ''` — fullRead is quote_text.
  // A source check only pins the order; the next test pins that the fallback
  // it lands on is guarded.
  assert.match(
    readFileSync(IOS, 'utf8'),
    /outlook\.fullRead\s*\|\|\s*sections\?\.eddyRead/,
    'EddyTake.tsx no longer prefers fullRead over sections.eddyRead',
  );
});

test('the outlook\'s short Read falls through to the live line rather than reaching around the guards', () => {
  const route = readFileSync(OUTLOOK, 'utf8');
  // Both Reads come from the one guarded, tiered result.
  assert.match(route, /await loadOutlookProse\(/, 'outlook route no longer guards its prose through loadOutlookProse');
  assert.match(route, /generatedEddyRead:\s*prose\.eddyRead\b/, 'sections.eddyRead is no longer the guarded short Read');
  assert.match(route, /fullRead:\s*premiumText\(entitled,\s*prose\.fullRead\)/, 'fullRead is no longer the guarded long Read');
  // No stored column reaches the response directly. Select lists are strings,
  // so they do not match a property access.
  assert.doesNotMatch(
    route,
    /\w\??\.(?:eddy_read|quote_text|summary_text)\b/,
    'outlook route reads stored prose off a row instead of through loadOutlookProse',
  );
});

test('public web links to an available Read', () => {
  // The web hook deliberately narrows the public response before handing it
  // to the renderer, so premium fields cannot survive under another name.
  assert.match(
    readFileSync(WEB, 'utf8'),
    /readIsGenerated=\{Boolean\(activeEddyUpdate\?\.summaryText\)\}/,
    'RiverGaugeDetail.tsx no longer checks public Read availability',
  );
});

test('web no longer hides the full report behind an expander', () => {
  // The regression this guards is a revert to the two-quote arrangement, where
  // the strip showed eddy_read and quote_text needed a click. Asserted against
  // the footer's props rather than its markup: the expander cannot come back
  // without the component being handed a report to expand.
  const footer = readFileSync(
    join(process.cwd(), 'src/components/gauge/EddyOutlookFooter.tsx'),
    'utf8',
  );
  assert.ok(
    !/fullReportText|fullReportIsGenerated|onToggle/.test(footer),
    'EddyOutlookFooter.tsx has regained the full-report expander',
  );
});
