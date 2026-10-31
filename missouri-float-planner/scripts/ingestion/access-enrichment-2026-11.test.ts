import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type Lot, type Proposal, addAmenities, agencyFromOwnershipText, agencyFromPadus, chooseLot,
  chooseManagingAgency, line, mdcParkingInfo, mvumRoadSurface, ownershipSpelling, parseCsv,
  sideOfRiver, toCsv, usfsHasRestroom,
} from './access-enrichment-2026-11';

// A river running due east along 37°N. North is the left bank looking downstream.
const river = line([[-91.02, 37], [-91.0, 37], [-90.98, 37]]);
const north = (m: number): [number, number] => [-91.0, 37 + m / 111_320];
const lot = (id: string, at: [number, number], tie: Lot['tie'] = 'same_area'): Lot =>
  ({ id, at, tie, provider: 'mdc', url: `u/${id}`, attributes: {} });

test('sideOfRiver tells the banks apart and treats the centerline as no bank', () => {
  assert.equal(sideOfRiver(north(100), river).side, 1);
  assert.equal(sideOfRiver(north(-100), river).side, -1);
  assert.equal(sideOfRiver(north(5), river).side, 0);
  const multi = { type: 'MultiLineString' as const, coordinates: [river.coordinates] };
  assert.equal(sideOfRiver(north(-80), multi).side, -1);
});

test('chooseLot refuses the far bank, distant lots, and lots nearer another place', () => {
  const launch = north(40);
  const r = chooseLot(launch, [lot('far-bank', north(-120)), lot('distant', north(900))], [], river);
  assert.equal(r.choice, null);
  assert.ok(r.refused.some((x) => x.startsWith('far-bank: opposite bank')));
  assert.ok(r.refused.some((x) => x.startsWith('distant:')));

  const other = chooseLot(launch, [lot('shared', north(300))], [north(290)], river);
  assert.equal(other.choice, null);
  assert.ok(other.refused[0].includes('nearer another access point'));

  const ok = chooseLot(launch, [lot('a', north(250)), lot('b', north(140))], [], river);
  assert.equal(ok.choice?.lot.id, 'b');
  assert.equal(ok.choice?.confidence, 'high');
  assert.match(ok.choice!.note, /1 other lot/);
});

test('chooseLot prefers a reviewed link, skips lots on top of the launch, and doubts a mid-river pin', () => {
  const launch = north(40);
  const linkedFirst = chooseLot(launch, [lot('near', north(120)), lot('linked', north(300), 'linked')], [], river);
  assert.equal(linkedFirst.choice?.lot.id, 'linked');
  assert.equal(chooseLot(launch, [lot('same', north(50))], [], river).choice, null);
  const midRiver = chooseLot(north(3), [lot('x', north(200))], [], river);
  assert.equal(midRiver.choice?.confidence, 'medium');
  assert.match(midRiver.choice!.note, /bank not checked/);
});

test('MDC parking info states only what the layer says', () => {
  assert.equal(mdcParkingInfo({ Surface: 'Gravel', Allows_Trailers: 'Yes' }), 'Gravel lot; trailers allowed (MDC).');
  assert.equal(mdcParkingInfo({ Surface: null, Allows_Trailers: 'No' }), 'Parking lot; no trailers (MDC).');
  assert.equal(mdcParkingInfo({ Surface: null, Allows_Trailers: null }), null);
});

test('MVUM surface codes map onto the road_surface check vocabulary', () => {
  assert.deepEqual(mvumRoadSurface('AC - ASPHALT', 'yearlong'), ['paved']);
  assert.deepEqual(mvumRoadSurface('AGG - CRUSHED AGGREGATE OR GRAVEL', 'seasonal'), ['gravel_maintained', 'seasonal']);
  assert.deepEqual(mvumRoadSurface('NAT - NATIVE MATERIAL', null), ['dirt']);
  assert.equal(mvumRoadSurface(null, 'yearlong'), null);
  const allowed = new Set(['paved', 'gravel_maintained', 'gravel_unmaintained', 'dirt', 'seasonal', '4wd_required']);
  for (const code of ['AC', 'BST', 'P', 'PCC', 'AGG', 'IMP', 'NAT']) {
    for (const v of mvumRoadSurface(`${code} - x`, 'seasonal') ?? []) assert.ok(allowed.has(v), v);
  }
});

test('managing agency: agreement raises confidence, conflict and unsupported managers flag', () => {
  assert.deepEqual(agencyFromPadus('SFW', 'MO'), { agency: 'MDC' });
  assert.deepEqual(agencyFromPadus('SFW', 'AR'), { agency: null, unsupported: 'AGFC' });
  assert.deepEqual(agencyFromPadus('USACE', 'AR'), { agency: 'COE' });
  assert.equal(agencyFromOwnershipText('Benton County'), 'County');
  assert.equal(agencyFromOwnershipText('City of Glenwood'), 'Municipal');
  assert.equal(agencyFromOwnershipText('Public road ROW (US 412 bridge)'), null);

  const both = chooseManagingAgency([
    { agency: 'NPS', source: 'padus', detail: 'ONSR' },
    { agency: 'NPS', source: 'ownership_text', detail: 'NPS' },
  ]);
  assert.deepEqual([both.agency, both.confidence], ['NPS', 'high']);
  assert.equal(chooseManagingAgency([{ agency: 'County', source: 'ownership_text', detail: 'x' }]).confidence, 'low');
  const conflict = chooseManagingAgency([
    { agency: 'USFS', source: 'padus', detail: 'MTNF' },
    { agency: 'MDC', source: 'ownership_text', detail: 'MDC' },
  ]);
  assert.deepEqual([conflict.agency, conflict.confidence], [null, 'flag']);
  const agfc = chooseManagingAgency([{ agency: null, unsupported: 'AGFC', source: 'agency_link', detail: 'x' }]);
  assert.equal(agfc.confidence, 'flag');
  assert.match(agfc.evidence, /AGFC is not an allowed/);
});

test('ownership spelling touches exact duplicates only; amenities only grow', () => {
  assert.equal(ownershipSpelling('County'), 'county');
  assert.equal(ownershipSpelling('county'), null);
  assert.equal(ownershipSpelling('Benton County'), null);
  assert.deepEqual(addAmenities(['parking'], ['parking', 'restrooms', 'restrooms']), ['parking', 'restrooms']);
  assert.equal(addAmenities(['parking'], ['parking']), null);
  assert.equal(usfsHasRestroom('Vault toilet(s)'), true);
  assert.equal(usfsHasRestroom('No restroom available.  Vault toilet available at nearby CG.'), false);
});

test('the review sheet survives a CSV round trip, including quotes, commas and newlines', () => {
  const row: Proposal = {
    access_point_id: 'id-1', slug: 's', name: 'Name, "quoted"', river: 'r', field: 'parking_info',
    current: 'null', proposed: JSON.stringify('Gravel lot; trailers allowed (MDC).'), confidence: 'high',
    evidence: 'line one\nline two', evidence_url: 'https://x/y?a=1&b=2', launch_map: '', proposed_map: '', note: '',
  };
  const [back] = parseCsv(toCsv([row]));
  assert.equal(back.accept, '');
  assert.equal(back.name, row.name);
  assert.equal(back.evidence, row.evidence);
  assert.equal(JSON.parse(back.proposed), 'Gravel lot; trailers allowed (MDC).');
});
