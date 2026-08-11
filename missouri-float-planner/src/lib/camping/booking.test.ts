// src/lib/camping/booking.test.ts
// What the booking read will and will not hand a button.
//
// The rules here are small, but each one is a claim PR #1173 spent a page
// arguing: a button that promises a booking must land somewhere that takes one,
// and the only column that means that is `nearby_services.reservation_url`.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookingUrlFor, loadBookingLink } from './booking';

/**
 * Just enough of the client for the one query loadBookingLink makes.
 *
 * Mirrors the shape read.test.ts uses: chainable builder, terminal call
 * resolves.
 *
 * ── THE TERMINAL IS `eq`, AND IT RESOLVES A LIST ─────────────────────────
 *
 * It was `maybeSingle`, because at most one facility could name a given access
 * point — `campsite_facilities_access_point_unique`. The query matches linked
 * directory rows as well now, and several facilities can name the services of
 * one place, so the read returns rows and picks. A single fixture is wrapped
 * rather than making every caller pass an array: these tests are about which
 * URL survives the allowlist, and only the two below are about the picking.
 */
function supabaseReturning(data: unknown, error: { message: string } | null = null) {
  const rows = data == null ? [] : Array.isArray(data) ? data : [data];
  const builder = {
    select: () => builder,
    or: () => builder,
    eq: () => Promise.resolve({ data: error ? null : rows, error }),
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

/* ── The URL has to be the provider the button names ──────────────────────── */

test('the real stored URLs all survive, which is the point of the list', () => {
  // Every reservation URL currently reachable from a booking button. If a
  // future host list breaks one of these, it has broken a working button.
  assert.equal(
    bookingUrlFor('recreation_gov', 'https://www.recreation.gov/camping/campgrounds/232391'),
    'https://www.recreation.gov/camping/campgrounds/232391',
  );
  assert.equal(bookingUrlFor('mo_state_parks', 'https://icampmo.com'), 'https://icampmo.com');
  // The host icampmo.com actually resolves to, so a row storing the resolved
  // URL is the same booking system and not a stranger.
  assert.equal(
    bookingUrlFor('mo_state_parks', 'https://icampmo.usedirect.com/MSPWeb/'),
    'https://icampmo.usedirect.com/MSPWeb/',
  );
});

test('a park page in the reservation column is refused, which is #1173 in one line', () => {
  // The failure this whole check exists for, and the one an https-and-parses
  // check would have waved through: well-formed, https, and takes no bookings.
  assert.equal(
    bookingUrlFor('mo_state_parks', 'https://mostateparks.com/park/meramec-state-park'),
    null,
  );
});

test("another provider's booking link cannot wear this provider's label", () => {
  // The directory holds all of these on rows that are legitimate booking links
  // for the outfitter they belong to. Under a button reading "Book on
  // Recreation.gov" every one of them is a lie about the destination, and only
  // a facility join separates those rows from these.
  for (const url of [
    'https://fareharbor.com/embeds/book/someoutfitter/',
    'https://www.vrbo.com/1234567',
    'https://www.hipcamp.com/en-US/land/missouri-somewhere',
    'https://www.roverpass.com/c/some-campground',
    'https://reserve.arkansasstateparks.com/',
  ]) {
    assert.equal(bookingUrlFor('recreation_gov', url), null, url);
  }
});

test('a lookalike host does not pass as a subdomain', () => {
  // The suffix bug: endsWith('recreation.gov') alone would accept both of
  // these, and the second is a registrable domain somebody else can hold.
  assert.equal(bookingUrlFor('recreation_gov', 'https://notrecreation.gov/camping'), null);
  assert.equal(bookingUrlFor('recreation_gov', 'https://recreation.gov.example.com/'), null);
  // A real subdomain still passes — this is not an exact-match check.
  assert.equal(
    bookingUrlFor('recreation_gov', 'https://www.recreation.gov/'),
    'https://www.recreation.gov/',
  );
});

test('the host match ignores case, since a URL host is case-insensitive', () => {
  assert.equal(
    bookingUrlFor('recreation_gov', 'https://WWW.Recreation.GOV/camping/campgrounds/232391'),
    'https://WWW.Recreation.GOV/camping/campgrounds/232391',
  );
});

test('cleartext and credentialed URLs are refused', () => {
  // http: the one thing this button does is send somebody to type payment
  // details. Upgrading the scheme silently would be inventing a URL nobody
  // verified, so it is refused rather than rewritten.
  assert.equal(bookingUrlFor('recreation_gov', 'http://www.recreation.gov/camping'), null);
  // user:pass@ is a phishing shape before it is anything else, and the host
  // check alone would have accepted this one.
  assert.equal(
    bookingUrlFor('recreation_gov', 'https://evil.example.com@www.recreation.gov/'),
    null,
  );
});

test('a non-URL and a non-web scheme are refused', () => {
  assert.equal(bookingUrlFor('recreation_gov', 'recreation.gov/camping'), null);
  assert.equal(bookingUrlFor('recreation_gov', 'not a url at all'), null);
  // Linking.openURL hands a scheme it does not recognise to the OS, so a
  // booking column is not a place to let one through.
  assert.equal(bookingUrlFor('mo_state_parks', 'javascript:alert(1)'), null);
  assert.equal(bookingUrlFor('mo_state_parks', 'itms-apps://apps.apple.com/app/id1'), null);
});

test('absent stays absent, without a complaint in the log', () => {
  assert.equal(bookingUrlFor('recreation_gov', null), null);
  assert.equal(bookingUrlFor('recreation_gov', undefined), null);
  assert.equal(bookingUrlFor('recreation_gov', ''), null);
});

test('a directory row pointing somewhere else produces no link at all', async () => {
  // End to end: the read refuses it rather than handing the app a URL the
  // label would misdescribe.
  assert.equal(
    await loadBookingLink(
      supabaseReturning({
        source: 'recreation_gov',
        nearby_services: { reservation_url: 'https://www.vrbo.com/1234567' },
      }),
      'ap-mislinked',
    ),
    null,
  );
});

// ── Linked services reach the button ───────────────────────────────────────

test('the query asks for facilities by access point OR by linked service', () => {
  // Ten facilities name a directory row and no access point — Alley Spring and
  // Round Spring among them — so a reader tapping that put-in got no button for
  // a campground Eddy scrapes nightly. `access_point_services` is the join that
  // closes it, and the OR is where it lands.
  const source = readFileSync(
    join(process.cwd(), 'src/lib/camping/booking.ts'),
    'utf8',
  );
  assert.match(source, /access_point_id\.eq\.\$\{accessPointId\}/);
  assert.match(source, /nearby_service_id\.in\.\(\$\{serviceIds\.join\(','\)\}\)/);
  // And the provider still comes off the facility, never off the service — the
  // allowlist checks the host against `source`, and a URL with no provider to
  // check against is exactly what this file exists to refuse.
  assert.match(source, /const source = preferred\.source as CampingSource/);
  assert.match(source, /bookingUrlFor\(source, preferred\.nearby_services\?\.reservation_url\)/);
});

test('a facility naming this access point directly beats a linked one', () => {
  // Same precedence as the availability lookup: the access point's own row is
  // the one the map pin came from, and a link is a statement about two records
  // yielding to one about this one.
  const source = readFileSync(
    join(process.cwd(), 'src/lib/camping/booking.ts'),
    'utf8',
  );
  assert.match(
    source,
    /rows\.find\(\(row\) => row\.access_point_id === accessPointId\) \?\? rows\[0\]/,
  );
});

test('a linked facility carries the button when the access point has none', async () => {
  // Alley Spring in miniature: the facility names the directory row and no
  // access point, so before `access_point_services` was read the put-in a
  // reader taps offered no booking for a campground Eddy scrapes nightly.
  const link = await loadBookingLink(
    supabaseReturning([
      {
        source: 'recreation_gov',
        access_point_id: null,
        nearby_services: { reservation_url: 'https://www.recreation.gov/camping/campgrounds/234046' },
      },
    ]),
    'ap-alley-spring',
    ['svc-alley-spring'],
  );

  assert.deepEqual(link, {
    url: 'https://www.recreation.gov/camping/campgrounds/234046',
    source: 'recreation_gov',
  });
});

test('the access point own row wins when both match', async () => {
  const link = await loadBookingLink(
    supabaseReturning([
      {
        source: 'recreation_gov',
        access_point_id: null,
        nearby_services: { reservation_url: 'https://www.recreation.gov/camping/campgrounds/111' },
      },
      {
        source: 'recreation_gov',
        access_point_id: 'ap-1',
        nearby_services: { reservation_url: 'https://www.recreation.gov/camping/campgrounds/999' },
      },
    ]),
    'ap-1',
    ['svc-a'],
  );

  assert.equal(link?.url, 'https://www.recreation.gov/camping/campgrounds/999');
});

test('no linked services means the query never asks for them', async () => {
  // An ordinary put-in must not pay for an `in.()` clause with an empty list,
  // which PostgREST reads as a syntax error rather than as "match nothing".
  const source = readFileSync(join(process.cwd(), 'src/lib/camping/booking.ts'), 'utf8');
  assert.match(source, /if \(serviceIds\.length > 0\)/);
});
