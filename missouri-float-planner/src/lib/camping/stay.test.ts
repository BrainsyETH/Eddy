import assert from 'node:assert/strict';
import test from 'node:test';
import { searchCampingStay } from './stay';
import { stayGridNights } from './stay-grid';
import { validPlanningStay } from './stay-read';
import { stayNights, nextCampingDate } from '../../../shared/camping-stay';
import type { CampsiteSitesResult } from './sites';
import type { UnitStatus } from './types';
const NOW = new Date('2026-10-15T12:00:00Z');
const dates = ['2026-10-16', '2026-10-17'];
function snapshot(codes: string[]): CampsiteSitesResult {
  return {
    facility: {
      id: 'park',
      displayName: 'Park',
      kind: 'campground',
      source: 'recreation_gov',
    },
    window: {
      startDate: dates[0],
      endDate: dates[1],
      label: '',
      nights: dates,
    },
    fetchedAt: NOW.toISOString(),
    sites: codes.map((nights, i) => ({
      id: String(i),
      name: null,
      loop: null,
      siteType: null,
      maxOccupancy: null,
      bookingUrl: null,
      nights,
    })),
  };
}
function search(codes: string[]) {
  return searchCampingStay(snapshot(codes), dates[0], '2026-10-18', NOW);
}

test('the same site must be open on every occupied night', () => {
  const result = search(['AR', 'RA', 'AA']);
  assert.deepEqual(
    result.availableSites.map((s) => s.id),
    ['2'],
  );
  assert.equal(result.summary?.sitesOpen, 1);
  assert.equal(result.summary?.sitesReservable, 3);
  assert.equal(search(['AR', 'RA']).summary?.sitesOpen, 0);
});
test('a closed or unreleased night cannot be skipped to invent a whole stay', () => {
  assert.deepEqual(search(['AC', 'NA']).availableSites, []);
  assert.equal(search(['CC']).summary?.status, 'closed');
  assert.equal(search(['NN']).summary?.status, 'not_yet_released');
});
test('unknown nights suppress the summary; first-come requires the same site', () => {
  assert.equal(search(['A-']).summary, null);
  assert.equal(search(['WW', 'WA']).summary?.sitesWalkUp, 1);
  assert.deepEqual(search(['WW']).availableSites, []);
  assert.equal(search([]).summary, null);
});
test('checkout is exclusive, including the last planning night and DST', () => {
  const one = searchCampingStay(snapshot(['AR']), dates[0], dates[1], NOW);
  assert.equal(one.availableSites.length, 1);
  assert.deepEqual(
    stayNights({ arrival: '2026-10-31', departure: '2026-11-02' }),
    ['2026-10-31', '2026-11-01'],
  );
  assert.equal(
    validPlanningStay({ arrival: '2027-01-12', departure: '2027-01-13' }, NOW),
    true,
  );
  for (const stay of [
    { arrival: '2026-02-30', departure: '2026-03-02' },
    { arrival: '2026-10-16', departure: '2026-10-16' },
    { arrival: '2026-10-16', departure: '2026-10-15' },
    { arrival: 'no', departure: 'date' },
    { arrival: '2026-10-16', departure: '2027-02-01' },
  ])
    assert.deepEqual(stayNights(stay), []);
  assert.equal(
    validPlanningStay({ arrival: '2026-10-14', departure: '2026-10-16' }, NOW),
    false,
  );
  assert.equal(
    validPlanningStay({ arrival: '2027-01-12', departure: '2027-01-14' }, NOW),
    false,
  );
});
test('stale, missing and future timestamps never establish available sites', () => {
  for (const fetchedAt of [
    null,
    'bad',
    '2026-10-12T12:00:00Z',
    '2026-10-16T00:00:00Z',
  ]) {
    const result = searchCampingStay(
      { ...snapshot(['AA']), fetchedAt },
      dates[0],
      '2026-10-18',
      NOW,
    );
    assert.deepEqual(result.availableSites, []);
    assert.equal(result.summary, null);
  }
});
test('the persisted grid is the same one-night stay projection as the detail search', () => {
  const statuses: UnitStatus[] = [
    'open',
    'reserved',
    'walk_up',
    'closed',
    'not_yet_released',
  ];
  const codes = ['AA', 'RR', 'WW', 'CC', 'NN'];
  const grid = stayGridNights(
    {
      sites: [],
      siteNights: dates.flatMap((date) =>
        statuses.map((status, i) => ({
          date,
          status,
          sourceSiteId: String(i),
        })),
      ),
      nights: dates.map((date) => ({
        date,
        sitesOpen: 99,
        sitesReservable: 99,
        status: 'open',
      })),
    },
    NOW,
  );
  for (const night of grid) {
    const detail = searchCampingStay(
      snapshot(codes),
      night.date,
      nextCampingDate(night.date),
      NOW,
    );
    assert.equal(night.sitesOpen, detail.availableSites.length);
    assert.equal(night.sitesReservable, detail.summary?.sitesReservable);
  }
  assert.equal(grid[0].sitesOpen, 1);
});
test('grid preserves explicit facility closures but never invents bookable inventory without site nights', () => {
  const grid = stayGridNights(
    {
      sites: [],
      siteNights: [],
      nights: [
        { date: dates[0], sitesOpen: 99, sitesReservable: 99, status: 'open' },
        { date: dates[1], sitesOpen: 0, sitesReservable: 0, status: 'closed' },
      ],
    },
    NOW,
  );
  assert.deepEqual(
    grid.map((n) => n.date),
    [dates[1]],
  );
});

import { loadStaySummaries } from './stay-summary';
import { currentCampingStay } from '../../../../eddy-ios/src/lib/campingStay';
test('batched card summaries page beyond 900 rows and keep campground identities separate', async () => {
  const rows = Array.from({ length: 500 }, (_, i) =>
    dates.map((date) => ({
      site_id: String(i),
      date,
      status: 'open',
      fetched_at: NOW.toISOString(),
      campsite_sites: { facility_id: i < 250 ? 'a' : 'b' },
    })),
  ).flat();
  const offsets: number[] = [];
  const q = {
    select: () => q,
    in: () => q,
    order: () => q,
    range: async (from: number, to: number) => {
      offsets.push(from);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  const observations = ['a', 'b'].flatMap((facilityId) =>
    dates.map((date) => ({ facilityId, date, fetchedAt: NOW.toISOString() })),
  );
  const results = await loadStaySummaries(
    { from: () => q } as never,
    observations,
    { startDate: dates[0], endDate: '2026-10-18', nights: dates, label: '' },
    NOW,
  );
  assert.deepEqual(offsets, [0, 900]);
  assert.equal(results.get('a')?.summary?.sitesOpen, 250);
  assert.equal(results.get('b')?.summary?.sitesOpen, 250);
});
test('a batched site-night read failure throws instead of reporting zero openings', async () => {
  const q = {
    select: () => q,
    in: () => q,
    order: () => q,
    range: async () => ({ data: null, error: { message: 'offline' } }),
  };
  await assert.rejects(
    loadStaySummaries(
      { from: () => q } as never,
      [{ facilityId: 'a', date: dates[0], fetchedAt: NOW.toISOString() }],
      { startDate: dates[0], endDate: '2026-10-18', nights: dates, label: '' },
      NOW,
    ),
    /offline/,
  );
});
test('the mobile detail sheet displays the server classifications and expires them without recomputing availability', () => {
  const result = search(['AA', 'AR', 'WW']);
  assert.equal(currentCampingStay(result, 259200, NOW.getTime()), result.sites);
  const expired = currentCampingStay(result, 259200, NOW.getTime() + 259200000);
  assert.equal(expired.length, 3);
  assert.ok(
    expired.every(
      (s) =>
        s.state === 'unknown' && s.nights.every((n) => n.state === 'unknown'),
    ),
  );
  assert.deepEqual(currentCampingStay(null, 259200, NOW.getTime()), []);
});
