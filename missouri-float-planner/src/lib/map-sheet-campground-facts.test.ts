// src/lib/map-sheet-campground-facts.test.ts
// The app's campground inventory lines, run from the web suite.
//
// eddy-ios has no test runner of its own, so this reaches across and imports
// the module directly — the same arrangement map-sheet-availability.test.ts has,
// and the reason campgroundFacts.ts is pure `.ts` with no `@/` or `.tsx`
// imports.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { NpsCampgroundSummary } from '@eddy/types';
import {
  bookingAction,
  bookingLine,
  siteMixLine,
} from '../../../eddy-ios/src/components/map-sheet/campgroundFacts';

function record(over: Partial<NpsCampgroundSummary> = {}): NpsCampgroundSummary {
  return {
    name: 'Alley Spring',
    npsUrl: null,
    reservationInfo: null,
    reservationUrl: null,
    totalSites: 0,
    sitesReservable: 0,
    sitesFirstCome: 0,
    ...over,
  };
}

/* ── Zero and absent are the same fact ────────────────────────────────────── */
//
// This is the rule the whole module rests on, and it is why these are lines
// rather than rows. The NPS record leaves most of the breakdown empty, so a
// line that printed its zeroes would be mostly zeroes — "RV 0 · group 0" is a
// sentence about the database, not about the campground.

test('the mix leads with the total and names only the kinds that exist', () => {
  const line = siteMixLine(
    record({ totalSites: 52, sitesRvOnly: 1, sitesElectrical: 42, sitesGroup: 8 }),
  );
  assert.equal(line, '52 · RV 1 · electric 42 · group 8');
});

test('a zero count is left out exactly as an absent one is', () => {
  const zeroed = siteMixLine(record({ totalSites: 52, sitesTentOnly: 0, sitesGroup: 0 }));
  const absent = siteMixLine(record({ totalSites: 52 }));
  assert.equal(zeroed, '52');
  assert.equal(zeroed, absent, 'a camper reads "none" and "not recorded" the same');
});

test('a record that breaks nothing down produces no row at all', () => {
  // Most campgrounds. Fact renders nothing for a null value, so the label
  // column does not appear either — absent, never "Sites: unknown".
  assert.equal(siteMixLine(record()), null);
  assert.equal(siteMixLine(null), null);
  assert.equal(siteMixLine(undefined), null);
});

test('the mix survives a record with a breakdown but no total', () => {
  // The two do not depend on each other: totalSites is the one number that is
  // not a subset, and its absence is not a reason to withhold the rest.
  assert.equal(siteMixLine(record({ sitesTentOnly: 12 })), 'tent 12');
});

/* ── The second axis ──────────────────────────────────────────────────────── */

test('booking is its own line, and is not required to sum to the total', () => {
  // 42 + 10 is 52 here by coincidence, not by rule: a site can be neither
  // reservable nor first-come. Nothing in the module checks or implies it.
  const line = bookingLine(record({ totalSites: 52, sitesReservable: 42, sitesFirstCome: 10 }));
  assert.equal(line, '42 reservable · 10 first come');

  assert.equal(bookingLine(record({ sitesReservable: 42 })), '42 reservable');
  assert.equal(bookingLine(record({ sitesFirstCome: 4 })), '4 first come');
});

test('a campground with no booking counts says nothing about booking', () => {
  assert.equal(bookingLine(record({ totalSites: 52 })), null);
  assert.equal(bookingLine(null), null);
});

/* ── The one link that takes a booking ────────────────────────────────────── */

test('a reservation URL wins, and the button names where it lands', () => {
  // The button leaves the app. "Book" alone tells nobody which account they
  // will need on the other side.
  assert.deepEqual(
    bookingAction(
      record({ reservationUrl: 'https://recreation.gov/camping/campgrounds/232while' }),
      'recreation_gov',
    ),
    {
      url: 'https://recreation.gov/camping/campgrounds/232while',
      label: 'Book on Recreation.gov',
    },
  );
});

test('reading live inventory from a provider is NOT a booking URL', () => {
  // The bug this replaces: `source === 'mo_state_parks'` was taken as proof
  // that the access point's official site is Missouri's booking system, so
  // Meramec and Onondaga drew a button reading "Book at Missouri State Parks"
  // that landed on mostateparks.com/park/... — a park DESCRIPTION page.
  //
  // Every official_site_url in the database is such a page. Missouri's actual
  // reservation system is icampmo.com, held on nearby_services.reservation_url
  // (migration 00084) and not yet on the wire. A button that promises a booking
  // and cannot take one spends the tab's single affordance on a dead end.
  //
  // The signature no longer accepts an official site at all, so this cannot be
  // reintroduced by passing one: the only input that produces a button is a
  // real reservationUrl.
  assert.equal(bookingAction(null, 'mo_state_parks'), null);
  assert.equal(bookingAction(record(), 'mo_state_parks'), null);
});

test('no reservation URL, no button, whoever runs the place', () => {
  // A federal site whose record is missing the booking link gets no button
  // rather than a guess. The official site is still offered as a row — the
  // Camping tab gates that only on the URL differing from the button's.
  assert.equal(bookingAction(null, null), null);
  assert.equal(bookingAction(null, 'recreation_gov'), null);
  assert.equal(bookingAction(record(), 'recreation_gov'), null);
});

test('a reservation URL with no known provider still gets a button', () => {
  const action = bookingAction(record({ reservationUrl: 'https://example.gov/book' }), null);
  assert.equal(action?.label, 'Book a site');
});
