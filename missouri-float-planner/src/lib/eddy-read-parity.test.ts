// src/lib/eddy-read-parity.test.ts
// "Eddy's read" names the same column on both platforms.
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
// The long prose is withheld — '' on web from /api/eddy-update/[riverSlug],
// null on iOS from /api/rivers/[slug]/outlook — when the river has crossed
// into a different floatability class or the row is past
// WEBSITE_PROSE_STALE_HOURS. Withholding is the guard working, so each
// platform must fall through to the short read rather than reach around it.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IOS = join(process.cwd(), '../eddy-ios/src/components/EddyTake.tsx');
const WEB = join(process.cwd(), 'src/components/gauge/RiverGaugeDetail.tsx');

test('both platforms prefer the long report and fall back to the short read', () => {
  // iOS: `outlook.fullRead || sections?.eddyRead || ''` — fullRead is quote_text.
  assert.match(
    readFileSync(IOS, 'utf8'),
    /outlook\.fullRead\s*\|\|\s*sections\?\.eddyRead/,
    'EddyTake.tsx no longer prefers fullRead over sections.eddyRead',
  );

  // Web: the same precedence, expressed over the fields /api/eddy-update returns.
  assert.match(
    readFileSync(WEB, 'utf8'),
    /generatedEddyRead:\s*activeEddyUpdate\?\.quoteText\s*\|\|\s*activeEddyUpdate\?\.eddyRead/,
    'RiverGaugeDetail.tsx no longer prefers quoteText over eddyRead',
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
