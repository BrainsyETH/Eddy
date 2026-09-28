import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCampingOverview,
  safeCampingUrl,
  type OverviewInput,
  type ObservationRow,
} from './overview';
import type { CampingOverview as Server } from './overview-types';
import type { CampingOverview as App } from '../../../../packages/eddy-types';
// Both directions, including optionality. A runtime text-presence test cannot establish wire parity.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const parity: Equal<Server, App> = true;
const now = new Date('2026-09-28T12:00:00Z');
function input(): OverviewInput {
  return {
    facilities: [
      {
        id: 'f',
        display_name: 'Test campground',
        source: 'recreation_gov',
        source_facility_id: '123',
        source_loop: null,
        enabled: true,
        kind: 'campground',
        access_point_id: null,
        nearby_service_id: 's',
        nps_campground_id: null,
        latest: [],
      },
    ],
    observations: [],
    services: [
      {
        id: 's',
        name: 'Service',
        type: 'campground',
        latitude: 36,
        longitude: -92,
        reservation_url: 'https://www.recreation.gov/camping/campgrounds/123',
      },
    ],
    nps: [],
    access: [],
    identities: [],
    serviceRivers: [],
    rivers: [],
  };
}
function night(overrides: Partial<ObservationRow> = {}): ObservationRow {
  return {
    facility_id: 'f',
    date: '2026-09-28',
    sites_open: 3,
    sites_reservable: 10,
    status: 'open',
    fetched_at: '2026-09-28T09:00:00Z',
    ...overrides,
  };
}
test('wire types agree', () => assert.equal(parity, true));
test('standalone facility remains discoverable with no observations and no false never claim', () => {
  const r = buildCampingOverview(input(), now);
  assert.equal(r.tracked.length, 1);
  assert.equal(r.tracked[0].freshness, 'unknown');
  assert.equal(r.tracked[0].serviceId, 's');
  assert.deepEqual(r.tracked[0].nights, []);
  assert.equal(r.untracked.length, 0);
});
test('only fresh valid nights survive, without dropping the facility or filling gaps', () => {
  const i = input();
  i.observations = [
    night(),
    night({ date: '2026-09-29', fetched_at: '2026-09-24T09:00:00Z' }),
    night({ date: '2026-09-30', fetched_at: '2026-09-29T09:00:00Z' }),
  ];
  const r = buildCampingOverview(i, now).tracked[0];
  assert.equal(r.freshness, 'fresh');
  assert.deepEqual(
    r.nights.map((n) => n.date),
    ['2026-09-28'],
  );
});
test('old observation remains a stale row; outside-horizon fresh observation does not certify the horizon', () => {
  const i = input();
  i.facilities[0].latest = [{ fetched_at: '2026-09-28T09:00:00Z' }];
  assert.equal(buildCampingOverview(i, now).tracked[0].freshness, 'stale');
});
test('expired horizon data keeps its actual timestamp', () => {
  const i = input();
  i.observations = [night({ fetched_at: '2026-09-24T09:00:00Z' })];
  const r = buildCampingOverview(i, now).tracked[0];
  assert.equal(r.freshness, 'stale');
  assert.equal(r.latestObservationAt, '2026-09-24T09:00:00Z');
  assert.equal(r.nights.length, 0);
});
test('72-hour boundary is expired; sparse provider status is preserved', () => {
  const i = input();
  i.observations = [
    night({ fetched_at: '2026-09-25T12:00:00Z' }),
    night({
      date: '2026-09-29',
      status: 'closed',
      sites_open: 0,
      sites_reservable: 0,
    }),
    night({
      date: '2026-09-30',
      status: 'not_yet_released',
      sites_open: 0,
      sites_reservable: 0,
    }),
  ];
  const r = buildCampingOverview(i, now).tracked[0];
  assert.deepEqual(
    r.nights.map((n) => n.status),
    ['closed', 'not_yet_released'],
  );
});
test('invalid counts are unknown, not advertised availability', () => {
  const i = input();
  i.observations = [
    night({ sites_open: 20 }),
    night({ date: '2026-09-29', sites_open: -1 }),
    night({ date: '2026-09-30', sites_open: 0, status: 'open' }),
  ];
  assert.equal(buildCampingOverview(i, now).tracked[0].nights.length, 0);
});
test('disabled facility returns its campground to untracked unless another enabled facility covers it', () => {
  const i = input();
  i.facilities[0].enabled = false;
  assert.equal(buildCampingOverview(i, now).untracked.length, 1);
  i.facilities.push({ ...i.facilities[0], id: 'other', enabled: true });
  assert.equal(buildCampingOverview(i, now).untracked.length, 0);
});
test('verified place aliases deduplicate and provide a navigable access destination', () => {
  const i = input();
  i.nps = [{ id: 'n', name: 'NPS', sites_first_come: 2 }];
  i.access = [{ id: 'a', river_id: 'r', nps_campground_id: 'n' }];
  i.identities = [
    {
      access_point_id: 'a',
      nearby_service_id: 's',
      relationship: 'same_place',
      verified_at: '2026-09-01',
    },
  ];
  i.rivers = [{ id: 'r', slug: 'current', name: 'Current River' }];
  const r = buildCampingOverview(i, now);
  assert.deepEqual(r.tracked[0].place, { type: 'access_point', id: 'a' });
  assert.equal(r.tracked[0].firstCome, 'present');
  assert.equal(r.untracked.length, 0);
});
test('nearby or unverified associations never transfer campground identity', () => {
  const i = input();
  i.access = [{ id: 'a', river_id: 'r', nps_campground_id: null }];
  i.identities = [
    {
      access_point_id: 'a',
      nearby_service_id: 's',
      relationship: 'nearby',
      verified_at: '2026-09-01',
    },
  ];
  assert.deepEqual(buildCampingOverview(i, now).tracked[0].place, {
    type: 'service',
    id: 's',
  });
});
test('untracked verified aliases appear once', () => {
  const i = input();
  i.facilities = [];
  i.nps = [{ id: 'n', name: 'NPS' }];
  i.access = [{ id: 'a', river_id: 'r', nps_campground_id: 'n' }];
  i.identities = [
    {
      access_point_id: 'a',
      nearby_service_id: 's',
      relationship: 'same_place',
      verified_at: '2026-09-01',
    },
  ];
  assert.equal(buildCampingOverview(i, now).untracked.length, 1);
});
test('loops remain available and an overlapping aggregate is excluded', () => {
  const i = input();
  i.facilities[0].source_loop = 'Loop A';
  i.facilities.push({ ...i.facilities[0], id: 'g', source_loop: 'Loop B' });
  assert.equal(buildCampingOverview(i, now).tracked.length, 2);
  assert.equal(
    buildCampingOverview(i, now).tracked[0].booking?.label,
    'Book through district permit',
  );
  i.facilities.push({ ...i.facilities[0], id: 'h', source_loop: null });
  const result = buildCampingOverview(i, now);
  assert.deepEqual(result.tracked.map(r => r.facilityId).sort(), ['f', 'g']);
  assert.equal(result.untracked.length, 0);
});
test('multiple rivers produce one deterministic group, with all memberships retained', () => {
  const i = input();
  i.rivers = [
    { id: 'a', slug: 'current', name: 'Current' },
    { id: 'b', slug: 'jacks-fork', name: 'Jacks Fork' },
  ];
  i.serviceRivers = [
    { service_id: 's', river_id: 'a', is_primary: false },
    { service_id: 's', river_id: 'b', is_primary: true },
  ];
  const r = buildCampingOverview(i, now).tracked[0];
  assert.equal(r.displayGroup.key, 'jacks-fork');
  assert.deepEqual(r.riverSlugs, ['jacks-fork', 'current']);
});
test('urls reject active content and credentialed links', () => {
  assert.equal(safeCampingUrl('javascript:alert(1)'), null);
  assert.equal(safeCampingUrl('https://user:pass@example.com'), null);
  assert.equal(safeCampingUrl('http://example.com'), null);
});

import { loadCampingOverview } from './overview';
import type { SupabaseClient } from '@supabase/supabase-js';

test('loader propagates a database failure instead of returning false empty coverage', async () => {
  const builder = {
    select: () => builder, order: () => builder, limit: () => builder,
    eq: () => builder, not: () => builder, gte: () => builder, lt: () => builder,
    range: () => Promise.resolve({data:null,error:{message:'unavailable'}}),
  };
  await assert.rejects(loadCampingOverview({from:()=>builder} as unknown as SupabaseClient,now),/database read failed/);
});

test('loader paginates directory records beyond the default page without N+1 facility reads', async () => {
  const ranges: number[]=[];
  const db={from:(table:string)=>{
    const builder={select:()=>builder,order:()=>builder,limit:()=>builder,eq:()=>builder,not:()=>builder,gte:()=>builder,lt:()=>builder,
      range:(a:number)=>{
        if(table==='nearby_services') {
          ranges.push(a);
          return Promise.resolve({data:Array.from({length:a===0?500:1},(_,n)=>({id:`s${a+n}`,name:`Camp ${a+n}`,type:'campground'})),error:null});
        }
        return Promise.resolve({data:[],error:null});
      }};
    return builder;
  }};
  const result=await loadCampingOverview(db as unknown as SupabaseClient,now);
  assert.equal(result.untracked.length,501);
  assert.deepEqual(ranges,[0,500]);
});

test('zero-reservable nights retain successful observations and freshness', () => {
  const i = input();
  i.observations = [night({ status: 'full', sites_open: 0, sites_reservable: 0 })];
  const r = buildCampingOverview(i, now).tracked[0];
  assert.equal(r.freshness, 'fresh');
  assert.equal(r.nights.length, 1);
  assert.equal(r.nights[0].checkedAt, i.observations[0].fetched_at);
  assert.equal(r.latestObservationAt, i.observations[0].fetched_at);
  assert.equal(r.nights[0].sitesReservable, 0);
});
