// src/lib/camping/availability-copy-parity.test.ts
// Asserts the website and the app word availability identically.
//
// Two copies exist for the reason stated in public-land-parity.test.ts: Vercel
// installs only missouri-float-planner/, so shippable web code cannot import
// @eddy/types. Tests may reach across — they run under tsconfig.test.json — so
// this is the guard on the duplication.
//
// The stake here is a factual one rather than a stylistic one. "Closed for the
// season" and "Fully booked" describe opposite situations to somebody deciding
// whether to keep checking for a cancellation, and both really occur at the
// same campgrounds — Ozark loops close mid-season while others stay open. If
// the phone and the website disagree about which is which, one of them is
// telling a user to keep refreshing a campground that will not reopen until
// spring.

import assert from 'node:assert/strict';
import test from 'node:test';
import { campsiteAvailabilityLine as sharedLine } from '../../../../packages/eddy-types/index';
import { availabilityLabel } from '../../components/ui/AvailabilityChip';
import type { CampsiteAvailabilityInfo } from '../../types/api';

const WINDOW = { startDate: '2026-08-07', endDate: '2026-08-09', label: 'Fri–Sun, Aug 7–9' };

function info(over: Partial<CampsiteAvailabilityInfo>): CampsiteAvailabilityInfo {
  return {
    window: WINDOW,
    sitesOpen: 0,
    sitesReservable: 0,
    status: 'open',
    kind: 'campground',
    source: 'recreation_gov',
    fetchedAt: '2026-08-02T09:00:00Z',
    ...over,
  };
}

const CASES: Array<{ label: string; value: CampsiteAvailabilityInfo; name?: string }> = [
  { label: 'open', value: info({ status: 'open', sitesOpen: 8, sitesReservable: 54 }) },
  { label: 'one site left', value: info({ status: 'open', sitesOpen: 1, sitesReservable: 72 }) },
  { label: 'full', value: info({ status: 'full', sitesReservable: 54 }) },
  { label: 'closed', value: info({ status: 'closed' }) },
  { label: 'not yet released', value: info({ status: 'not_yet_released' }) },
  {
    label: 'backcountry district',
    value: info({ status: 'open', sitesOpen: 12, sitesReservable: 27, kind: 'backcountry_district' }),
    name: 'Upper Current District',
  },
  {
    label: 'backcountry district, one site',
    value: info({ status: 'open', sitesOpen: 1, sitesReservable: 27, kind: 'backcountry_district' }),
    name: 'Upper Current District',
  },
  {
    label: 'backcountry district, unnamed',
    value: info({ status: 'open', sitesOpen: 3, sitesReservable: 27, kind: 'backcountry_district' }),
  },
  { label: 'state park source', value: info({ status: 'open', sitesOpen: 70, sitesReservable: 203, source: 'mo_state_parks' }) },
];

for (const { label, value, name } of CASES) {
  test(`web and app agree: ${label}`, () => {
    assert.equal(availabilityLabel(value, name), sharedLine(value, name));
  });
}

test('both render nothing when there is no availability', () => {
  assert.equal(sharedLine(null), null);
  assert.equal(sharedLine(undefined), null);
});

test('the closed wording never mentions booking', () => {
  // A user who reads "booked" goes looking for a cancellation. A user who
  // reads "closed" drives somewhere else. Guarding the distinction directly
  // rather than trusting the switch to stay correct.
  const closed = availabilityLabel(info({ status: 'closed' }));
  assert.ok(closed);
  assert.doesNotMatch(closed, /book/i);
  assert.match(closed, /season/i);
});

test('the full wording never claims sites are open', () => {
  const full = availabilityLabel(info({ status: 'full', sitesReservable: 54 }));
  assert.ok(full);
  assert.doesNotMatch(full, /\bopen\b/i);
});

test('an open window names both the count and the weekend', () => {
  assert.equal(
    availabilityLabel(info({ status: 'open', sitesOpen: 8, sitesReservable: 54 })),
    '8 of 54 sites open · Fri–Sun, Aug 7–9',
  );
});
