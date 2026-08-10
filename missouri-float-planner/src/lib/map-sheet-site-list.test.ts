// src/lib/map-sheet-site-list.test.ts
// The app's site-list derivation, run from the web suite.
//
// Covers eddy-ios/src/components/map-sheet/siteList.ts, and the wire codec both
// sides of that list depend on. Includes the parity check on SITE_NIGHT_CODE,
// which is duplicated for the reason campsiteAvailabilityLine is: shippable web
// code cannot import packages/, because Vercel installs only this directory.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { CampsiteSite } from '@eddy/types';
import { CAMPSITE_NIGHT_CODES, decodeCampsiteNights } from '@eddy/types';
import { SITE_NIGHT_CODE, SITE_NIGHT_UNKNOWN } from './camping/sites';
import {
  filterCounts,
  groupSites,
  listOutcome,
  listsRows,
  SITE_FILTERS,
  naturalCompare,
  siteKind,
  sitesOnNight,
  summariseByKind,
} from '../../../eddy-ios/src/components/map-sheet/siteList';

const NIGHTS = ['2026-08-06', '2026-08-07', '2026-08-08'];

function site(over: Partial<CampsiteSite> = {}): CampsiteSite {
  return {
    id: 'site-1',
    name: 'A1',
    loop: 'Loop A',
    siteType: 'STANDARD NONELECTRIC',
    maxOccupancy: 6,
    bookingUrl: 'https://www.recreation.gov/camping/campsites/16089',
    nights: 'ARR',
    ...over,
  };
}

/* ── The wire codec ───────────────────────────────────────────────────────── */

test('every server code decodes to a state the app knows', () => {
  // The duplication guard. A status added on the server without a matching
  // entry in the app's table would decode to "unknown" and quietly render a
  // real site as unmeasured.
  for (const [status, code] of Object.entries(SITE_NIGHT_CODE)) {
    assert.equal(
      CAMPSITE_NIGHT_CODES[code],
      status,
      `server code '${code}' (${status}) is not in the app's table`,
    );
  }
  assert.equal(CAMPSITE_NIGHT_CODES[SITE_NIGHT_UNKNOWN], 'unknown');
});

test('an unrecognised character is unknown, never taken', () => {
  assert.deepEqual(decodeCampsiteNights('A?C'), ['open', 'unknown', 'closed']);
});

/* ── Resolving to one night ───────────────────────────────────────────────── */

test('a site resolves to the night the reader selected', () => {
  const entries = sitesOnNight([site({ nights: 'ARC' })], NIGHTS, '2026-08-07');
  assert.equal(entries[0].state, 'reserved');
});

test('a date outside the window yields nothing rather than index zero', () => {
  assert.deepEqual(sitesOnNight([site()], NIGHTS, '2026-09-01'), []);
});

test('walk-up sites are listed, because somebody can still sleep there', () => {
  // They are excluded from the DENOMINATOR — counting them would make "44 of
  // 54" a promise the booking system cannot keep — and that is a different
  // question from whether they belong in a list of places to sleep.
  const entries = sitesOnNight([site({ nights: 'WWW' })], NIGHTS, '2026-08-06');
  const groups = groupSites(entries);
  assert.equal(groups[0].open.length, 1);
  assert.equal(groups[0].taken.length, 0);
});

/* ── Tags ─────────────────────────────────────────────────────────────────── */

test('NONELECTRIC does not read as electric', () => {
  // The substring trap: 'NONELECTRIC' contains 'ELECTRIC', so a naive match
  // labels every primitive site as having a hookup.
  const plain = sitesOnNight([site({ siteType: 'STANDARD NONELECTRIC' })], NIGHTS, NIGHTS[0]);
  assert.ok(!plain[0].tags.includes('Electric'));
  assert.ok(plain[0].tags.includes('No hookup'));

  const powered = sitesOnNight([site({ siteType: 'RV ELECTRIC' })], NIGHTS, NIGHTS[0]);
  assert.ok(powered[0].tags.includes('Electric'));
  assert.ok(powered[0].tags.includes('RV'));
});

test('a site type Eddy has never seen degrades to no tags', () => {
  // Better than shouting a database string in the middle of a sentence.
  const entries = sitesOnNight([site({ siteType: 'SOMETHING NEW' })], NIGHTS, NIGHTS[0]);
  assert.deepEqual(entries[0].tags, ['Sleeps 6']);
});

test('a state park with no site type is tagged from its NAME', () => {
  // UseDirect folds the type into the name and publishes no separate field.
  //
  // This used to assert NO tags, and that assertion was the bug written down:
  // `typeTags` read `site.siteType` directly, which is null for all 631 sites
  // Missouri State Parks publishes, so every one of them came back untagged —
  // `filterCounts` returned zeros and the whole filter row disappeared on the
  // six largest campgrounds Eddy has. `siteKind` already knew this site is
  // "Electric"; it just was not being asked.
  const entries = sitesOnNight(
    [site({ siteType: null, maxOccupancy: null, name: 'Electric 50 amp #178' })],
    NIGHTS,
    NIGHTS[0],
  );
  assert.deepEqual(entries[0].tags, ['Electric']);
  assert.equal(entries[0].site.name, 'Electric 50 amp #178');
});

/* ── Grouping ─────────────────────────────────────────────────────────────── */

test('loops and sites sort the way their numbers read', () => {
  // A plain string sort puts 'Site 100' between 'Site 10' and 'Site 11', which
  // in a list of campsite numbers reads as broken data rather than as a sort.
  assert.ok(naturalCompare('Loop 2', 'Loop 10') < 0);
  assert.ok(naturalCompare('Site 9', 'Site 100') < 0);
});

test('taken sites collapse to a count instead of rows', () => {
  // Meramec is 197 sites and every tab is already inside a ScrollView. Fewer
  // rows is the whole strategy; "+2 taken" says more than two dimmed rows.
  const entries = sitesOnNight(
    [
      site({ id: '1', name: 'A2', nights: 'AAA' }),
      site({ id: '2', name: 'A1', nights: 'RRR' }),
      site({ id: '3', name: 'A3', nights: 'CCC' }),
    ],
    NIGHTS,
    NIGHTS[0],
  );
  const [group] = groupSites(entries);
  assert.deepEqual(group.open.map((e) => e.site.name), ['A2']);
  assert.equal(group.taken.length, 2, 'booked and closed both mean "not tonight"');
});

test('an unmeasured night counts as neither open nor taken', () => {
  const entries = sitesOnNight([site({ nights: '---' })], NIGHTS, NIGHTS[0]);
  assert.deepEqual(groupSites(entries), []);
});

test('a filtered-out site is not reported as taken', () => {
  // Somebody filtering for RVs must not be told a free tent site is booked.
  const entries = sitesOnNight(
    [
      site({ id: '1', siteType: 'TENT ONLY', nights: 'AAA' }),
      site({ id: '2', siteType: 'RV ELECTRIC', nights: 'AAA' }),
    ],
    NIGHTS,
    NIGHTS[0],
  );
  const [group] = groupSites(entries, ['RV']);
  assert.equal(group.open.length, 1);
  assert.equal(group.taken.length, 0);
});

test('the taken count describes the same sites the filter does', () => {
  // The list and the count have to be about one set of sites. Filtering to RV
  // while counting every booked TENT site as "+22 taken" tells the reader there
  // are 22 RV sites they just missed.
  const entries = sitesOnNight(
    [
      site({ id: '1', siteType: 'RV ELECTRIC', nights: 'AAA' }),
      site({ id: '2', siteType: 'RV ELECTRIC', nights: 'RRR' }),
      site({ id: '3', siteType: 'TENT ONLY', nights: 'RRR' }),
      site({ id: '4', siteType: 'TENT ONLY', nights: 'RRR' }),
    ],
    NIGHTS,
    NIGHTS[0],
  );

  const [all] = groupSites(entries);
  assert.equal(all.open.length, 1);
  assert.equal(all.taken.length, 3, 'unfiltered, every booked site counts');

  const [rv] = groupSites(entries, ['RV']);
  assert.equal(rv.open.length, 1);
  assert.equal(rv.taken.length, 1, 'only the booked RV site, not the two tents');
});

test('a site with no loop sorts last, as the residue', () => {
  const entries = sitesOnNight(
    [
      site({ id: '1', loop: null, nights: 'AAA' }),
      site({ id: '2', loop: 'Loop B', nights: 'AAA' }),
      site({ id: '3', loop: 'Loop A', nights: 'AAA' }),
    ],
    NIGHTS,
    NIGHTS[0],
  );
  assert.deepEqual(
    groupSites(entries).map((g) => g.loop),
    ['Loop A', 'Loop B', null],
  );
});

test('filter counts only ever count bookable sites', () => {
  const entries = sitesOnNight(
    [
      site({ id: '1', siteType: 'TENT ONLY', nights: 'AAA' }),
      site({ id: '2', siteType: 'TENT ONLY', nights: 'RRR' }),
    ],
    NIGHTS,
    NIGHTS[0],
  );
  assert.equal(filterCounts(entries).Tent, 1, 'a booked tent site is not an option');
});

/* ── Kinds, for the feeds that name rather than type ──────────────────────── */

test('a Missouri State Park site takes its kind from its name', () => {
  // The whole reason siteKind exists. Every Onondaga and Meramec site arrives
  // with a null site_type and a name like "Basic #001", so the type filters
  // counted zero, every chip vanished, and 64 rows differed only by number.
  assert.equal(siteKind({ name: 'Basic #001', siteType: null }), 'Basic');
  assert.equal(siteKind({ name: 'Electric #012', siteType: null }), 'Electric');
});

test('a declared site type always beats the name', () => {
  // recreation.gov fills site_type in, and it is the site's own claim about
  // itself. Reading the name over it would be guessing at data we were given.
  assert.equal(
    siteKind({ name: 'A1', siteType: 'STANDARD NONELECTRIC' }),
    'STANDARD NONELECTRIC',
  );
});

test('a bare number yields no kind rather than a fake one', () => {
  // "Site 14" splits to "Site ", which names nothing — better no kind than a
  // heading that groups every site in the park under one meaningless word.
  assert.equal(siteKind({ name: '14', siteType: null }), null);
});

test('the summary counts open against the whole kind, not just what is open', () => {
  // "Basic 12 of 40" is a different claim from "Basic 12", and the denominator
  // is the sites that are taken — which is why LoopGroup keeps them rather than
  // only counting them.
  const entries = sitesOnNight(
    [
      site({ id: '1', name: 'Basic #001', siteType: null, nights: 'ARR' }),
      site({ id: '2', name: 'Basic #002', siteType: null, nights: 'RRR' }),
      site({ id: '3', name: 'Electric #001', siteType: null, nights: 'ARR' }),
    ],
    NIGHTS,
    NIGHTS[0],
  );

  const summaries = summariseByKind(entries);
  assert.deepEqual(summaries, [
    { kind: 'Basic', open: 1, total: 2 },
    { kind: 'Electric', open: 1, total: 1 },
  ]);
});

/* ── State parks become filterable ────────────────────────────────────────── */

test('the real Missouri State Parks kinds all produce tags', () => {
  // Every distinct name head across the six mo_state_parks facilities, read out
  // of the live table. These are 631 sites — Meramec's 197, Montauk's 141,
  // St. Francois' 109, Echo Bluff's 72, Onondaga's 64, Washington's 48 — and
  // before siteKind fed the tags, not one of them carried a single tag.
  const cases: [string, string[]][] = [
    ['Basic #001', ['No hookup']],
    ['Family Basic #1', ['No hookup']],
    ['Electric #012', ['Electric']],
    ['Family Electric #3', ['Electric']],
    ['Electric/Water #044', ['Electric']],
    ['Family Electric/Water #2', ['Electric']],
    ['Sewer/Electric/Water #019', ['Electric']],
    ['Walk-in #7', ['Walk-in']],
    ['Platform Tent Sites #02', ['Tent']],
  ];
  for (const [name, expected] of cases) {
    const entries = sitesOnNight(
      [site({ siteType: null, maxOccupancy: null, name })],
      NIGHTS,
      NIGHTS[0],
    );
    assert.deepEqual(entries[0].tags, expected, name);
  }
});

test('Meramec gets a filter row where it had none', () => {
  // The shape of the real facility: 146 electric of one flavour or another and
  // 51 Basic. Both chips must have a non-zero count, or the row stays hidden —
  // `SITE_FILTERS.filter((f) => counts[f] > 0)` is what draws it.
  const sites = [
    ...Array.from({ length: 3 }, (_, i) =>
      site({ id: `e${i}`, siteType: null, maxOccupancy: null, name: `Electric #${i}` }),
    ),
    ...Array.from({ length: 2 }, (_, i) =>
      site({ id: `b${i}`, siteType: null, maxOccupancy: null, name: `Basic #${i}` }),
    ),
  ];
  const counts = filterCounts(sitesOnNight(sites, NIGHTS, NIGHTS[0]));
  assert.equal(counts.Electric, 3);
  assert.equal(counts['No hookup'], 2);
  assert.ok(SITE_FILTERS.filter((f) => counts[f] > 0).length >= 2);
});

test('No hookup is offered as a filter, not merely as a label', () => {
  // NONELECTRIC has mapped to this tag since the file was written and was never
  // filterable — 581 recreation.gov sites across 28 facilities wearing a label
  // nothing could select. That is the older half of this bug.
  assert.ok((SITE_FILTERS as readonly string[]).includes('No hookup'));
  const entries = sitesOnNight([site({ siteType: 'STANDARD NONELECTRIC' })], NIGHTS, NIGHTS[0]);
  assert.ok(entries[0].tags.includes('No hookup'));
  assert.equal(filterCounts(entries)['No hookup'], 1);
});

test('Basic never also counts as Electric', () => {
  // The same precedence trap NONELECTRIC set: a substring table is only safe
  // while the longer match wins, and 'Basic' must not drift into the electric
  // count when a park names a loop "Basic Electric".
  const entries = sitesOnNight(
    [site({ siteType: null, maxOccupancy: null, name: 'Basic #7' })],
    NIGHTS,
    NIGHTS[0],
  );
  assert.equal(entries[0].tags.includes('Electric'), false);
});

test('recreation.gov keeps the type it declares', () => {
  // siteKind returns siteType untouched when the feed provides one, so the 29
  // recreation.gov facilities never reach the name-splitting branch and nothing
  // about their tags changed.
  const entries = sitesOnNight(
    [site({ siteType: 'WALK TO', name: 'Walk-in: A #1' })],
    NIGHTS,
    NIGHTS[0],
  );
  assert.ok(entries[0].tags.includes('Walk-in'));
});

/* ── Why the list has nothing to show ─────────────────────────────────────── */
//
// Three different facts used to leave CampsiteList returning null, under a
// heading that now names a night. Only one of them is about the campground, and
// telling a reader "nothing open" when nothing was MEASURED is the same class
// of error as printing "0" on a night the place is shut.

test('every site taken is the only outcome that means "nothing open"', () => {
  const entries = sitesOnNight([site({ nights: 'RRR' })], NIGHTS, NIGHTS[0]);
  assert.equal(listOutcome(entries, groupSites(entries), []), 'none_open');
});

test('an unmeasured night does not claim the campground is full', () => {
  // '-' is "not measured". groupSites drops these into neither half, so the
  // group empties and falls away — indistinguishable from a booked-out night
  // until this told them apart.
  const entries = sitesOnNight([site({ nights: '---' })], NIGHTS, NIGHTS[0]);
  assert.deepEqual(groupSites(entries), []);
  assert.equal(listOutcome(entries, groupSites(entries), []), 'unmeasured');
});

test('a date outside the feed’s own window is unmeasured, not empty', () => {
  // sitesOnNight returns [] on indexOf(date) < 0. That window comes from the
  // server while the night chips are built from the DEVICE's day, so a phone an
  // hour either side of America/Chicago can select a night the feed never sent
  // — and it may be a night with plenty of room.
  const entries = sitesOnNight([site({ nights: 'AAA' })], NIGHTS, '2026-08-20');
  assert.deepEqual(entries, []);
  assert.equal(listOutcome(entries, groupSites(entries), []), 'unmeasured');
});

test('filters emptying a measured night is its own answer', () => {
  const entries = sitesOnNight([site({ nights: 'AAA' })], NIGHTS, NIGHTS[0]);
  const filters = ['RV'] as never;
  assert.deepEqual(groupSites(entries, filters), []);
  assert.equal(listOutcome(entries, groupSites(entries, filters), filters), 'filtered_out');
});

test('rows to show is not an empty state at all', () => {
  const entries = sitesOnNight([site({ nights: 'AAA' })], NIGHTS, NIGHTS[0]);
  assert.equal(listOutcome(entries, groupSites(entries), []), 'sites');
});

/* ── When the filter chips are a second copy of the summary ───────────────── */

test('a facility whose sites deep-link is filtered by rows, so the chips earn their place', () => {
  const entries = sitesOnNight([site({ nights: 'AAA' })], NIGHTS, NIGHTS[0]);
  assert.equal(listsRows(entries), true);
});

test('sites with no booking URL collapse to summaries, and the chips repeat them', () => {
  // Every Missouri State Park: UseDirect publishes no per-unit URL, so the loop
  // draws "Basic — 12 of 40 open" per kind. A chip row splitting the same sites
  // by the same kinds is the same breakdown, in the version you have to operate.
  const entries = sitesOnNight([site({ nights: 'AAA', bookingUrl: null })], NIGHTS, NIGHTS[0]);
  assert.equal(listsRows(entries), false);
});

test('a fully booked night collapses even where the sites do deep-link', () => {
  // The shape is a property of the NIGHT, not the facility — `Loop` reads it off
  // `open`, which is empty here. This is why the filters are spent only while
  // their row is on screen.
  const entries = sitesOnNight([site({ nights: 'RRR' })], NIGHTS, NIGHTS[0]);
  assert.equal(listsRows(entries), false);
});

test('an unmeasured night lists nothing, so it lists no rows', () => {
  const entries = sitesOnNight([site({ nights: '---' })], NIGHTS, NIGHTS[0]);
  assert.equal(listsRows(entries), false);
});
