import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cellMark,
  nightLine,
  campingNightPages,
  currentNight,
  cardSummary,
  campingDate,
  sortCamping,
  todayCampgrounds,
  campingSections,
} from '../../../eddy-ios/src/lib/campingHeatmap';
import { buildCampingOverview } from './camping/overview';
import type {
  CampingObservation,
  TrackedCampground,
} from '../../../packages/eddy-types';
const now = Date.parse('2026-09-28T12:00:00Z');
const overview = buildCampingOverview(
  {
    facilities: [],
    observations: [],
    services: [],
    nps: [],
    access: [],
    identities: [],
    serviceRivers: [],
    rivers: [],
  },
  new Date(now),
);
function night(n: number): CampingObservation {
  return {
    date: '2026-09-28',
    sitesOpen: n,
    sitesReservable: 100,
    status: n ? 'open' : 'full',
    checkedAt: '2026-09-28T09:00:00Z',
  };
}
function row(id = 'a'): TrackedCampground {
  return {
    id,
    facilityId: id,
    serviceId: null,
    name: id,
    place: null,
    location: { lat: 37, lng: -91 },
    riverSlugs: ['current'],
    displayGroup: { key: 'current', label: 'Current' },
    managingAgency: null,
    website: null,
    reservationUrl: null,
    firstCome: 'unknown',
    accessDestination: null,
    loopName: null,
    source: 'recreation_gov',
    booking: null,
    latestObservationAt: null,
    expectedReservable: null,
    freshness: 'unknown',
    nights: [],
  };
}
test('count buckets preserve every boundary and unknown is distinct from zero', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 9, 10].map((n) => cellMark(night(n))),
    ['full', 'open-1', 'open-1', 'open-2', 'open-2', 'open-3'],
  );
  assert.equal(cellMark(), 'unknown');
  assert.equal(cellMark({ ...night(0), sitesReservable: 0 }), 'no-reservable');
  assert.equal(cellMark({ ...night(0), status: 'closed' }), 'closed');
  assert.equal(cellMark({ ...night(0), status: 'not_yet_released' }), 'nyr');
});
test('cached observations expire per night with one response policy', () => {
  const r = row();
  r.nights = [night(2)];
  assert.ok(currentNight(r, '2026-09-28', 259200, now));
  assert.equal(
    currentNight(r, '2026-09-28', 259200, now + 259200000),
    undefined,
  );
  assert.equal(currentNight(r, '2026-09-29', 259200, now), undefined);
});
test('Chicago midnight and DST are date-safe', () => {
  assert.equal(campingDate(Date.parse('2026-09-28T04:59:00Z')), '2026-09-27');
  assert.equal(campingDate(Date.parse('2026-09-28T05:00:00Z')), '2026-09-28');
  assert.equal(campingDate(Date.parse('2026-11-01T07:30:00Z')), '2026-11-01');
});
test('summary requires every selected night; counts represent the full named population', () => {
  const a = row();
  a.nights = overview.weekend.nights.map((date) => ({ ...night(3), date }));
  const b = row('b');
  b.nights = [a.nights[0]];
  assert.match(
    cardSummary([a, b], overview, now),
    /^1 of 2.*1 not fully checked/,
  );
  b.nights = [...a.nights];
  b.nights[1] = { ...b.nights[1], status: 'closed', sitesOpen: 0 };
  assert.match(cardSummary([a, b], overview, now), /^1 of 2/);
  assert.doesNotMatch(cardSummary([b], overview, now), /season/);
});
test('availability does not change order; missing coordinates last with location', () => {
  const a = row('a'),
    b = row('b');
  b.location = null;
  const coords = { lat: 37, lng: -91 };
  assert.deepEqual(
    sortCamping([b, a], coords).map((r) => r.id),
    ['a', 'b'],
  );
  a.nights = [night(0)];
  b.nights = [night(90)];
  assert.deepEqual(
    sortCamping([b, a], coords).map((r) => r.id),
    ['a', 'b'],
  );
});
test('nearby scope never pads itself with distant saved places', () => {
  const a = row(),
    b = row('b');
  b.location = { lat: 44, lng: -100 };
  const result = todayCampgrounds(
    [a, b],
    { lat: 37, lng: -91 },
    new Set(['current']),
  );
  assert.equal(result.title, 'Camping near you');
  assert.equal(result.rows.length, 1);
});
test('multi-river campground has only one section membership', () => {
  const a = row();
  a.riverSlugs.push('jacks-fork');
  assert.equal(
    campingSections([a], null, new Set()).flatMap((s) => s.data).length,
    1,
  );
});

import { campingHeatmapEnabled } from '../../../eddy-ios/src/lib/campingFeature';
test('heatmap fails closed for missing, failed, or malformed configuration', () => {
  for (const f of [
    null,
    undefined,
    {},
    true,
    { campingHeatmap: false },
    { campingHeatmap: 'true' },
  ])
    assert.equal(campingHeatmapEnabled(f), false);
  assert.equal(campingHeatmapEnabled({ campingHeatmap: true }), true);
});

import { currentOverview } from '../../../eddy-ios/src/lib/campingHeatmap';
test('cached calendar rolls forward without inventing observations', () => {
  const next = currentOverview(overview, now + 86400000);
  assert.equal(next.horizon.startDate, '2026-09-29');
  assert.equal(next.horizon.nights.length, 14);
  assert.equal(next.generatedAt, overview.generatedAt);
});

test('zero-reservable observations are checked without implying first-come availability', () => {
  const n = { ...night(0), sitesReservable: 0 };
  assert.equal(nightLine(n), 'No reservable sites');
  const r = row();
  r.nights = overview.weekend.nights.map((date) => ({ ...n, date }));
  assert.doesNotMatch(cardSummary([r], overview, now), /not fully checked/);
  assert.equal(cellMark({ ...n, status: 'closed' }), 'closed');
  assert.equal(cellMark({ ...n, status: 'not_yet_released' }), 'nyr');
});
test('night pages are two disjoint pages that keep every Friday/Saturday pair together', () => {
  for (let offset = 0; offset < 7; offset++) {
    const dates = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 28 + offset + i)).toISOString().slice(0, 10),
    );
    const pages = campingNightPages(dates);
    // Every start weekday, Saturday included, yields two pages with no repeats.
    assert.equal(pages.length, 2, `start ${dates[0]}`);
    assert.deepEqual(pages.flat(), dates);
    assert.ok(pages.every((p) => p.length >= 6 && p.length <= 8));
    dates.forEach((d, i) => {
      if (i < 13 && new Date(d + 'T12:00:00Z').getUTCDay() === 5)
        assert.ok(pages.some((p) => p.includes(d) && p.includes(dates[i + 1])));
    });
  }
});

import {
  campingFreshness,
  campingRowNeedsUpdate,
  filterCamping,
} from '../../../eddy-ios/src/lib/campingHeatmap';
test('compact freshness only summarizes visible current observations', () => {
  const a = row();
  a.nights = [night(2)];
  assert.equal(campingFreshness([a], overview, now), 'Updated at 4:00 AM');
  assert.equal(campingRowNeedsUpdate(a, overview, now), false);
  const b = row('b');
  b.nights = [{ ...night(0), checkedAt: '2026-09-27T12:00:00Z' }];
  assert.equal(campingFreshness([a, b], overview, now), 'Updated on Sep 27');
  assert.equal(campingFreshness([a], overview, now + 259200000), 'Not updated');
  assert.equal(campingRowNeedsUpdate(a, overview, now + 259200000), true);
  assert.equal(campingRowNeedsUpdate(row('missing'), overview, now), true);
});
test('river and nearby filters intersect and do not invent a location', () => {
  const a = row('near'),
    b = row('far'),
    c = row('standalone');
  b.location = { lat: 44, lng: -100 };
  c.riverSlugs = [];
  const all = [a, b, c];
  assert.deepEqual(
    filterCamping(all, 'current', true, a.location).map((r) => r.id),
    ['near'],
  );
  assert.equal(filterCamping(all, null, false, null).length, 3);
  assert.equal(filterCamping(all, null, true, null).length, 0);
  assert.equal(filterCamping(all, 'missing', false, null).length, 0);
});

import {
  initialCampingNight,
  campingRiverOptions,
  checkedLabel,
} from '../../../eddy-ios/src/lib/campingHeatmap';
test('planning opens on the first weekend night within the horizon', () => {
  assert.equal(initialCampingNight(overview), overview.weekend.nights[0]);
  const saturday = {
    ...overview,
    horizon: {
      ...overview.horizon,
      startDate: overview.weekend.nights[1],
      nights: overview.horizon.nights.filter(
        (d) => d >= overview.weekend.nights[1],
      ),
    },
  };
  assert.equal(initialCampingNight(saturday), overview.weekend.nights[1]);
  assert.equal(
    initialCampingNight({
      ...overview,
      weekend: { ...overview.weekend, nights: [] },
    }),
    overview.horizon.startDate,
  );
});
test('updates use Chicago time and the oldest current observation', () => {
  assert.equal(checkedLabel('2026-09-28T04:59:00Z', now), 'Updated on Sep 27');
  assert.equal(checkedLabel(null, now), 'Not updated');
  const a = row();
  a.nights = [
    night(3),
    { ...night(3), date: '2026-09-29', checkedAt: '2026-09-28T10:00:00Z' },
  ];
  assert.equal(campingFreshness([a], overview, now), 'Updated at 4:00 AM');
});
test('river filters retain curated names and exclude untracked-only rivers', () => {
  const a = row();
  a.displayGroup.label = 'Current River';
  const b = row('untracked');
  b.riverSlugs = ['jacks-fork'];
  b.displayGroup = { key: 'jacks-fork', label: 'Jacks Fork River' };
  assert.deepEqual(campingRiverOptions([a], [b]), [
    { slug: 'current', label: 'Current River' },
  ]);
  a.riverSlugs.push('jacks-fork');
  assert.deepEqual(campingRiverOptions([a], [b]), [
    { slug: 'current', label: 'Current River' },
    { slug: 'jacks-fork', label: 'Jacks Fork River' },
  ]);
});

import { calendarDays, campingMonths, monthSelection } from '../../../eddy-ios/src/lib/campingCalendar';
test('calendar aligns Sunday weeks and handles leap days and year boundaries', () => {
  const leap = calendarDays('2028-02');
  assert.equal(leap[0], null);
  assert.ok(leap.includes('2028-02-29'));
  assert.equal(leap.length % 7, 0);
  assert.ok(!calendarDays('2027-02').includes('2027-02-29'));
  const nights = ['2026-12-31', '2027-01-01'];
  assert.deepEqual(campingMonths(nights), ['2026-12', '2027-01']);
  assert.equal(monthSelection('2026-12', nights), '2026-12-31');
  assert.equal(monthSelection('2027-02', nights), undefined);
});


import { createCampingTapGuard } from '../../../eddy-ios/src/lib/campingScroll';
test('horizontal and vertical pans cannot open a campground on release', () => {
  const tap = createCampingTapGuard();
  tap.start(20, 20); tap.move(60, 20); tap.move(20, 20);
  assert.equal(tap.allowed(), false, 'returning to the starting point is still a pan');
  tap.start(20, 20); tap.move(20, 60);
  assert.equal(tap.allowed(), false);
  tap.start(20, 20); tap.move(22, 23);
  assert.equal(tap.allowed(), true);
  tap.cancel(); assert.equal(tap.allowed(), false);
});

import { observedCampingOverview, campingCoverageLabel, campingRowSummary } from '../../../eddy-ios/src/lib/campingHeatmap';
test('coverage trims only trailing unknowns across the visible rows', () => {
  const a = row(), b = row('b');
  a.nights = [night(2), { ...night(0), date: '2026-10-01', status: 'closed' }];
  b.nights = [{ ...night(0), date: '2026-10-03', status: 'not_yet_released' }];
  const visible = observedCampingOverview([a], overview, now);
  assert.equal(visible.horizon.nights.at(-1), '2026-10-01');
  assert.ok(visible.horizon.nights.includes('2026-09-29'), 'internal gap stays visible');
  assert.equal(campingCoverageLabel(visible), 'Through Oct 1');
  assert.equal(observedCampingOverview([a,b], overview, now).horizon.nights.at(-1), '2026-10-03');
  assert.equal(observedCampingOverview([a,b], overview, now + 72 * 3600000).horizon.nights.length, 0);
  assert.equal(campingCoverageLabel(observedCampingOverview([], overview, now)), 'No recent availability');
  assert.equal(overview.horizon.nights.length, 14, 'calendar horizon is not mutated');
});
test('VoiceOver summarizes weekend observations and only claims observed next openings', () => {
  const a = row();
  a.nights = [{ ...night(14), date: '2026-10-02' }, { ...night(9), date: '2026-10-03' }, { ...night(1), date: '2026-10-07' }];
  const text = campingRowSummary(a, overview, now);
  assert.match(text, /14 open/); assert.match(text, /9 open/); assert.match(text, /Next observed opening:.*Oct 7/);
  const stale = campingRowSummary(a, overview, now + 72 * 3600000);
  assert.match(stale, /not checked/); assert.doesNotMatch(stale, /Next observed opening/);
});
