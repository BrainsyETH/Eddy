// src/lib/camping/read.test.ts
// What the read path is willing to say, and what it refuses to.
//
// There was no test here before the horizon landed, and the two rules below are
// the ones that decide whether a campground appears at all — so they are the
// ones worth pinning.

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAvailability } from './read';
import { resolveHorizon, resolveWeekend } from './window';

const NOW = new Date('2026-08-06T17:00:00Z'); // a Thursday in Chicago
const HORIZON = resolveHorizon(NOW).nights;
const WEEKEND = resolveWeekend(NOW).nights;

const FACILITY = {
  id: 'fac-1',
  source: 'recreation_gov',
  kind: 'campground',
  enabled: true,
  access_point_id: null,
  nps_campground_id: 'cg-1',
  nearby_service_id: null,
};

/** Just enough of the client for the one query loadAvailability makes. */
function supabaseReturning(rows: unknown[]) {
  const builder = {
    select: () => builder,
    in: () => builder,
    eq: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => builder } as never;
}

function night(
  date: string,
  sitesOpen: number,
  sitesReservable = 54,
  status = 'open',
  fetchedAt = '2026-08-06T09:00:00Z',
) {
  return {
    date,
    sites_open: sitesOpen,
    sites_reservable: sitesReservable,
    status,
    fetched_at: fetchedAt,
    campsite_facilities: FACILITY,
  };
}

/* ── The fortnight is never folded like a stay ────────────────────────────── */

test('a busy Saturday does not report the fortnight as fully booked', async () => {
  // THE regression this whole file exists for. summarizeWindow takes the
  // MINIMUM of sitesOpen across the nights it is given, which is right for
  // "8 sites open Fri–Sun" and catastrophic across fourteen: one sold-out night
  // would print "Fully booked" for a campground with forty free sites on twelve
  // of them. Only the weekend is folded.
  const rows = HORIZON.map((date) =>
    night(date, WEEKEND.includes(date) ? 8 : date === HORIZON[10] ? 0 : 40),
  );

  const index = await loadAvailability(supabaseReturning(rows), NOW);
  const availability = index.byNpsCampgroundId.get('cg-1')!;

  assert.equal(availability.status, 'open');
  assert.equal(availability.sitesOpen, 8, 'the weekend, not the worst night');
  assert.equal(availability.nights.length, HORIZON.length);
});

test('the summary still describes the whole weekend, not its best night', async () => {
  const rows = HORIZON.map((date) =>
    night(date, date === WEEKEND[0] ? 8 : date === WEEKEND[1] ? 3 : 40),
  );
  const index = await loadAvailability(supabaseReturning(rows), NOW);
  assert.equal(index.byNpsCampgroundId.get('cg-1')!.sitesOpen, 3);
});

/* ── How much of the horizon is enough ────────────────────────────────────── */

test('a season that ends mid-horizon still shows the nights it has', async () => {
  // The old rule was all-or-nothing, which was right when the window WAS the
  // sentence's two nights. Over fourteen it would drop this facility entirely
  // rather than draw nine bars and five gaps.
  const rows = HORIZON.slice(0, 9).map((date) => night(date, 8));
  const index = await loadAvailability(supabaseReturning(rows), NOW);

  const availability = index.byNpsCampgroundId.get('cg-1');
  assert.ok(availability, 'nine nights of fourteen is worth drawing');
  assert.equal(availability!.nights.length, 9, 'nine bars and five gaps, not silence');
});

test('a facility with almost nothing measured keeps its number and drops the strip', async () => {
  // Three bars among eleven gaps reads as a campground that is nearly full
  // rather than as one barely measured, so below the floor there is no strip.
  // But the SENTENCE only ever needed the weekend, and dropping the whole row
  // for want of strip data is how shipping this would have taken every
  // availability line dark until the first horizon sync ran.
  const rows = [...WEEKEND, HORIZON[0]].map((date) => night(date, 8));
  const index = await loadAvailability(supabaseReturning(rows), NOW);

  const availability = index.byNpsCampgroundId.get('cg-1');
  assert.ok(availability, 'the weekend was measured, so the number stands');
  assert.equal(availability!.sitesOpen, 8);
  assert.deepEqual(availability!.nights, [], 'not enough of the fortnight to draw');
});

test('the two nights already in the table on deploy day still render', async () => {
  // The table holds exactly the old two-night weekend until the first horizon
  // sync. That is the state this code ships into, and it has to look like the
  // app did yesterday rather than like a broken feature.
  const rows = WEEKEND.map((date) => night(date, 8));
  const index = await loadAvailability(supabaseReturning(rows), NOW);

  const availability = index.byNpsCampgroundId.get('cg-1');
  assert.ok(availability, 'deploying ahead of the sync must not go dark');
  assert.equal(availability!.sitesOpen, 8);
  assert.deepEqual(availability!.nights, []);
});

test('a missing weekend night drops the sentence rather than mislabelling it', async () => {
  // The nights array can have gaps; the SENTENCE cannot. "8 of 54 · Fri–Sun"
  // has to have measured both of those nights.
  const rows = HORIZON.filter((date) => date !== WEEKEND[0]).map((date) => night(date, 8));
  const index = await loadAvailability(supabaseReturning(rows), NOW);
  assert.equal(index.byNpsCampgroundId.get('cg-1'), undefined);
});

/* ── Staleness ────────────────────────────────────────────────────────────── */

test('rows older than the freshness window are ignored entirely', async () => {
  const rows = HORIZON.map((date) => night(date, 8, 54, 'open', '2026-07-01T09:00:00Z'));
  const index = await loadAvailability(supabaseReturning(rows), NOW);
  assert.equal(index.byNpsCampgroundId.get('cg-1'), undefined, 'stale beats confident');
});

test('the reported timestamp is the weakest night, not the freshest', async () => {
  const rows = HORIZON.map((date, i) =>
    night(date, 8, 54, 'open', i === 4 ? '2026-08-05T09:00:00Z' : '2026-08-06T09:00:00Z'),
  );
  const index = await loadAvailability(supabaseReturning(rows), NOW);
  assert.equal(index.byNpsCampgroundId.get('cg-1')!.fetchedAt, '2026-08-05T09:00:00Z');
});

/* ── Nothing to say is not "fully booked" ─────────────────────────────────── */

test('a feed with no bookable inventory reports nothing, not zero', async () => {
  const rows = HORIZON.map((date) => night(date, 0, 0, 'full'));
  const index = await loadAvailability(supabaseReturning(rows), NOW);
  assert.equal(index.byNpsCampgroundId.get('cg-1'), undefined);
});

test('a read failure renders as it did before the feature existed', async () => {
  const builder = {
    select: () => builder,
    in: () => builder,
    eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
  };
  const index = await loadAvailability({ from: () => builder } as never, NOW);
  assert.equal(index.byNpsCampgroundId.size, 0);
  assert.equal(index.byNearbyServiceId.size, 0);
});

/* ── What the strip needs ─────────────────────────────────────────────────── */

test('nights arrive ascending, and carry the facility for the site request', async () => {
  const rows = [...HORIZON].reverse().map((date) => night(date, 8));
  const index = await loadAvailability(supabaseReturning(rows), NOW);
  const availability = index.byNpsCampgroundId.get('cg-1')!;

  assert.deepEqual(
    availability.nights.map((n) => n.date),
    HORIZON,
  );
  assert.equal(availability.facilityId, 'fac-1');
});

/* ── One campground, three names ──────────────────────────────────────────── */
//
// Eddy stores the same physical place in three tables and a caller only ever
// holds one of those ids. Meramec is an access point AND a nearby_services row;
// Alley Spring is an access point AND an nps_campgrounds row. Indexing under
// every id the facility names is what lets any caller find it.

function facilityNight(meta: Record<string, unknown>, date: string) {
  return {
    date,
    sites_open: 8,
    sites_reservable: 54,
    status: 'open',
    fetched_at: '2026-08-06T09:00:00Z',
    campsite_facilities: {
      id: 'fac-x',
      source: 'mo_state_parks',
      kind: 'campground',
      enabled: true,
      access_point_id: null,
      nps_campground_id: null,
      nearby_service_id: null,
      ...meta,
    },
  };
}

test('a facility is findable by every id it names', async () => {
  const rows = WEEKEND.map((date) =>
    facilityNight(
      { access_point_id: 'ap-9', nearby_service_id: 'svc-9', nps_campground_id: 'cg-9' },
      date,
    ),
  );
  const index = await loadAvailability(supabaseReturning(rows), NOW);

  assert.ok(index.byAccessPointId.get('ap-9'), 'the id the map pin carries');
  assert.ok(index.byNearbyServiceId.get('svc-9'), 'the id the services list carries');
  assert.ok(index.byNpsCampgroundId.get('cg-9'), 'the id the NPS record carries');
  // One object under three keys, not three readings that could drift.
  assert.equal(index.byAccessPointId.get('ap-9'), index.byNearbyServiceId.get('svc-9'));
});

test('a state park reached only through a service row still resolves by access point', async () => {
  // THE Meramec case. Its campsite_facilities row hangs off nearby_services and
  // it has no nps_campgrounds row at all, so before the access_point_id link
  // existed its Camping tab rendered static rows while the database held 68 of
  // its 197 sites open.
  const rows = WEEKEND.map((date) =>
    facilityNight({ access_point_id: 'ap-meramec', nearby_service_id: 'svc-meramec' }, date),
  );
  const index = await loadAvailability(supabaseReturning(rows), NOW);

  assert.ok(index.byAccessPointId.get('ap-meramec'));
  assert.equal(index.byNpsCampgroundId.size, 0, 'no NPS row, and none invented');
});

test('an unlinked facility is indexed nowhere rather than under undefined', async () => {
  const rows = WEEKEND.map((date) => facilityNight({}, date));
  const index = await loadAvailability(supabaseReturning(rows), NOW);

  assert.equal(index.byAccessPointId.size, 0);
  assert.equal(index.byNpsCampgroundId.size, 0);
  assert.equal(index.byNearbyServiceId.size, 0);
});
