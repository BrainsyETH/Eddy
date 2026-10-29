import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FacilitiesSection from '../../components/access-point/sections/FacilitiesSection';
import type { AccessPointDetail, CampsiteAvailabilityInfo, NPSCampgroundInfo } from '../../types/api';
import { generateNavLinks } from '../navigation/deepLinks';

const availability: CampsiteAvailabilityInfo = {
  window: { startDate: '2026-10-30', endDate: '2026-11-01', label: 'Fri–Sun, Oct 30–Nov 1' },
  sitesOpen: 74, sitesReservable: 171, status: 'open', kind: 'campground',
  source: 'mo_state_parks', fetchedAt: '2026-10-27T09:21:37Z', facilityId: 'park-83',
};
const booking = { url: 'https://icampmo1.usedirect.com/MSPWeb/#!park/83', source: 'mo_state_parks' as const };

function render(overrides: Partial<AccessPointDetail> = {}) {
  const accessPoint = {
    name: 'St. Francois State Park Access 2', type: 'access', types: ['access'],
    managingAgency: null, officialSiteUrl: null, facilities: null,
    feeRequired: false, npsCampground: null, availability: null, booking: null,
    ...overrides,
  } as AccessPointDetail;
  return renderToStaticMarkup(createElement(FacilitiesSection, { accessPoint }));
}

test('a separate canoe launch renders its linked state-park camping and booking', () => {
  const html = render({ availability, booking });
  assert.match(html, /74 of 171 sites open/);
  assert.match(html, /Make a reservation at Missouri State Parks/);
  assert.match(html, /href="https:\/\/icampmo1.usedirect.com\/MSPWeb\/#!park\/83"/);
  assert.doesNotMatch(html, /No facilities information/);
});

test('booking remains visible when the live calendar is unavailable', () => {
  const html = render({ booking });
  assert.match(html, /Make a reservation at Missouri State Parks/);
  assert.doesNotMatch(html, /sites open|No facilities information/);
  assert.match(render({ booking: { source: 'recreation_gov', url: 'https://www.recreation.gov/camping/campgrounds/232392' } }), /Make a reservation on Recreation.gov/);
});

test('only a verified false fee reads "No fee"; an unverified one says nothing', () => {
  const facilities = 'Concrete ramp, gravel parking';
  assert.match(render({ facilities, feeRequired: false }), /No fee/);
  assert.doesNotMatch(render({ facilities, feeRequired: null }), /No fee|Fee required/);
  assert.match(render({ facilities, feeRequired: true, feeNotes: '$5 day use' }), /\$5 day use/);
});

test('ordinary access points do not acquire a camping section', () => {
  const html = render();
  assert.match(html, /No facilities information available/);
  assert.doesNotMatch(html, /Make a reservation|>Camping</);
});

test('NPS camping keeps its existing single availability and reservation block', () => {
  const npsCampground = {
    name: 'NPS campground', fees: [], operatingHours: [],
    amenities: { toilets: [], potableWater: [], showers: [] },
    availability, reservationUrl: 'https://www.recreation.gov/camping/campgrounds/123',
  } as unknown as NPSCampgroundInfo;
  const html = render({ npsCampground, availability, booking });
  assert.equal(html.match(/74 of 171 sites open/g)?.length, 1);
  assert.equal(html.match(/Make a reservation/g)?.length, 1);
  assert.doesNotMatch(html, /icampmo1/);
});

test('St. Francois approach prose cannot replace navigation URLs', () => {
  const dossier = JSON.parse(readFileSync('scripts/ingestion/access-points/big-river.json', 'utf8')) as Array<{
    slug?: string; name: string; lat: number; lon: number;
    directions_override?: string | null; road_access?: string;
  }>;
  const launches = dossier.filter(row => row.slug?.startsWith('st-francois-state-park-access-'));
  assert.equal(launches.length, 2);
  for (const launch of launches) {
    assert.equal(launch.directions_override, null);
    assert.match(launch.road_access ?? '', /^Enter St\. Francois State Park/);
    const google = generateNavLinks({ lat: launch.lat, lng: launch.lon, label: launch.name }, launch.directions_override)
      .find(link => link.app === 'google');
    assert.equal(new URL(google!.webFallback).hostname, 'www.google.com');
    assert.equal(new URL(google!.webFallback).searchParams.get('query'), `${launch.lat},${launch.lon}`);
  }
});
