// src/lib/camping/booking.test.ts
// What the booking read will and will not hand a button.
//
// The rules here are small, but each one is a claim PR #1173 spent a page
// arguing: a button that promises a booking must land somewhere that takes one,
// and the only column that means that is `nearby_services.reservation_url`.

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBookingLink } from './booking';

/**
 * Just enough of the client for the one query loadBookingLink makes.
 *
 * Mirrors the shape read.test.ts uses: chainable builder, terminal call
 * resolves. `maybeSingle` is the terminal here because at most one facility can
 * name a given access point — `campsite_facilities_access_point_unique`.
 */
function supabaseReturning(data: unknown, error: { message: string } | null = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data, error }),
  };
  return { from: () => builder } as never;
}

test('a directory row with a reservation URL becomes a booking link', async () => {
  // Meramec: no nps_campgrounds row, so this is the only route by which its
  // Camping tab can offer a booking at all.
  const link = await loadBookingLink(
    supabaseReturning({
      source: 'mo_state_parks',
      nearby_services: { reservation_url: 'https://icampmo.com' },
    }),
    'ap-meramec',
  );

  assert.deepEqual(link, { url: 'https://icampmo.com', source: 'mo_state_parks' });
});

test('the provider is named off the facility, not the free-text platform column', async () => {
  // `nearby_services.booking_platform` holds 26 spellings across the directory
  // — `fareharbor` and `FareHarbor`, `recreation_gov` and `recreation.gov`, one
  // row whose platform is a hostname. `campsite_facilities.source` has a CHECK
  // behind it, so that is what a user-facing label is built from. This asserts
  // the link carries the constrained value even when the row is a state park
  // whose platform column says something else entirely.
  const link = await loadBookingLink(
    supabaseReturning({
      source: 'recreation_gov',
      nearby_services: { reservation_url: 'https://www.recreation.gov/camping/campgrounds/232391' },
    }),
    'ap-red-bluff',
  );

  assert.equal(link?.source, 'recreation_gov');
});

test('a facility with no directory row books nowhere', async () => {
  // The 17 gravel-bar campgrounds sharing a backcountry-district id are linked
  // for availability and have no directory entry. Null, not a guess.
  assert.equal(
    await loadBookingLink(supabaseReturning({ source: 'recreation_gov', nearby_services: null }), 'ap-1'),
    null,
  );
});

test('a directory row with an empty reservation URL books nowhere', async () => {
  // St. Francois and Washington State Park: linked, enabled, and carrying no
  // reservation URL. A campground Eddy cannot send you to book is not an error
  // and must not become a button.
  assert.equal(
    await loadBookingLink(
      supabaseReturning({ source: 'mo_state_parks', nearby_services: { reservation_url: null } }),
      'ap-2',
    ),
    null,
  );
});

test('an access point with no facility at all books nowhere', async () => {
  // The common case by a wide margin: 64 of Eddy's 95 campground access points
  // have no facility row, so this is what most Camping tabs get.
  assert.equal(await loadBookingLink(supabaseReturning(null), 'ap-3'), null);
});

test('a failed read costs the button, not the page', async () => {
  // Same rule the availability read follows: a booking link is an enhancement,
  // so a page that cannot read it renders as it did before the button existed.
  assert.equal(
    await loadBookingLink(supabaseReturning(null, { message: 'boom' }), 'ap-4'),
    null,
  );
});
