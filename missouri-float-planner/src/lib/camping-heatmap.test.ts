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
  r.nights = overview.weekend.nights.map(date => ({ ...n, date }));
  assert.doesNotMatch(cardSummary([r], overview, now), /not fully checked/);
  assert.equal(cellMark({ ...n, status: 'closed' }), 'closed');
  assert.equal(cellMark({ ...n, status: 'not_yet_released' }), 'nyr');
});
test('seven-night pages cover every date and keep every Friday/Saturday pair together', () => {
  for (let offset = 0; offset < 7; offset++) {
    const dates = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 28 + offset + i)).toISOString().slice(0, 10));
    const pages = campingNightPages(dates);
    assert.ok(pages.every(p => p.length <= 7));
    assert.deepEqual([...new Set(pages.flat())], dates);
    dates.forEach((d, i) => {
      if (i < 13 && new Date(d + 'T12:00:00Z').getUTCDay() === 5)
        assert.ok(pages.some(p => p.includes(d) && p.includes(dates[i + 1])));
    });
  }
});
