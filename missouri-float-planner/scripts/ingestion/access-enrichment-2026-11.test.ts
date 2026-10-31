import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type Lot, type Proposal, addAmenities, agencyFromOwnershipText, agencyFromPadus, belongsTo,
  chooseManagingAgency, line, matchLots, mvumRoadSurface, parkingInfo, ownershipSpelling, parseCsv,
  roadServes, sideOfRiver, toCsv, usfsHasRestroom,
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

test('matchLots refuses the far bank, distant lots, and lots nearer another place', () => {
  const launch = north(40);
  const r = matchLots(launch, [lot('far-bank', north(-120)), lot('distant', north(900))], [], river);
  assert.equal(r.match, null);
  assert.ok(r.refused.some((x) => x.startsWith('far-bank: opposite bank')));
  assert.ok(r.refused.some((x) => x.startsWith('distant:')));

  const other = matchLots(launch, [lot('shared', north(300))], [north(290)], river);
  assert.equal(other.match, null);
  assert.ok(other.refused[0].includes('nearer another access point'));
});

test('matchLots keeps every lot that belongs to the place, including one beside the launch', () => {
  const launch = north(40);
  const ok = matchLots(launch, [lot('a', north(250)), lot('b', north(50))], [], river);
  assert.deepEqual(ok.match?.lots.map((l) => l.lot.id), ['b', 'a']);
  assert.equal(ok.match?.confidence, 'high');
  assert.equal(matchLots(launch, [lot('n', north(120), 'same_name')], [], river).match?.confidence, 'medium');
  const midRiver = matchLots(north(3), [lot('x', north(200))], [], river);
  assert.equal(midRiver.match?.confidence, 'medium');
  assert.match(midRiver.match!.note, /bank not checked/);
});

test('parking info states the surface only, never the unconfirmed trailer field', () => {
  const mdc = (Surface: unknown, extra = {}): Lot => ({ ...lot('m', north(60)), attributes: { Surface, Allows_Trailers: 'No', ...extra } });
  const agfc = (fdescrip: string): Lot => ({ ...lot('g', north(60)), provider: 'agfc', attributes: { fdescrip } });
  assert.equal(parkingInfo([mdc('Paved')]), 'Paved lot (MDC).');
  assert.equal(parkingInfo([agfc('Dirt'), agfc('Dirt')]), '2 dirt lots (AGFC).');
  assert.equal(parkingInfo([agfc('Paved'), agfc('Gravel')]), '2 lots: paved, gravel (AGFC).');
  assert.equal(parkingInfo([mdc(null)]), null);
  assert.doesNotMatch(parkingInfo([mdc('Gravel')])!, /trailer/i);
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

test('an unsupported manager still counts as disagreement (Romp Hole, Hardy Beach)', () => {
  // PAD-US says USACE, the linked AGFC records say AGFC: unresolved, not COE.
  const rompHole = chooseManagingAgency([
    { agency: 'COE', source: 'padus', detail: 'Table Rock Lake (USACE, REC)' },
    { agency: null, unsupported: 'AGFC', source: 'agency_link', detail: 'AGFC record, owner "AGFC"' },
  ]);
  assert.deepEqual([rompHole.agency, rompHole.confidence], [null, 'flag']);
  assert.match(rompHole.evidence, /conflict \(COE vs AGFC\)/);
  // AGFC records naming both the City and AGFC as owner: unresolved, not Municipal.
  const hardy = chooseManagingAgency([
    { agency: null, unsupported: 'AGFC', source: 'agency_link', detail: 'owner "AGFC"' },
    { agency: 'Municipal', source: 'agency_link', detail: 'owner "City"' },
  ]);
  assert.deepEqual([hardy.agency, hardy.confidence], [null, 'flag']);
});

test('belongsTo applies distance, bank and nearer-place checks to any agency feature', () => {
  const launch = north(40);
  assert.equal(belongsTo(launch, north(-150), [], river, 300).refused, 'opposite bank');
  assert.equal(belongsTo(launch, north(200), [north(190)], river, 300).refused, 'nearer another access point');
  assert.equal(belongsTo(launch, north(400), [], river, 300).refused, '360 m away');
  const ok = belongsTo(launch, north(200), [], river, 300);
  assert.deepEqual([ok.refused, ok.bankChecked], [null, true]);
  // A feature on the river line can't be assigned a bank: allowed, but not firm.
  assert.equal(belongsTo(launch, north(5), [], river, 300).bankChecked, false);
  assert.equal(belongsTo(launch, north(200), [], null, 300).bankChecked, false);
});

test('a road surface needs a road whose name serves the access, not merely the nearest road', () => {
  assert.equal(roadServes('Turner Mill South', 'TURNER MILL NORTH'), false);
  assert.equal(roadServes('Riverton', 'RIVERTON WEST RECREATION AREA'), false);
  assert.equal(roadServes('Bay Nothing Boat Ramp', 'BAY NOTHING RECREATION AREA'), true);
  assert.equal(roadServes('Float Camp Recreation Area', 'FLOAT CAMP PICNIC AREA'), true);
  assert.equal(roadServes('North Fork Recreation Area (Hammond)', 'NORTH FORK RECREATION AREA'), true);
  assert.equal(roadServes('Campbell Cemetery access', 'CAMPBELL CEMETERY CANOE ACCESS'), true);
  assert.equal(roadServes('Anywhere', null), false);
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
    evidence: 'line one\nline two', evidence_url: 'https://x/y?a=1&b=2 https://x/z', evidence_ids: 'mdc-privy-1 mdc-camp-2',
    launch_map: '', note: '',
  };
  const [back] = parseCsv(toCsv([row]));
  assert.equal(back.accept, 'y', 'high-confidence rows are pre-accepted');
  const [medium] = parseCsv(toCsv([{ ...row, confidence: 'medium' }]));
  assert.equal(medium.accept, '');
  assert.equal(back.name, row.name);
  assert.equal(back.evidence, row.evidence);
  assert.deepEqual(back.evidence_ids.split(' '), ['mdc-privy-1', 'mdc-camp-2']);
  assert.equal(JSON.parse(back.proposed), 'Gravel lot; trailers allowed (MDC).');
});
