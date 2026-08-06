// src/lib/map-sheet-availability.test.ts
// The app's availability derivation, run from the web suite.
//
// eddy-ios has no test runner of its own, so this reaches across and imports
// the module directly — the same arrangement map-sheet-tabs.test.ts has, and
// the reason availability.ts is pure `.ts` with no `@/` or `.tsx` imports.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { CampsiteAvailabilitySummary } from '@eddy/types';
import {
  availabilityHero,
  availabilityVoiceOver,
  nightBars,
  nightChoices,
} from '../../../eddy-ios/src/components/map-sheet/availability';

const TODAY = '2026-08-06'; // a Thursday

function summary(
  over: Partial<CampsiteAvailabilitySummary> = {},
): CampsiteAvailabilitySummary {
  return {
    window: { startDate: '2026-08-07', endDate: '2026-08-09', label: 'Fri–Sun, Aug 7–9' },
    sitesOpen: 8,
    sitesReservable: 54,
    status: 'open',
    kind: 'campground',
    source: 'recreation_gov',
    fetchedAt: '2026-08-06T09:04:12Z',
    ...over,
  };
}

const night = (date: string, sitesOpen: number, sitesReservable = 54, status = 'open') =>
  ({ date, sitesOpen, sitesReservable, status }) as never;

/* ── The four ways a bar can be empty ─────────────────────────────────────── */
//
// These are the assertions the whole strip rests on. "Fully booked" tells you
// to keep refreshing for a cancellation; "closed for the season" tells you to
// go somewhere else; "we did not measure it" tells you nothing at all. Drawing
// any two of them the same way is a lie in a different direction each time.

test('fully booked and closed for the season are drawn differently', () => {
  const full = nightBars(summary({ nights: [night(TODAY, 0, 54, 'full')] }), TODAY)[0];
  const closed = nightBars(summary({ nights: [night(TODAY, 0, 0, 'closed')] }), TODAY)[0];

  assert.equal(full.fill, 0);
  assert.equal(closed.fill, 0);
  assert.notEqual(full.mark, closed.mark, 'zero fill cannot be the only difference');
  assert.equal(full.mark, 'empty', 'the inventory exists and is all taken');
  assert.equal(closed.mark, 'dash', 'there is nothing here to fill');
});

test('an unmeasured night is not a full one', () => {
  // The sparse array is the normal case: a season ending mid-horizon and a sync
  // that ran out of budget both leave real gaps. Rendering those as zero turns
  // "we did not look" into "fully booked".
  const bars = nightBars(summary({ nights: [night(TODAY, 8)] }), TODAY);
  assert.equal(bars[0].mark, 'bar');
  assert.equal(bars[1].mark, 'none', 'a date with no row draws nothing at all');
  assert.equal(bars[5].mark, 'none');
});

test('not yet released is its own state, not a closure', () => {
  const bar = nightBars(
    summary({ nights: [night(TODAY, 0, 0, 'not_yet_released')] }),
    TODAY,
  )[0];
  assert.equal(bar.mark, 'dash');
});

/* ── The strip's shape ────────────────────────────────────────────────────── */

test('one open site out of a hundred and ninety-seven is still visible', () => {
  // Meramec. A true ratio would be 0.5% of the track, which rounds to nothing
  // and reads as fully booked — the exact opposite of the truth, and precisely
  // the case somebody hunting a cancellation is scanning for.
  const bar = nightBars(summary({ nights: [night(TODAY, 1, 197)] }), TODAY)[0];
  assert.equal(bar.mark, 'bar');
  assert.ok(bar.fill > 0.1, `a single free site must be drawable, got ${bar.fill}`);
});

test('the strip is always the length asked for, however sparse the data', () => {
  // Built from the DATES, not from the array. Walking the payload would
  // silently shorten the strip instead of showing the gap.
  assert.equal(nightBars(summary({ nights: [] }), TODAY).length, 14);
  assert.equal(nightBars(null, TODAY).length, 14);
  assert.equal(nightBars(summary({ nights: [night(TODAY, 8)] }), TODAY, 7).length, 7);
});

test('today is the first column and the weekend is Friday and Saturday', () => {
  const bars = nightBars(summary(), TODAY);
  assert.equal(bars[0].isToday, true);
  assert.equal(bars.filter((b) => b.isToday).length, 1);

  // TODAY is a Thursday, so Fri/Sat are indices 1-2 and 8-9.
  assert.deepEqual(
    bars.map((b, i) => (b.isWeekend ? i : null)).filter((i) => i !== null),
    [1, 2, 8, 9],
  );
  assert.deepEqual([bars[1].weekday, bars[2].weekday], ['F', 'S']);
});

test('fill never exceeds the track', () => {
  const bar = nightBars(summary({ nights: [night(TODAY, 54, 54)] }), TODAY)[0];
  assert.equal(bar.fill, 1);
});

/* ── The hero ─────────────────────────────────────────────────────────────── */

test('the hero splits the same facts the chip states in one sentence', () => {
  const hero = availabilityHero(summary())!;
  assert.equal(hero.count, 8);
  assert.equal(hero.detail, 'of 54 sites');
  assert.equal(hero.caption, 'Fri–Sun, Aug 7–9');
});

test('closed and fully booked are phrases, never a zero', () => {
  // "0 open" for a campground shut for the winter invites somebody to keep
  // refreshing for a cancellation that cannot exist.
  const closed = availabilityHero(summary({ status: 'closed' }))!;
  assert.equal(closed.count, null);
  assert.equal(closed.headline, 'Closed for the season');

  const full = availabilityHero(summary({ status: 'full', sitesOpen: 0 }))!;
  assert.equal(full.count, null);
  assert.equal(full.headline, 'Fully booked');
});

test('a backcountry district is named, because the number means nothing alone', () => {
  const hero = availabilityHero(
    summary({ kind: 'backcountry_district', sitesOpen: 12 }),
    'Upper Current District',
  )!;
  assert.equal(hero.count, 12);
  assert.equal(hero.caption, 'Upper Current District');
});

test('absent availability renders nothing rather than "unknown"', () => {
  assert.equal(availabilityHero(null), null);
  assert.equal(availabilityHero(undefined), null);
  assert.equal(availabilityVoiceOver(null, TODAY), null);
});

/* ── VoiceOver ────────────────────────────────────────────────────────────── */

test('the strip speaks once, not fourteen times', () => {
  const spoken = availabilityVoiceOver(
    summary({ nights: [night(TODAY, 8), night('2026-08-07', 0, 54, 'full')] }),
    TODAY,
  )!;
  assert.match(spoken, /8 open of 54 sites/);
  assert.match(spoken, /Next 14 nights: 1 with sites open/);
});

/* ── The night selector ───────────────────────────────────────────────────── */

test('the first two nights are named, not dated', () => {
  const choices = nightChoices(summary({ nights: [night(TODAY, 8)] }), TODAY);
  assert.equal(choices[0].label, 'Tonight');
  assert.equal(choices[1].label, 'Tomorrow');
  assert.match(choices[3].label, /^[A-Z][a-z]{2} \d/);
});

test('an unmeasured night has no count rather than a zero', () => {
  // A chip reading 0 says "we looked and there is nothing"; a chip with no
  // count says "we have not looked". FilterChips renders the difference.
  const choices = nightChoices(summary({ nights: [night(TODAY, 8)] }), TODAY);
  assert.equal(choices[0].count, 8);
  assert.equal(choices[1].count, null);
});
