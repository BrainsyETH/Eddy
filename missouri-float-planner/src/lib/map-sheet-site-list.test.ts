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
  naturalCompare,
  sitesOnNight,
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
  assert.equal(groups[0].takenCount, 0);
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

test('a state park with no site type still lists', () => {
  // UseDirect folds the type into the name and publishes no separate field.
  const entries = sitesOnNight(
    [site({ siteType: null, maxOccupancy: null, name: 'Electric 50 amp #178' })],
    NIGHTS,
    NIGHTS[0],
  );
  assert.deepEqual(entries[0].tags, []);
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
  assert.equal(group.takenCount, 2, 'booked and closed both mean "not tonight"');
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
  assert.equal(group.takenCount, 0);
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
