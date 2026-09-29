import assert from 'node:assert/strict';
import test from 'node:test';
import {
  todayCampingDemand,
  campingPulseDetail,
  campingPulseCoverage,
} from '../../../eddy-ios/src/lib/campingDemand';
import { campingDemand, demandDetail } from '../../shared/camping-demand';
import { crowdSignalEnabled } from '../../../eddy-ios/src/lib/campingFeature';
import { buildCampingOverview, type ObservationRow } from './camping/overview';

// Tuesday noon in the Ozarks. Weekend data must not drive Today's reading.
const now = new Date('2026-09-29T17:00:00Z');

function obs(facility: string, date: string, open: number, reservable = 50): ObservationRow {
  return {
    facility_id: facility,
    date,
    sites_open: open,
    sites_reservable: reservable,
    status: open ? 'open' : 'full',
    fetched_at: '2026-09-29T14:00:00Z',
  };
}
function overview() {
  const facility = (id: string, source: 'recreation_gov' | 'mo_state_parks', service: string) => ({
    id,
    display_name: id,
    source,
    source_facility_id: id,
    source_loop: null,
    enabled: true,
    kind: 'campground',
    access_point_id: null,
    nearby_service_id: service,
    nps_campground_id: null,
    latest: [],
  });
  const service = (id: string) => ({ id, name: id, type: 'campground', latitude: 37, longitude: -91 });
  return buildCampingOverview(
    {
      facilities: [
        facility('akers', 'recreation_gov', 's-akers'),
        facility('pulltite', 'recreation_gov', 's-pulltite'),
        facility('steel', 'recreation_gov', 's-steel'),
        facility('standalone', 'recreation_gov', 's-standalone'),
        facility('meramec-sp', 'mo_state_parks', 's-meramec'),
      ],
      observations: [
        obs('akers', '2026-09-29', 10),
        obs('pulltite', '2026-09-29', 50, 100),
        obs('steel', '2026-09-29', 45),
        obs('standalone', '2026-09-29', 20, 20),
        obs('meramec-sp', '2026-09-29', 0, 500),
        obs('akers', '2026-10-03', 0),
        obs('pulltite', '2026-10-03', 0, 100),
        obs('steel', '2026-10-03', 0),
        obs('standalone', '2026-10-03', 0, 20),
        obs('meramec-sp', '2026-10-03', 0),
      ],
      services: ['akers', 'pulltite', 'steel', 'standalone', 'meramec'].map((n) => service('s-' + n)),
      nps: [],
      access: [],
      identities: [],
      serviceRivers: [
        { service_id: 's-akers', river_id: 'r-current', is_primary: true },
        { service_id: 's-akers', river_id: 'r-jacks', is_primary: false },
        { service_id: 's-pulltite', river_id: 'r-current', is_primary: true },
        { service_id: 's-steel', river_id: 'r-buffalo', is_primary: true },
        { service_id: 's-meramec', river_id: 'r-meramec', is_primary: true },
      ],
      rivers: [
        { id: 'r-current', slug: 'current', name: 'Current River' },
        { id: 'r-jacks', slug: 'jacks-fork', name: 'Jacks Fork' },
        { id: 'r-buffalo', slug: 'buffalo', name: 'Buffalo River' },
        { id: 'r-meramec', slug: 'meramec', name: 'Meramec River' },
      ],
    },
    now,
    21,
  );
}

test('Today rates tonight across the region, weighted by sites, not campground or river averages', () => {
  const demand = todayCampingDemand(overview(), now.getTime());
  assert.equal(demand.date, '2026-09-29');
  assert.equal(demand.riverSlug, null);
  // Multi-river Akers counts once; standalone sites count; state parks do not.
  assert.equal(demand.campgroundsCounted, 4);
  assert.equal(demand.reservableSites, 220);
  assert.equal(demand.bookedSites, 95);
  assert.equal(demand.booked, 95 / 220);
  assert.equal(demand.band, 'moderate');
  assert.equal(campingPulseDetail(demand), '43% of tracked campsites booked tonight');
});

test('duplicate facility entries cannot increase the regional total', () => {
  const o = overview();
  o.tracked.push({ ...o.tracked.find((c) => c.facilityId === 'akers')! });
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.reservableSites, 220);
  assert.equal(demand.bookedSites, 95);
  assert.equal(demand.campgroundsCounted, 4);
});

test('tonight follows Chicago midnight and DST even when the cached horizon starts earlier', () => {
  for (const [instant, date] of [
    ['2026-09-30T04:59:59Z', '2026-09-29'],
    ['2026-09-30T05:00:00Z', '2026-09-30'],
    ['2026-11-02T05:59:59Z', '2026-11-01'],
    ['2026-11-02T06:00:00Z', '2026-11-02'],
    ['2026-03-09T04:59:59Z', '2026-03-08'],
    ['2026-03-09T05:00:00Z', '2026-03-09'],
  ]) {
    const demand = todayCampingDemand(overview(), Date.parse(instant));
    assert.equal(demand.date, date, instant);
    assert.equal(demand.leadDays, 0);
  }
});

test('missing tonight never falls back to the fully booked weekend', () => {
  const o = overview();
  for (const c of o.tracked) c.nights = c.nights.filter((n) => n.date !== '2026-09-29');
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.date, '2026-09-29');
  assert.equal(demand.band, null);
  assert.equal(demand.withheld, 'missing_observations');
});

test('a small regional sample with unsized missing inventory still withholds', () => {
  const o = overview();
  const missing = o.tracked.find((c) => c.facilityId === 'akers')!;
  missing.nights = [];
  missing.expectedReservable = null;
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.band, null);
  assert.equal(demand.coverage, null);
  assert.equal(demand.withheld, 'unsized_missing');
  assert.match(campingPulseDetail(demand), /couldn’t be checked/);
});

function broadSample(counted = 8, total = 10) {
  const o = overview();
  const template = o.tracked.find((c) => c.facilityId === 'akers')!;
  o.tracked = Array.from({ length: total }, (_, i) => ({
    ...template,
    facilityId: `campground-${i}`,
    expectedReservable: i < counted ? 25 : null,
    nights: i < counted ? [{
      date: '2026-09-29', sitesOpen: 20, sitesReservable: 25,
      status: 'open' as const, checkedAt: '2026-09-29T14:00:00Z',
    }] : [],
  }));
  return o;
}

test('a broad regional sample can rate without inventing missing capacity', () => {
  const o = broadSample();
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.band, 'quiet');
  assert.equal(demand.booked, 0.2);
  assert.equal(demand.reservableSites, 200);
  assert.equal(demand.coverage, null);
  assert.equal(demand.completeCoverage, false);
  assert.equal(demand.campgroundsMissingUnsized, 2);
  assert.equal(campingPulseDetail(demand), '20% of checked campsites booked tonight');
  assert.equal(campingPulseCoverage(demand), 'Based on 8 campgrounds · 2 unavailable');
  assert.match(demandDetail(demand), /20% of checked campsites booked/);
  assert.match(demandDetail(demand), /8 campgrounds checked · 2 unavailable/);
  // The exception is regional, never applied to a river rating.
  assert.equal(campingDemand(o, 'current', '2026-09-29', now.getTime()).withheld, 'unsized_missing');
});

test('regional fallback still withholds when too many campgrounds are missing or the sample is small', () => {
  for (const o of [broadSample(7, 10), broadSample(4, 5)]) {
    const demand = todayCampingDemand(o, now.getTime());
    assert.equal(demand.band, null);
    assert.equal(demand.withheld, 'unsized_missing');
    assert.equal(campingPulseCoverage(demand), null);
  }
});

test('unknown capacity cannot hide a large known missing campground', () => {
  const o = broadSample();
  o.tracked[8].expectedReservable = 1000;
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.coverage, null);
  assert.equal(demand.band, null);
  assert.equal(demand.withheld, 'missing_observations');
});

test('a regional sample with unknown capacity cannot read as Packed', () => {
  const o = broadSample();
  for (const c of o.tracked) for (const n of c.nights) {
    n.sitesOpen = 0;
    n.status = 'full';
  }
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.band, 'crowded');
  assert.equal(demand.allObservedBooked, true);
  assert.equal(demand.completeCoverage, false);
});

test('partial coverage names the measured sample and cannot read as Packed', () => {
  const o = overview();
  o.tracked.find((c) => c.facilityId === 'akers')!.nights = [];
  for (const c of o.tracked) for (const night of c.nights) {
    night.sitesOpen = 0;
    night.status = 'full';
  }
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.band, 'crowded');
  assert.equal(demand.allObservedBooked, true);
  assert.equal(demand.completeCoverage, false);
  assert.equal(demand.coverage, 170 / 220);
  assert.equal(campingPulseDetail(demand), '100% of checked campsites booked tonight');
});

test('expired observations cannot produce a Quiet regional rating', () => {
  const o = overview();
  for (const c of o.tracked) for (const night of c.nights) {
    night.checkedAt = '2026-09-26T17:00:00Z';
    night.sitesOpen = night.sitesReservable;
  }
  const demand = todayCampingDemand(o, now.getTime());
  assert.equal(demand.band, null);
  assert.equal(demand.withheld, 'missing_observations');
});

test('crowd signal flag fails closed', () => {
  for (const f of [undefined, null, {}, { crowdSignal: 'true' }, { crowdSignal: 1 }])
    assert.equal(crowdSignalEnabled(f), false);
  assert.equal(crowdSignalEnabled({ crowdSignal: true }), true);
});
