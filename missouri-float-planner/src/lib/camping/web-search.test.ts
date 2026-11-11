import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactStay,
  filteredStay,
  groupCampgrounds,
  parseWebStay,
  shippingFilters,
  siteFlags,
  stayLabel,
  webPlanningWindow,
} from './web-search';
import { loadWebStaySnapshots, loadSiteCatalog } from './web-inventory';
import { searchCampingStay } from './stay';
import type { CampsiteSitesResult } from './sites';
import type { TrackedCampground } from './overview-types';
import { campsitePolicy } from './policies';
import { currentPolicyStay, campingStayLabel } from '../../../shared/camping-policy';
const now = new Date('2026-11-10T18:00:00Z');

test('web cards and site details retain reviewed policies without a nightly observation', async () => {
  const checked = new Date('2026-11-11T18:00:00Z');
  const winter = { startDate: '2026-11-16', endDate: '2026-11-18', nights: ['2026-11-16', '2026-11-17'], label: '' };
  const catalog = [
    { id: 'a', facility_id: 'f', name: 'A01', loop: 'Loop A', site_type: 'TENT ONLY NONELECTRIC', max_occupancy: null, source_site_id: '7288' },
    { id: 'b', facility_id: 'f', name: 'B23', loop: 'Loop B', site_type: 'TENT ONLY NONELECTRIC', max_occupancy: null, source_site_id: 'b23' },
  ];
  const db = { from(table: string) {
    const q = { select: () => q, in: () => q, order: () => q,
      range: async () => ({ data: table === 'campsite_sites' ? catalog : [], error: null }) };
    return q;
  } } as never;
  const snapshot = (await loadWebStaySnapshots(db, [], winter, checked, {
    facilityIds: ['f'], sources: new Map([['f', 'recreation_gov']]), sourceFacilityIds: new Map([['f', '234043']]),
  })).get('f')!;
  const stay = searchCampingStay(snapshot, winter.startDate, winter.endDate, checked);
  assert.equal(stay.fetchedAt, null);
  assert.deepEqual(stay.sites.map(s => s.state), ['unavailable', 'first_come']);
  assert.deepEqual(stay.availableSites, []);
  const compact = compactStay(stay, 'recreation_gov');
  const answer = filteredStay([compact], [], checked.getTime());
  assert.equal(answer.state, 'first_come');
  assert.equal(answer.count, 1);
  assert.equal(stayLabel(answer), 'First come · No reservations');
  assert.equal(filteredStay([compact], ['Tent'], checked.getTime()).state, 'first_come');
  const closedOnly = compactStay({ ...stay, sites: stay.sites.slice(0, 1) }, 'recreation_gov');
  assert.equal(filteredStay([closedOnly], [], checked.getTime()).state, 'closed');
  const site = currentPolicyStay(stay.sites[0], false, checked.getTime());
  assert.equal(campingStayLabel(site), 'Closed for your stay');
  const expiry = Date.parse(stay.sites[0].site.policy!.reviewBy);
  assert.equal(filteredStay([compact], [], expiry).state, 'unknown');
  assert.equal(currentPolicyStay(stay.sites[1], false, expiry).state, 'unknown');
});

test('a cached web bucket does not prolong observed openings until a policy review date', () => {
  const checked = new Date('2026-11-11T18:00:00Z');
  const data = fixture(['AA']);
  data.fetchedAt = checked.toISOString();
  data.sites[0].policy = campsitePolicy('recreation_gov', '234043', { name: 'B23', loop: 'Loop B' });
  const stay = searchCampingStay(data, data.window.startDate, data.window.endDate, checked);
  const summary = compactStay(stay, 'recreation_gov');
  assert.equal(filteredStay([summary], [], checked.getTime()).state, 'available');
  assert.equal(filteredStay([summary], [], checked.getTime() + 259200000).state, 'unknown');
  // If a short-lived rule expires while an observation is still fresh, use
  // the original observation, not the closure that the rule had supplied.
  data.sites[0].policy = { ...data.sites[0].policy!, reviewBy: '2026-11-11T19:00:00Z', periods: [{
    startDate: '2026-11-11', endDateExclusive: '2027-03-15', bookingMethod: 'first_come', operation: 'closed',
  }] };
  const restricted = compactStay(searchCampingStay(data, data.window.startDate, data.window.endDate, checked), 'recreation_gov');
  assert.equal(filteredStay([restricted], [], checked.getTime()).state, 'closed');
  assert.equal(filteredStay([restricted], [], Date.parse('2026-11-11T19:00:00Z')).state, 'available');
});

test('a web tab crossing Central midnight updates Tonight and rejects yesterday', () => {
  const before = webPlanningWindow(Date.parse('2026-11-12T05:59:00Z'));
  const after = webPlanningWindow(Date.parse('2026-11-12T06:01:00Z'));
  assert.equal(before.horizon.startDate, '2026-11-11');
  assert.equal(after.horizon.startDate, '2026-11-12');
  assert.equal(after.horizon.nights.length, 90);
  assert.equal(parseWebStay(new URLSearchParams({ arrival: '2026-11-11', departure: '2026-11-12' }), after.horizon), null);
  assert.ok(parseWebStay(new URLSearchParams({ arrival: '2026-11-12', departure: '2026-11-13' }), after.horizon));
});
const window = {
  startDate: '2026-11-13',
  endDate: '2026-11-15',
  label: '',
  nights: ['2026-11-13', '2026-11-14'],
};
function fixture(
  codes: string[],
  kinds: (string | null)[] = [],
): CampsiteSitesResult {
  return {
    facility: {
      id: 'f',
      displayName: 'Fixture campground',
      kind: 'campground',
      source: 'recreation_gov',
    },
    window,
    fetchedAt: now.toISOString(),
    sites: codes.map((nights, i) => ({
      id: String(i),
      name: String(i),
      loop: null,
      siteType: kinds[i] ?? null,
      maxOccupancy: null,
      bookingUrl: null,
      nights,
    })),
  };
}
function result(codes: string[], kinds: (string | null)[] = []) {
  return compactStay(
    searchCampingStay(
      fixture(codes, kinds),
      window.startDate,
      window.endDate,
      now,
    ),
    'recreation_gov',
  );
}
const answer = (codes: string[], kinds: (string | null)[] = []) =>
  filteredStay([result(codes, kinds)], [], now.getTime());
test('web cap is 14 occupied nights, checkout exclusive and bounds strict', () => {
  const horizon = { startDate: '2026-11-10', endDateExclusive: '2027-02-08' };
  for (const [query, valid] of [
    ['arrival=2026-11-10&departure=2026-11-24', true],
    ['arrival=2026-11-10&departure=2026-11-25', false],
    ['arrival=2027-02-07&departure=2027-02-08', true],
    ['arrival=2027-02-08&departure=2027-02-09', false],
    ['arrival=2026-11-09&departure=2026-11-10', false],
    ['arrival=2026-11-31&departure=2026-12-02', false],
    ['arrival=2026-11-10&departure=2026-11-10', false],
    ['arrival=2026-11-10&departure=2026-11-12&types=Tent', false],
    ['arrival=2026-11-10&arrival=2026-11-11&departure=2026-11-12', false],
  ] as const)
    assert.equal(
      Boolean(parseWebStay(new URLSearchParams(query), horizon)),
      valid,
      query,
    );
});
test('qualified positives survive missing inventory, zeros do not', () => {
  assert.equal(answer(['AA', '--']).count, 1);
  assert.equal(answer(['AA', '--']).partial, true);
  assert.equal(
    answer([...Array(5).fill('RR'), ...Array(35).fill('--')]).state,
    'unknown',
  );
  assert.equal(answer(['AR', 'RA']).state, 'unavailable');
  assert.equal(answer(['CC']).state, 'closed');
  assert.equal(answer(['NN']).state, 'not_yet_released');
  assert.equal(answer(['WW']).state, 'first_come');
  assert.equal(
    stayLabel(answer(['CC', 'NN', 'RR'])),
    'No sites for the whole stay',
  );
  assert.equal(answer(['AO']).state, 'available');
  assert.equal(answer(['OO']).state, 'not_yet_released');
});
test('unknown type blocks a filtered zero only when the site could still satisfy the stay', () => {
  for (const code of ['AA', 'A-', 'WW'])
    assert.equal(
      filteredStay([result([code])], ['Tent'], now.getTime()).state,
      'unknown',
    );
  assert.equal(
    filteredStay([result(['RR'])], ['Tent'], now.getTime()).state,
    'no_match',
  );
  const mixed = result(
    ['AA', 'AA', 'AA'],
    ['TENT ONLY NONELECTRIC', 'RV ELECTRIC', null],
  );
  assert.deepEqual(filteredStay([mixed], ['Tent', 'Electric'], now.getTime()), {
    state: 'available',
    count: 2,
    partial: true,
  });
});
test('provider vocabularies preserve uncertainty and gate each filter independently', () => {
  assert.deepEqual(
    siteFlags({ name: 'Basic #001', siteType: null }, 'mo_state_parks'),
    { Tent: null, RV: null, Electric: false },
  );
  assert.equal(
    siteFlags({ name: 'Electric #001', siteType: null }, 'recreation_gov')
      .Electric,
    null,
  );
  assert.equal(
    siteFlags(
      { name: '001', siteType: 'STANDARD NONELECTRIC' },
      'recreation_gov',
    ).Electric,
    false,
  );
  assert.deepEqual(
    shippingFilters([
      result(Array(100).fill('AA'), [
        ...Array(95).fill('STANDARD ELECTRIC'),
        ...Array(5).fill(null),
      ]),
    ]),
    ['Electric'],
  );
  assert.deepEqual(shippingFilters([result(['AA'])]), []);
});
test('cached summaries expire on the browser clock', () => {
  const f = result(['AA']);
  assert.equal(
    filteredStay([f], [], now.getTime() + 259200000).state,
    'unknown',
  );
  assert.equal(filteredStay([f], [], now.getTime() - 1).state, 'unknown');
  assert.equal(
    filteredStay(
      [
        f,
        {
          facilityId: 'missing-loop',
          fetchedAt: null,
          catalogSites: 0,
          buckets: [],
        },
      ],
      [],
      now.getTime(),
    ).partial,
    true,
  );
});
test('verified place identity groups loops, provider district identity never merges campgrounds', () => {
  const camps = [
    { facilityId: 'loop-a', place: { type: 'access_point', id: 'camp-a' } },
    { facilityId: 'loop-b', place: { type: 'access_point', id: 'camp-a' } },
    {
      facilityId: 'district-loop-c',
      place: { type: 'nps_campground', id: 'camp-b' },
    },
    { facilityId: 'orphan', place: null },
  ] as TrackedCampground[];
  const groups = groupCampgrounds(camps);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups[0].facilities.map((c) => c.facilityId),
    ['loop-a', 'loop-b'],
  );
  assert.equal(groups[2].key, 'facility:orphan');
});
test('batch reads the catalog even when just five sites have rows, and rejects mixed snapshots', async () => {
  const catalog = Array.from({ length: 40 }, (_, i) => ({
    id: String(i),
    facility_id: 'f',
  }));
  const rows = catalog.slice(0, 5).flatMap((s) =>
    window.nights.map((date) => ({
      site_id: s.id,
      date,
      status: 'reserved',
      fetched_at: now.toISOString(),
      campsite_sites: { facility_id: 'f' },
    })),
  );
  const db = {
    from(table: string) {
      const data = table === 'campsite_sites' ? catalog : rows;
      const q = {
        select: () => q,
        in: () => q,
        order: () => q,
        range: async (a: number, b: number) => ({
          data: data.slice(a, b + 1),
          error: null,
        }),
      };
      return q;
    },
  } as never;
  const observations = window.nights.map((date) => ({
    facilityId: 'f',
    date,
    fetchedAt: now.toISOString(),
  }));
  const first = searchCampingStay((await loadWebStaySnapshots(db, observations, window, now)).get('f')!, window.startDate, window.endDate, now);
  assert.equal(first.sites.length, 40);
  assert.equal(first.summary, null);
  assert.equal(first.sites.filter((s) => s.state === 'unknown').length, 35);
  observations.forEach((o) => (o.fetchedAt = '2026-11-10T17:00:00Z'));
  const mixed = searchCampingStay((await loadWebStaySnapshots(db, observations, window, now)).get('f')!, window.startDate, window.endDate, now);
  assert.ok(mixed.sites.every((s) => s.state === 'unknown'));
});

test('catalog pages beyond the API ceiling and stops on the explicit read budget', async () => {
  const rows = Array.from({ length: 1100 }, (_, i) => ({
    id: String(i),
    facility_id: 'f',
  }));
  const offsets: number[] = [];
  const q = {
    select: () => q,
    in: () => q,
    order: () => q,
    range: async (a: number, b: number) => {
      offsets.push(a);
      return { data: rows.slice(a, b + 1), error: null };
    },
  };
  const db = { from: () => q } as never;
  assert.equal((await loadSiteCatalog(db, ['f'])).length, 1100);
  assert.deepEqual(offsets, [0, 900]);
  await assert.rejects(
    loadSiteCatalog(db, ['f'], { maxSites: 1000 }),
    /budget/,
  );
  const signal = AbortSignal.abort();
  await assert.rejects(loadSiteCatalog(db, ['f'], { signal }));
});

test('catalog changes during a read fail safely instead of hiding a new site', async () => {
  const q = (data: unknown[]) => {
    const query = {
      select: () => query,
      in: () => query,
      order: () => query,
      range: async () => ({ data, error: null }),
    };
    return query;
  };
  const db = {
    from: (table: string) =>
      q(
        table === 'campsite_sites'
          ? [{ id: 'old', facility_id: 'f' }]
          : [
              {
                site_id: 'new',
                date: window.startDate,
                status: 'open',
                fetched_at: now.toISOString(),
                campsite_sites: { facility_id: 'f' },
              },
            ],
      ),
  } as never;
  await assert.rejects(
    loadWebStaySnapshots(
      db,
      [
        {
          facilityId: 'f',
          date: window.startDate,
          fetchedAt: now.toISOString(),
        },
      ],
      window,
      now,
    ),
    /catalog changed/,
  );
});
