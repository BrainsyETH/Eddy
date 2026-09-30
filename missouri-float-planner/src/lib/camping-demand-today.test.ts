import assert from 'node:assert/strict';
import test from 'node:test';
import {
  todayCampingDemand,
  campingPulseDetail,
  campingPulseCoverage,
  campingPulseHeadline,
  campingPulseReading,
  campingPulseAccessibilityLabel,
  campingPulseInfo,
  todayPopularCamping,
} from '../../../eddy-ios/src/lib/campingDemand';
import { campingDemand, demandDetail, type DemandBand } from '../../shared/camping-demand';
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
  assert.equal(campingPulseDetail(demand), '43% of tracked campsites booked');
});

function riverSample(slugs: string[]) {
  const o = overview();
  const template = o.tracked.find((c) => c.facilityId === 'akers')!;
  o.tracked = slugs.map((slug) => ({
    ...template, id: slug, facilityId: slug, riverSlugs: [slug],
    displayGroup: { key: slug, label: `${slug} River` },
    nights: template.nights.map((night) => ({ ...night })),
  }));
  return o;
}

test('popular camping uses curated order, one row per river, and at most five usable readings', () => {
  const o = riverSample(['zulu', 'niangua', 'buffalo', 'meramec', 'current', 'jacks-fork', 'alpha']);
  // A campground serving two rivers must not create a duplicate river row.
  o.tracked[0].riverSlugs.push('current');
  const rows = todayPopularCamping(o, now.getTime());
  assert.deepEqual(rows.map((r) => r.slug), ['current', 'jacks-fork', 'buffalo', 'meramec', 'niangua']);
  assert.equal(rows[0].name, 'current River');
  assert.ok(rows.every((r) => r.demand.date === '2026-09-29' && r.demand.band !== null));
  o.tracked.reverse();
  assert.deepEqual(todayPopularCamping(o, now.getTime()).map((r) => r.slug), rows.map((r) => r.slug));
});

test('unusable popular rivers cannot displace covered rivers or pad the Today card', () => {
  const o = riverSample(['current', 'jacks-fork', 'buffalo', 'meramec', 'niangua', 'huzzah', 'zulu', 'alpha']);
  o.tracked[0].nights = []; // Missing tonight.
  o.tracked[1].nights[0].checkedAt = '2026-09-26T17:00:00Z'; // Expired.
  o.tracked[2].nights[0].status = 'closed';
  o.tracked[3].source = 'mo_state_parks'; // Not a demand-compatible feed.
  o.tracked[4].nights[0].status = 'not_yet_released';
  o.tracked[5].nights[0] = { ...o.tracked[5].nights[0], sitesOpen: 0, sitesReservable: 1, status: 'full' };
  assert.deepEqual(todayPopularCamping(o, now.getTime()).map((r) => r.slug), ['alpha', 'zulu']);
  o.tracked = o.tracked.slice(0, 6);
  assert.deepEqual(todayPopularCamping(o, now.getTime()), []);
});

test('Today keeps fully booked rivers when the reading is usable', () => {
  const o = riverSample(['current']);
  o.tracked[0].nights[0] = { ...o.tracked[0].nights[0], sitesOpen: 0, status: 'full' };
  const rows = todayPopularCamping(o, now.getTime());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].demand.band, 'packed');
});

test('popular camping uses actual river totals and drops missing tonight at Chicago midnight', () => {
  const beforeMidnight = todayPopularCamping(overview(), Date.parse('2026-09-30T04:59:59Z'));
  const current = beforeMidnight.find((r) => r.slug === 'current')!;
  assert.equal(current.demand.date, '2026-09-29');
  assert.deepEqual(campingPulseReading(current.demand), { percent: 60, label: '60%' });
  assert.equal(beforeMidnight.find((r) => r.slug === 'buffalo')!.demand.booked, 0.1);
  assert.deepEqual(todayPopularCamping(overview(), Date.parse('2026-09-30T05:00:00Z')), []);
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
  assert.equal(campingPulseDetail(demand), '20% of checked campsites booked');
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
  assert.equal(campingPulseHeadline(demand), 'Checked sites fully booked');
  assert.deepEqual(campingPulseReading(demand), { percent: 100, label: '100%' });
  const spoken = campingPulseAccessibilityLabel(demand, 'Ozarks');
  assert.match(spoken, /Ozarks camping tonight. Checked sites fully booked. 100% of checked campsites booked/);
  assert.match(spoken, /Checked today/);
  assert.match(spoken, /2 unavailable/);
  assert.doesNotMatch(spoken, /Packed/);
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
  assert.equal(campingPulseDetail(demand), '100% of checked campsites booked');
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

test('the summary distinguishes zero bookings, Packed, and an unavailable reading', () => {
  const o = riverSample(['current']);
  const night = o.tracked[0].nights[0];
  night.sitesOpen = night.sitesReservable;
  assert.equal(campingPulseHeadline(todayCampingDemand(o, now.getTime())), 'Plenty of sites open');
  assert.deepEqual(campingPulseReading(todayCampingDemand(o, now.getTime())), { percent: 0, label: '0%' });
  night.sitesOpen = 0;
  night.status = 'full';
  assert.equal(campingPulseHeadline(todayCampingDemand(o, now.getTime())), 'Tracked sites fully booked');
  assert.deepEqual(campingPulseReading(todayCampingDemand(o, now.getTime())), { percent: 100, label: '100%' });
  o.tracked[0].nights = [];
  assert.equal(campingPulseHeadline(todayCampingDemand(o, now.getTime())), 'Not enough data');
  assert.equal(campingPulseReading(todayCampingDemand(o, now.getTime())), null);
});

test('all Quiet rows remain separate, and changing demand never changes popular order', () => {
  const o = riverSample(['buffalo', 'current', 'jacks-fork']);
  for (const [i, c] of o.tracked.entries()) {
    c.nights[0].sitesReservable = 100;
    c.nights[0].sitesOpen = [78, 92, 93][i];
  }
  const quietRows = todayPopularCamping(o, now.getTime());
  assert.deepEqual(quietRows.map((r) => [r.slug, campingPulseReading(r.demand)?.label]), [
    ['current', '8%'], ['jacks-fork', '7%'], ['buffalo', '22%'],
  ]);
  assert.ok(quietRows.every((r) => r.demand.band === 'quiet'));
  o.tracked[0].nights[0].sitesOpen = 10; // Buffalo gets busy, but stays third.
  assert.deepEqual(todayPopularCamping(o, now.getTime()).map((r) => r.slug), quietRows.map((r) => r.slug));
});

test('bar widths use actual percentages and labels cannot round away the last open or booked site', () => {
  const o = riverSample(['current']);
  const night = o.tracked[0].nights[0];
  night.sitesReservable = 1000;
  for (const [bookedSites, label] of [[1, '<1%'], [84, '8%'], [224, '22%'], [999, '>99%']] as const) {
    night.sitesOpen = 1000 - bookedSites;
    const reading = campingPulseReading(todayCampingDemand(o, now.getTime()))!;
    assert.ok(Math.abs(reading.percent - bookedSites / 10) < 1e-10);
    assert.equal(reading.label, label);
    assert.ok(campingPulseAccessibilityLabel(todayCampingDemand(o, now.getTime()), 'Current River').includes(`${label} of tracked campsites booked`));
  }
});

test('the short legend explains the number and preserves partial coverage and reading age', () => {
  const o = broadSample();
  for (const c of o.tracked) for (const n of c.nights) n.checkedAt = '2026-09-28T17:00:00Z';
  const info = campingPulseInfo(todayCampingDemand(o, now.getTime()));
  assert.match(info, /Tonight’s bookings across tracked Ozarks Recreation.gov campsites/);
  assert.match(info, /Longer bars mean more campsites booked/);
  assert.match(info, /Quiet: under 30% · green/);
  assert.match(info, /Moderate: 30–under 60% · yellow/);
  assert.match(info, /Busy: 60–under 85% · orange/);
  assert.match(info, /Crowded: 85%\+ · red/);
  assert.match(info, /Packed: 100%, with full coverage/);
  assert.match(info, /8 Recreation.gov campgrounds · Checked yesterday · 2 unavailable/);
  assert.match(info, /Excludes state parks, walk-up sites and day floaters/);
  assert.ok(info.split(/\s+/).length < 80, 'the info tip remains scannable');
  assert.doesNotMatch(campingPulseInfo(null), /undefined|null|Checked|unavailable/);
});

import { lightPalette, darkPalette } from '../../../eddy-ios/src/theme/palette';
import { campingMeterColor } from '../../../eddy-ios/src/theme/campingDemand';
test('every availability color clears graphical contrast against its track in both themes', () => {
  const luminance = (hex: string) => {
    const linear = [1, 3, 5].map((offset) => {
      const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  for (const colors of [lightPalette, darkPalette]) {
    for (const band of ['quiet', 'moderate', 'busy', 'crowded', 'packed'] satisfies DemandBand[]) {
      const [low, high] = [luminance(campingMeterColor(band, colors.scheme)), luminance(colors.selectionBg)]
        .sort((a, b) => a - b);
      assert.ok((high + 0.05) / (low + 0.05) >= 3, `${colors.scheme} ${band}`);
    }
  }
});
