import assert from 'node:assert/strict';
import test from 'node:test';
import {
  campingDemand,
  campingDemandByRiver,
  campingDemandRivers,
  demandBasis,
  demandDetail,
  demandHeadline,
  CAMPING_DEMAND_INFO,
  type DemandCampground,
  type DemandObservation,
  type DemandOverview,
} from './camping-demand';

// Noon Chicago on Tuesday, September 29, 2026.
const NOW = Date.parse('2026-09-29T17:00:00Z');
const TONIGHT = '2026-09-29';
const FRIDAY = '2026-10-02';
const CHECKED = '2026-09-29T14:00:00Z'; // 3 h ago

function night(
  open: number,
  reservable = 100,
  overrides: Partial<DemandObservation> = {},
): DemandObservation {
  return {
    date: TONIGHT,
    sitesOpen: open,
    sitesReservable: reservable,
    status: open > 0 ? 'open' : 'full',
    checkedAt: CHECKED,
    ...overrides,
  };
}
function camp(
  nights: DemandObservation[],
  overrides: Partial<DemandCampground> = {},
): DemandCampground {
  return {
    source: 'recreation_gov',
    riverSlugs: ['current'],
    expectedReservable: 100,
    nights,
    ...overrides,
  };
}
function overview(...tracked: DemandCampground[]): DemandOverview {
  return { maxObservationAgeSeconds: 72 * 3600, tracked };
}
const at = (o: DemandOverview, date = TONIGHT, river = 'current') =>
  campingDemand(o, river, date, NOW);

test('bands are half-open at 30, 60 and 85 percent', () => {
  const cases: Array<[number, string]> = [
    [0, 'quiet'],
    [29.99, 'quiet'],
    [30, 'moderate'],
    [59.99, 'moderate'],
    [60, 'busy'],
    [84.99, 'busy'],
    [85, 'crowded'],
    [99.99, 'crowded'],
  ];
  for (const [pctBooked, band] of cases) {
    // 10,000 sites so hundredths of a percent are representable.
    const open = Math.round(10_000 - pctBooked * 100);
    const d = at(overview(camp([night(open, 10_000)], { expectedReservable: 10_000 })));
    assert.equal(d.band, band, `${pctBooked}% booked`);
  }
});

test('Packed requires every eligible campground observed and full', () => {
  const d = at(overview(camp([night(0)]), camp([night(0)])));
  assert.equal(d.band, 'packed');
  assert.equal(d.allObservedBooked, false);
  assert.equal(demandHeadline(d), 'Packed');
});

test('all observed booked with a missing campground is not Packed', () => {
  // The reviewer's case: 50 observed and full, 50 missing.
  const d = at(
    overview(
      camp([night(0, 50)], { expectedReservable: 50 }),
      camp([], { expectedReservable: 50 }),
    ),
  );
  assert.equal(d.band, 'crowded');
  assert.equal(d.allObservedBooked, true);
  assert.equal(d.completeCoverage, false);
  assert.equal(d.coverage, 0.5);
  assert.equal(demandHeadline(d), 'All observed sites booked');
  assert.match(demandDetail(d), /50% of tracked capacity checked/);
});

test('zero-capacity full nights are no-inventory, not booked or closed', () => {
  const d = at(
    overview(
      camp([night(20, 40)], { expectedReservable: 40 }),
      camp([night(0, 0, { status: 'full' })], { expectedReservable: null }),
    ),
  );
  assert.equal(d.campgroundsNoInventory, 1);
  assert.equal(d.campgroundsClosed, 0);
  assert.equal(d.campgroundsFull, 0);
  assert.equal(d.band, 'moderate');
  assert.equal(d.completeCoverage, true);
});

test('Missouri State Park rows are ignored', () => {
  const d = at(overview(camp([night(0)], { source: 'mo_state_parks' })));
  assert.equal(d.withheld, 'no_tracked_campgrounds');
  assert.equal(d.band, null);
  assert.equal(demandDetail(d), 'No Recreation.gov campgrounds tracked on this river');
});

test('seasonal closure withholds instead of reading Quiet', () => {
  assert.equal(
    at(overview(camp([night(0, 0, { status: 'closed' })]))).withheld,
    'seasonal_closure',
  );
  // One small campground open, three closed: a smaller operating sample.
  const d = at(
    overview(
      camp([night(90, 100)]),
      camp([night(0, 0, { status: 'closed' })]),
      camp([night(0, 0, { status: 'not_yet_released' })]),
      camp([night(0, 0, { status: 'closed' })]),
    ),
  );
  assert.equal(d.withheld, 'seasonal_closure');
  assert.equal(demandHeadline(d), 'Not enough data');
});

test('booking not yet open and no reservable inventory are not called closed', () => {
  const unreleased = at(overview(camp([night(0, 0, { status: 'not_yet_released' })])));
  assert.equal(unreleased.withheld, 'booking_not_open');
  assert.equal(unreleased.campgroundsNotReleased, 1);
  assert.equal(unreleased.campgroundsClosed, 0);
  assert.match(demandDetail(unreleased), /Booking hasn’t opened/);
  const walkUp = at(overview(camp([night(0, 0, { status: 'open' })], { expectedReservable: null })));
  assert.equal(walkUp.withheld, 'no_reservable_inventory');
  assert.match(demandDetail(walkUp), /no reservable sites/);
  // Mostly unreleased with one open campground: the dominant reason wins.
  const mixed = at(
    overview(
      camp([night(90, 100)]),
      camp([night(0, 0, { status: 'not_yet_released' })]),
      camp([night(0, 0, { status: 'not_yet_released' })]),
    ),
  );
  assert.equal(mixed.withheld, 'booking_not_open');
});

test('missing campgrounds without a capacity baseline withhold the rating', () => {
  // The reviewer's case: one observed, nine missing and unsized. Treating the
  // nine as zero capacity read as "Quiet · 100% checked".
  const unsized = Array.from({ length: 9 }, () => camp([], { expectedReservable: null }));
  const d = at(overview(camp([night(90, 100)]), ...unsized));
  assert.equal(d.withheld, 'unsized_missing');
  assert.equal(d.band, null);
  assert.equal(d.coverage, null);
  assert.equal(d.campgroundsMissingUnsized, 9);
  assert.equal(demandHeadline(d), 'Not enough data');
});

test('coverage below half withholds as missing observations', () => {
  const d = at(
    overview(
      camp([night(50, 40)], { expectedReservable: 40 }),
      camp([], { expectedReservable: 60 }),
    ),
  );
  assert.equal(d.coverage, 0.4);
  assert.equal(d.withheld, 'missing_observations');
  assert.equal(at(overview(camp([]))).withheld, 'missing_observations');
});

test('fewer than twenty observed sites withholds as a small sample', () => {
  const d = at(overview(camp([night(5, 19)], { expectedReservable: 19 })));
  assert.equal(d.withheld, 'small_sample');
});

test('an expired reading is missing even if a cached response still carries it', () => {
  const d = at(
    overview(camp([night(10, 100, { checkedAt: '2026-09-26T16:00:00Z' })])),
  );
  assert.equal(d.campgroundsMissing, 1);
  assert.equal(d.withheld, 'missing_observations');
});

test('older-but-unexpired readings are not final and say so', () => {
  const d = at(overview(camp([night(80, 100, { checkedAt: '2026-09-28T09:00:00Z' })])));
  assert.equal(d.band, 'quiet');
  assert.equal(d.checkedRecently, false);
  assert.equal(d.final, false);
  assert.match(demandDetail(d), /booked so far$/);
  assert.equal(d.checkedDay, 'yesterday');
  assert.equal(demandBasis(d), '1 Recreation.gov campground · Checked yesterday');
});

test('checked yesterday afternoon is yesterday at noon today, even inside 26 hours', () => {
  // 1 p.m. Chicago Sept 28 → noon Chicago Sept 29 is 23 hours.
  const d = at(overview(camp([night(80, 100, { checkedAt: '2026-09-28T18:00:00Z' })])));
  assert.equal(d.checkedRecently, true);
  assert.equal(d.checkedDay, 'yesterday');
  assert.equal(d.final, false);
  assert.match(demandBasis(d), /Checked yesterday$/);
});

test('a reading two calendar days old says it may be out of date', () => {
  const d = at(overview(camp([night(80, 100, { checkedAt: '2026-09-27T20:00:00Z' })])));
  assert.equal(d.checkedDay, 'earlier');
  assert.match(demandBasis(d), /may be out of date/);
});

test('tonight freshly checked is final; future nights are booked so far', () => {
  const tonight = at(overview(camp([night(80)])));
  assert.equal(tonight.leadDays, 0);
  assert.equal(tonight.final, true);
  assert.equal(demandDetail(tonight), '20% of tracked campsites booked');
  assert.equal(demandBasis(tonight), '1 Recreation.gov campground · Checked today');
  const friday = at(overview(camp([night(80, 100, { date: FRIDAY })])), FRIDAY);
  assert.equal(friday.leadDays, 3);
  assert.equal(friday.final, false);
  assert.equal(demandDetail(friday), '20% of tracked campsites booked so far');
});

test('lead days follow the Chicago calendar, not UTC', () => {
  // 03:00 UTC Sept 30 is still the evening of Sept 29 in Chicago.
  const late = Date.parse('2026-09-30T03:00:00Z');
  const d = campingDemand(
    overview(camp([night(80, 100, { checkedAt: '2026-09-30T01:00:00Z' })])),
    'current',
    TONIGHT,
    late,
  );
  assert.equal(d.leadDays, 0);
});

test('site-weighted: a big campground outweighs a small one', () => {
  const d = at(
    overview(
      camp([night(0, 10)], { expectedReservable: 10 }), // small, full
      camp([night(90, 90)], { expectedReservable: 90 }), // big, empty
    ),
  );
  assert.equal(d.booked, 0.1);
  assert.equal(d.band, 'quiet');
});

test('a campground serving two rivers counts toward each river', () => {
  const shared = camp([night(20)], { riverSlugs: ['current', 'jacks-fork'] });
  const o = overview(shared);
  const byRiver = campingDemandByRiver(o, ['current', 'jacks-fork'], [TONIGHT], NOW);
  assert.equal(byRiver.get('current')![0].band, 'busy');
  assert.equal(byRiver.get('jacks-fork')![0].band, 'busy');
  assert.deepEqual(campingDemandRivers(o), ['current', 'jacks-fork']);
});

test('older server responses without expectedReservable still score', () => {
  const c = camp([night(50)]);
  delete c.expectedReservable;
  const d = at(overview(c));
  assert.equal(d.band, 'moderate');
  assert.equal(d.coverage, 1);
});

test('info tip names the source and the exclusions', () => {
  assert.match(CAMPING_DEMAND_INFO, /Recreation\.gov/);
  assert.match(CAMPING_DEMAND_INFO, /Missouri State Park/);
  assert.match(CAMPING_DEMAND_INFO, /walk-up/);
});
