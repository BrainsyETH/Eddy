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
  defaultNight,
  nightBars,
  nightChoices,
  nightPhrase,
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

test('the ruler carries the date, because a fortnight repeats every weekday', () => {
  // Fourteen nights print each initial twice — S M T W T F S S M T W T F S — so
  // "the Saturday" is ambiguous and a reader counting columns to reach next
  // weekend has to count which one they landed on. A day of the month is unique
  // across a horizon this short.
  const bars = nightBars(summary(), TODAY);
  assert.deepEqual(
    bars.slice(0, 4).map((b) => b.dayOfMonth),
    [6, 7, 8, 9],
  );

  // The initials are still on the data. The number replaces what the strip
  // DRAWS, not what the module knows — see NightBar.weekday.
  assert.equal(bars[0].weekday, bars[7].weekday, 'a fortnight repeats every weekday');
});

test('the ruler crosses a month without restarting the strip', () => {
  const bars = nightBars(summary(), '2026-08-25');
  assert.equal(bars.length, 14);
  assert.deepEqual(bars.slice(5, 9).map((b) => b.dayOfMonth), [30, 31, 1, 2]);
});

test('the month marks the crossing, and only the crossing', () => {
  // `30 · 31 · 1 · 2` does not say which 1st. The marker takes that one column
  // and no other — thirteen bare numbers and one word, not fourteen words.
  const crossing = nightBars(summary(), '2026-08-25');
  assert.deepEqual(
    crossing.map((b) => b.monthLabel).filter(Boolean),
    ['Sep'],
  );
  assert.equal(crossing[7].monthLabel, 'Sep', 'the 1st carries it');
  assert.equal(crossing[6].monthLabel, null, 'the 31st does not');

  // A fortnight that stays inside one month has crossed nothing.
  assert.deepEqual(nightBars(summary(), TODAY).map((b) => b.monthLabel).filter(Boolean), []);
});

test('a strip that opens on the 1st has not crossed into anything', () => {
  // `i > 0` is the whole of the rule: the first column is where the reader
  // already is, not somewhere they have been carried.
  const bars = nightBars(summary(), '2026-09-01');
  assert.equal(bars[0].dayOfMonth, 1);
  assert.equal(bars[0].monthLabel, null);
});

/* ── The night the Camping tab is showing ─────────────────────────────────── */

test('the status line names the day in full while the chip abbreviates', () => {
  // Two forms of one fact, derived together, so the line above the site list
  // and the chip that selects it can never name different days.
  const nights = nightChoices(summary(), TODAY);
  assert.equal(nights[0].label, 'Tonight');
  assert.equal(nights[0].longLabel, 'Tonight');
  assert.equal(nights[2].label, 'Sat Aug 8');
  assert.equal(nights[2].longLabel, 'Saturday, Aug 8');
});

test('a zero is phrased by what made it zero, never as "0 open"', () => {
  // Three of the four marks produce sitesOpen: 0 and only one of them means
  // "keep refreshing for a cancellation". This is the strip's shape language
  // in words — see NightStrip.
  const phraseFor = (nights: unknown[]) =>
    nightPhrase(nightChoices(summary({ nights: nights as never }), TODAY)[0]);

  assert.equal(phraseFor([night(TODAY, 0, 54, 'full')]), 'Fully booked');
  assert.equal(phraseFor([night(TODAY, 0, 0, 'closed')]), 'Not offered this night');
  // The strip draws these two the same way — a dash is "nothing here to fill"
  // either way — but the words must not fold them: "come back when booking
  // opens" and "go somewhere else" are opposite instructions.
  assert.equal(phraseFor([night(TODAY, 0, 0, 'not_yet_released')]), 'Not yet bookable');
  assert.equal(phraseFor([night(TODAY, 8)]), '8 of 54 sites open');
});

test('an unmeasured night has nothing honest to say', () => {
  // Null rather than a phrase: the day still draws, the count does not.
  assert.equal(nightPhrase(nightChoices(summary({ nights: [] }), TODAY)[0]), null);
});

test('the tab opens on the night the peek is describing', () => {
  // Which is TONIGHT — the night the hero speaks for — and what
  // AccessCampingTab passes as its preference. The straightforward case:
  // tonight was measured, so tonight is chosen.
  const nights = nightChoices(
    summary({ nights: [night(TODAY, 12), night('2026-08-07', 8)] }),
    TODAY,
  );
  assert.equal(defaultNight(nights, TODAY), TODAY);
});

test('an unmeasured window falls FORWARD, never back to tonight', () => {
  // The whole point. Falling back to the first measured night anywhere would
  // land on the 6th — tonight — while the card above still described the
  // weekend of the 7th to the 9th. The reader came for the weekend.
  const nights = nightChoices(
    summary({ nights: [night(TODAY, 12), night('2026-08-09', 4)] }),
    TODAY,
  );
  assert.equal(defaultNight(nights, '2026-08-07'), '2026-08-09');
});

test('it walks backwards only when nothing ahead was measured', () => {
  const nights = nightChoices(summary({ nights: [night(TODAY, 12)] }), TODAY);
  assert.equal(defaultNight(nights, '2026-08-14'), TODAY);
});

test('a closed night is still a night to open on', () => {
  // Measured is not the same as bookable. "Not offered this night" is an answer
  // and the tab should be able to give it; only an UNMEASURED night has nothing
  // behind it at all.
  const nights = nightChoices(
    summary({ nights: [night('2026-08-07', 0, 0, 'closed')] }),
    TODAY,
  );
  assert.equal(defaultNight(nights, '2026-08-07'), '2026-08-07');
});

test('nothing measured at all has no night to offer', () => {
  assert.equal(defaultNight(nightChoices(summary({ nights: [] }), TODAY), '2026-08-07'), null);
  assert.equal(defaultNight([], '2026-08-07'), null);
});

test('an open night always has a real denominator behind it', () => {
  // nightBars only marks 'bar' when BOTH counts are above zero, so the phrase
  // can print "of N" unguarded. A feed reporting openings against no inventory
  // is marked 'empty' and never reaches that branch.
  const choices = nightChoices(summary({ nights: [night(TODAY, 1, 0)] }), TODAY);
  assert.equal(choices[0].mark, 'empty');
  assert.equal(nightPhrase(choices[0]), 'Fully booked');
});

test('fill never exceeds the track', () => {
  const bar = nightBars(summary({ nights: [night(TODAY, 54, 54)] }), TODAY)[0];
  assert.equal(bar.fill, 1);
});

/* ── The hero ─────────────────────────────────────────────────────────────── */
//
// The hero speaks for ONE NIGHT and names it. The weekend fold on the summary
// is a minimum across the nights of a stay, which is right for "can I book
// Fri–Sun" and catastrophic as a headline over a fortnight strip — see the
// Cedargrove case below, which is the bug these tests exist to hold shut.

test('the hero describes tonight, not the weekend the summary folds', () => {
  // Cedargrove, as shipped: one site free Friday, none Saturday, five Sunday.
  // The server's two-night minimum is zero, so `status` is 'full' — while
  // tonight has five of six sites open and the strip drew them.
  const hero = availabilityHero(
    summary({
      status: 'full',
      sitesOpen: 0,
      sitesReservable: 6,
      nights: [
        night(TODAY, 5, 6),
        night('2026-08-07', 1, 6),
        night('2026-08-08', 0, 6, 'full'),
        night('2026-08-09', 5, 6),
      ],
    }),
    TODAY,
  )!;

  assert.equal(hero.count, 5, 'tonight, never the weekend minimum');
  assert.equal(hero.headline, 'open');
  assert.equal(hero.detail, 'of 6 sites');
  assert.equal(hero.caption, 'Tonight');
});

test('the headline and the column under it cannot disagree', () => {
  // The strip is the same derivation, so this is the invariant rather than a
  // coincidence: whatever the hero says, tonight's bar has to show it.
  const value = summary({
    status: 'full',
    sitesOpen: 0,
    nights: [night(TODAY, 3, 12), night('2026-08-07', 0, 12, 'full')],
  });

  const hero = availabilityHero(value, TODAY)!;
  const tonight = nightBars(value, TODAY)[0];

  assert.equal(hero.count, tonight.sitesOpen);
  assert.equal(tonight.mark, 'bar');
});

test('a booked-out tonight points at the next night with room', () => {
  // "Fully booked" on its own sends a reader back to the map to tap the same
  // pin again on a different day. The next open night is the answer they were
  // going to go looking for.
  const hero = availabilityHero(
    summary({
      nights: [night(TODAY, 0, 54, 'full'), night('2026-08-07', 0, 54, 'full'), night('2026-08-08', 6)],
    }),
    TODAY,
  )!;

  assert.equal(hero.count, null);
  assert.equal(hero.headline, 'Fully booked');
  assert.equal(hero.caption, 'Tonight · next open Sat Aug 8');
});

test('a booked-out fortnight promises nothing it cannot keep', () => {
  const hero = availabilityHero(
    summary({ nights: [night(TODAY, 0, 54, 'full'), night('2026-08-07', 0, 54, 'full')] }),
    TODAY,
  )!;
  assert.equal(hero.caption, 'Tonight', 'no next-open clause when there is no next open night');
});

test('an unmeasured tonight walks forward and says which night it landed on', () => {
  // Forward, never back — the same direction defaultNight walks, for the same
  // reason. And never silently: the caption is what makes the walk honest.
  const hero = availabilityHero(summary({ nights: [night('2026-08-07', 9)] }), TODAY)!;
  assert.equal(hero.count, 9);
  assert.equal(hero.caption, 'Tomorrow');
});

test('closed and fully booked are phrases, never a zero', () => {
  // "0 open" for a campground shut for the winter invites somebody to keep
  // refreshing for a cancellation that cannot exist.
  const closed = availabilityHero(
    summary({ status: 'closed', nights: [night(TODAY, 0, 0, 'closed'), night('2026-08-07', 0, 0, 'closed')] }),
    TODAY,
  )!;
  assert.equal(closed.count, null);
  assert.equal(closed.headline, 'Closed for the season');
  assert.equal(closed.caption, '', 'there is no date to give — the fortnight ends shut');

  const full = availabilityHero(summary({ nights: [night(TODAY, 0, 54, 'full')] }), TODAY)!;
  assert.equal(full.count, null);
  assert.equal(full.headline, 'Fully booked');
});

test('one closed night is not a season', () => {
  // A loop that shuts Sunday and reopens Monday is the ordinary Ozark case —
  // Pulltite closes 49 of 56 sites on Sunday nights — and calling it "closed
  // for the season" would send a reader somewhere else for a fortnight.
  const hero = availabilityHero(
    summary({ nights: [night(TODAY, 0, 0, 'closed'), night('2026-08-07', 7)] }),
    TODAY,
  )!;
  assert.equal(hero.headline, 'Closed');
  assert.equal(hero.caption, 'Tonight · next open Tomorrow');
});

test('a night not yet released is not a closure', () => {
  const hero = availabilityHero(
    summary({ nights: [night(TODAY, 0, 0, 'not_yet_released')] }),
    TODAY,
  )!;
  assert.equal(hero.headline, 'Not yet bookable');
});

test('a facility below the strip floor still describes the weekend', () => {
  // The server sends `nights: []` for a facility with fewer than seven measured
  // nights, so there is no night to anchor on and the old fold is the only
  // thing left to say. Its wording is unchanged, weekend label and all.
  const hero = availabilityHero(summary(), TODAY)!;
  assert.equal(hero.count, 8);
  assert.equal(hero.detail, 'of 54 sites');
  assert.equal(hero.caption, 'Fri–Sun, Aug 7–9');

  const full = availabilityHero(summary({ status: 'full', sitesOpen: 0 }), TODAY)!;
  assert.equal(full.headline, 'Fully booked');
  assert.equal(full.caption, 'Fri–Sun, Aug 7–9');
});

test('a backcountry district is named, because the number means nothing alone', () => {
  const hero = availabilityHero(
    summary({ kind: 'backcountry_district', nights: [night(TODAY, 12, 27)] }),
    TODAY,
    'Upper Current District',
  )!;
  assert.equal(hero.count, 12);
  // The night leads: a caption is one line and truncates from the right, and
  // the day is the part that has to survive.
  assert.equal(hero.caption, 'Tonight · Upper Current District');
});

test('absent availability renders nothing rather than "unknown"', () => {
  assert.equal(availabilityHero(null, TODAY), null);
  assert.equal(availabilityHero(undefined, TODAY), null);
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
