// src/lib/eddy-says-tier.test.ts
// The free line the iOS app may show for a river, and the paid one it may not.
//
// ── The rule under test ────────────────────────────────────────────────────
// Per-river summary_text is free; per-river quote_text is the artifact EddyTake
// sells, and it reaches the app twice — inside EddyUpdateEntry from the batched
// /api/eddy-updates, and as `fullRead` on /api/rivers/[slug]/outlook, which is
// the same column. The statewide 'global' row is a separate free overview and
// is not routed through the selector at all.
//
// ── Why the SHAPE is asserted and not just the value ───────────────────────
// A source assertion over the component would pass happily if some layer in
// between renamed quoteText to `text` on its way down, which is the exact shape
// of the mistake worth guarding. So the invariant lives in the selector's
// return type, and this file pins the behaviour that type is protecting.
//
// The Expo app has no test runner; its pure logic is covered from here. Same
// arrangement as today-fold.test.ts next door.
//
// ── TWO CASES LEFT WITH THE DECK, DELIBERATELY ─────────────────────────────
// EddySaysDeck — the otter, the bold line and the "Written 3 hours ago" that
// used to head the river screen's take card — was removed, and with it the two
// source-reading cases that watched it: one that grepped the component for a
// paid field, and one that pinned the `deckSays = pickedGauge ? null : eddySays`
// guard on the river screen.
//
// Neither was the real invariant. Both were the belt to the selector's braces,
// and the selector is what remains: it CANNOT return quote_text, by its return
// type, so no surface downstream can render it however the props are named.
// selectEddySays still feeds the share note, the map sheet's river head, the
// Favorites cards and the Today tab, and every one of them is covered by the
// shape assertions above rather than by a grep over a component.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectEddySays, writtenAge } from '../../../eddy-ios/src/lib/eddySays';

test('the free line is the summary, and only the summary', () => {
  const says = selectEddySays({
    summaryText: 'Holding steady at a good level for a float today.',
    generatedAt: '2026-08-23T11:10:00.000Z',
  });
  assert.equal(says?.text, 'Holding steady at a good level for a float today.');
  assert.equal(says?.generatedAt, '2026-08-23T11:10:00.000Z');
});

test('a null summary selects nothing, and never reaches for the quote', () => {
  // THE test. parse-response.ts's terminal path returns
  // { summaryText: null, eddyRead: null, quoteText: rawText } — every path that
  // nulls the summary nulls eddy_read in the same object, so there is no second
  // field to fall back to. And on that path quote_text is RAW model output,
  // still carrying its [SUMMARY]/[FULL] markers: both the gated artifact and
  // the unusable one.
  //
  // The extra keys are passed deliberately. A structural parameter type accepts
  // them, so this is what an EddyUpdateEntry straight off the wire looks like —
  // and nothing in the result may come from them.
  const says = selectEddySays({
    summaryText: null,
    generatedAt: '2026-08-23T11:10:00.000Z',
    quoteText: '[SUMMARY]\nThe gauge is holding.\n[FULL]\nFour to six sentences of paid report.',
  } as Parameters<typeof selectEddySays>[0]);
  assert.equal(says, null, 'a null summary must render nothing');
});

test('whitespace is not a summary', () => {
  assert.equal(selectEddySays({ summaryText: '   ', generatedAt: 'x' }), null);
  assert.equal(selectEddySays({ summaryText: '', generatedAt: 'x' }), null);
  assert.equal(selectEddySays(null), null);
  assert.equal(selectEddySays(undefined), null);
});

test('the selected text is trimmed, so a stray newline cannot pad the deck', () => {
  const says = selectEddySays({ summaryText: '\n Running clear. \n', generatedAt: 'x' });
  assert.equal(says?.text, 'Running clear.');
});

test('the selector cannot return the full quote, by construction', () => {
  // The type says so; this pins it at runtime too, against a future edit that
  // widens the return without widening the type.
  const says = selectEddySays({
    summaryText: 'One free sentence.',
    generatedAt: '2026-08-23T11:10:00.000Z',
    quoteText: 'FOUR TO SIX SENTENCES OF PAID REPORT.',
  } as Parameters<typeof selectEddySays>[0]);
  assert.deepEqual(
    Object.keys(says ?? {}).sort(),
    ['generatedAt', 'text'],
    'EddySays grew a field — anything beyond text/generatedAt risks carrying the quote',
  );
  assert.ok(
    !JSON.stringify(says).includes('PAID REPORT'),
    'the paid quote reached a free surface',
  );
});

test('the statewide card still renders the global quote directly', () => {
  // The rule is about PER-RIVER quote_text. insertGlobal in the
  // generate-eddy-updates cron writes quote_text and nothing else for
  // river_slug 'global' — there is no summary_text on that row, ever — so the
  // statewide overview is free and TodaySummary renders it straight.
  //
  // Guarded because the obvious "tidy-up" is to route Today through the same
  // selector, which would select null on every statewide row ever written and
  // silently empty the top card of the app.
  const reports = readFileSync(
    join(process.cwd(), '../eddy-ios/app/(tabs)/reports.tsx'),
    'utf8',
  );
  assert.match(
    reports,
    /prose=\{summary\?\.quoteText \?\? null\}/,
    'the Today tab no longer renders the statewide quote directly',
  );
});

test('refresh never discards the cache it is refreshing', () => {
  // The bug this pins: refresh() nulled the cache and then requested, so a pull
  // on a phone that had just lost signal threw away a perfectly good paragraph
  // for nothing — every current subscriber lost it on the next render and every
  // new one got null at once. Clearing was never what made refresh contact the
  // server: revalidate() ignores the TTL, which only the mount effect consults.
  const hook = readFileSync(
    join(process.cwd(), '../eddy-ios/src/hooks/useEddyUpdates.ts'),
    'utf8',
  );
  const clears = hook.match(/cached\s*=\s*null/g) ?? [];
  assert.equal(
    clears.length,
    1,
    'the only `cached = null` may be the test-reset seam — refresh must not clear',
  );
  assert.match(
    hook,
    /__resetEddyUpdatesCacheForTests[\s\S]*cached\s*=\s*null/,
    'the surviving `cached = null` is no longer the test seam',
  );
});

test('written age is vague at the coarse end and silent about the future', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');
  assert.equal(writtenAge('2026-08-23T11:40:00.000Z', now), 'Written in the last hour');
  assert.equal(writtenAge('2026-08-23T10:45:00.000Z', now), 'Written an hour ago');
  assert.equal(writtenAge('2026-08-23T06:10:00.000Z', now), 'Written 6 hours ago');
  // A clock skewed forward must not produce "Written -2 hours ago".
  assert.equal(writtenAge('2026-08-23T14:00:00.000Z', now), null);
  assert.equal(writtenAge('not a date', now), null);
});
