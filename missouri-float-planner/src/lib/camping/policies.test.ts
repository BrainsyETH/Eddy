import assert from 'node:assert/strict';
import test from 'node:test';
import { campsitePolicy } from './policies';
import { loadFacilitySitesForWindow, toWireStay, type CampsiteSitesResult } from './sites';
import { searchCampingStay } from './stay';
import { campingNightWithPolicy, campingPolicyNote, campingStayLabel, currentPolicyStay } from '../../../shared/camping-policy';
import { currentCampingStay } from '../../../../eddy-ios/src/lib/campingStay';
import { groupSites, listOutcome, sitesOnNight } from '../../../../eddy-ios/src/components/map-sheet/siteList';
import { siteBooking } from '../../../../eddy-ios/src/components/map-sheet/siteBooking';
import type { CampsiteSite } from '@eddy/types';

const NOW = new Date('2026-11-11T18:00:00Z');
const policy = (loop: string, name: string) => campsitePolicy('recreation_gov', '234043', { loop, name });
function snapshot(loop: string, name: string, nights = '--', startDate = '2026-11-16'): CampsiteSitesResult {
  return {
    facility: { id: 'buffalo-point', displayName: 'Buffalo Point', kind: 'campground', source: 'recreation_gov' },
    window: { startDate, endDate: '2026-11-18', label: '', nights: [startDate, '2026-11-17'] },
    fetchedAt: NOW.toISOString(),
    sites: [{ id: name, name, loop, nights, policy: policy(loop, name), siteType: null, maxOccupancy: null, bookingUrl: null }],
  };
}

test('verified Buffalo Point A/E closure applies on Nov 15, even when the feed says walk-up', () => {
  for (const loop of ['Loop A', 'Loop E']) {
    const p = policy(loop, 'A01');
    assert.equal(campingNightWithPolicy('unknown', '2026-11-14', p, NOW.getTime()), 'walk_up');
    assert.equal(campingNightWithPolicy('walk_up', '2026-11-15', p, NOW.getTime()), 'closed');
    assert.equal(campingNightWithPolicy('open', '2026-11-16', p, NOW.getTime()), 'closed');
    const result = searchCampingStay(snapshot(loop, 'A01'), '2026-11-16', '2026-11-18', NOW);
    assert.deepEqual(result.sites[0].nights.map(n => n.state), ['closed', 'closed']);
    assert.equal(campingStayLabel(result.sites[0]), 'Closed for your stay');
    assert.equal(campingPolicyNote(result.sites[0], NOW.getTime()), 'First-come site when open');
    assert.deepEqual(result.availableSites, []);
  }
});

test('published winter first-come policy survives a missing update without promising a reservable opening', () => {
  const data = snapshot('Loop B', 'B23');
  data.fetchedAt = null;
  const result = searchCampingStay(data, '2026-11-16', '2026-11-18', NOW);
  assert.equal(result.fetchedAt, null, 'a policy is not a new observation');
  assert.equal(result.sites[0].state, 'first_come');
  assert.equal(result.summary?.sitesWalkUp, 1);
  assert.deepEqual(result.availableSites, []);
  const onPhone = currentCampingStay(toWireStay(result), 259200, NOW.getTime());
  assert.equal(onPhone[0].state, 'first_come');
  assert.equal(campingStayLabel(onPhone[0]), 'First come · No reservations');
  assert.equal(campingPolicyNote(onPhone[0], NOW.getTime()), 'First come · Space is not guaranteed');
  const site: CampsiteSite = data.sites[0]; // Server/mobile optional policy contract stays compatible.
  const night = sitesOnNight([site], data.window.nights, '2026-11-16', NOW.getTime(), false)[0];
  assert.equal(night.state, 'walk_up');
  assert.equal(siteBooking(night.state, 'https://www.recreation.gov/camping/campsites/7288', 'https://www.recreation.gov/camping/campgrounds/234043'), null);
  data.fetchedAt = NOW.toISOString();
  data.sites[0].nights = 'AA';
  const reportedOpen = searchCampingStay(data, '2026-11-16', '2026-11-18', NOW);
  assert.equal(reportedOpen.sites[0].state, 'first_come');
  assert.deepEqual(reportedOpen.availableSites, [], 'a nightly open code cannot override a no-reservations policy');
});

test('policies have exact facility, public site, date and review limits', () => {
  assert.equal(policy('Loop B', 'B38'), undefined, 'host site');
  assert.equal(policy('Loop C', 'C01'), undefined);
  assert.equal(campsitePolicy('mo_state_parks', '234043', { loop: 'Loop A', name: 'A01' }), undefined);
  assert.equal(campsitePolicy('recreation_gov', 'other', { loop: 'Loop A', name: 'A01' }), undefined);
  const p = policy('Loop B', 'B23')!;
  assert.equal(campingNightWithPolicy('open', '2026-11-16', p, NOW.getTime()), 'walk_up', 'first-come policy never offers online reservations');
  assert.equal(campingNightWithPolicy('unknown', '2026-11-14', p, NOW.getTime()), 'unknown');
  assert.equal(campingNightWithPolicy('unknown', '2027-03-15', p, NOW.getTime()), 'unknown');
  assert.equal(campingNightWithPolicy('unknown', '2026-11-16', p, Date.parse(p.reviewBy)), 'unknown');
  assert.equal(campingNightWithPolicy('unknown', '2026-11-16', p, Date.parse(p.checkedAt) - 1), 'unknown');
  assert.equal(campingNightWithPolicy('unknown', '2026-11-16', p, NaN), 'unknown');
  for (const observed of ['reserved', 'closed', 'not_yet_released'] as const)
    assert.equal(campingNightWithPolicy(observed, '2026-11-16', p, NOW.getTime()), observed);
});

test('cached policy-derived states expire independently from observations on both clients', () => {
  for (const [loop, name] of [['Loop A', 'A01'], ['Loop B', 'B23']]) {
    const result = searchCampingStay(snapshot(loop, name), '2026-11-16', '2026-11-18', NOW);
    const entry = result.sites[0];
    assert.equal(entry.nights[0].observedState, 'unknown');
    const expired = Date.parse(entry.site.policy!.reviewBy);
    assert.equal(currentPolicyStay(entry, true, expired).state, 'unknown');
    assert.equal(currentCampingStay(result, 259200, expired)[0].state, 'unknown');
    assert.equal(campingPolicyNote(entry, expired), null);
    assert.notEqual(currentCampingStay(result, 259200, NOW.getTime() + 259200000)[0].state, 'unknown');
  }
  const result = searchCampingStay(snapshot('Loop C', 'C01', 'AA'), '2026-11-16', '2026-11-18', NOW);
  assert.equal(currentCampingStay(result, 259200, NOW.getTime() + 259200000)[0].state, 'unknown');
});

test('detail read retains missing sites and publishes rules without fabricating nightly observations', async () => {
  const rows = [
    { id: 'a', name: 'A01', loop: 'Loop A', source_site_id: '7288', site_type: null, max_occupancy: null },
    { id: 'b', name: 'B23', loop: 'Loop B', source_site_id: 'b23', site_type: null, max_occupancy: null },
    { id: 'c', name: 'C01', loop: 'Loop C', source_site_id: 'c01', site_type: null, max_occupancy: null },
  ];
  const db = { from(table: string) {
    const data = table === 'campsite_facilities'
      ? { id: 'buffalo-point', display_name: 'Buffalo Point', kind: 'campground', source: 'recreation_gov', source_facility_id: '234043' }
      : table === 'campsite_sites' ? rows : [];
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q,
      range: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
    return q;
  } } as never;
  const window = snapshot('Loop A', 'A01').window;
  const data = await loadFacilitySitesForWindow(db, 'buffalo-point', window, NOW);
  assert.ok(data);
  assert.equal(data.sites.length, 3);
  assert.ok(data.sites.every(s => s.nights === '--'));
  assert.equal(data.fetchedAt, null);
  assert.equal(data.sites[0].policy?.sourceUrl, 'https://www.nps.gov/buff/planyourvisit/buffalo-point-campground.htm');
  const result = searchCampingStay(data, '2026-11-16', '2026-11-18', NOW);
  assert.deepEqual(result.sites.map(s => s.state), ['unavailable', 'first_come', 'unknown']);
  assert.equal(result.summary, null, 'unreviewed sites stay unknown');
});

test('booked and unknown sites show no confirmed openings on iPhone, while all-booked stays definitive', () => {
  const base = snapshot('Loop C', 'C01').sites[0];
  const resolve = (codes: string[]) => sitesOnNight(codes.map((nights, i) => ({ ...base, id: String(i), nights })), ['2026-11-16'], '2026-11-16', NOW.getTime());
  for (const codes of [['R', '-'], ['C', '-'], ['N', '-']]) {
    const entries = resolve(codes);
    assert.equal(listOutcome(entries, groupSites(entries)), 'no_confirmed_openings');
  }
  const booked = resolve(['R', 'R']);
  assert.equal(listOutcome(booked, groupSites(booked)), 'none_open');
  const unknown = resolve(['-', '-']);
  assert.equal(listOutcome(unknown, groupSites(unknown)), 'unmeasured');
  const opening = resolve(['A', '-']);
  assert.equal(listOutcome(opening, groupSites(opening)), 'sites');
});
