import assert from 'node:assert/strict';
import test from 'node:test';
import {
  amenityVerdict, cityParkName, decideAgency, landVerdict, linkVerdict, redirectsToGeneric, roadVerdict, sharesDistinctiveName,
} from './audit-access-enrichment-2026-11';

const land = (at: Partial<{ npsTracts: { alpha: string; estate: string; interest: string }[]; usfs: string[] }>, near = at) => ({
  at: { npsTracts: [], usfs: [], ...at },
  near: { npsTracts: [], usfs: [], ...near },
});
const fee = { alpha: 'OZAR', estate: 'Fee', interest: 'Federal Land (Fee)' };
const scenic = { alpha: 'OZAR', estate: 'Scenic Easement', interest: 'Federal Land (Less than Fee)' };
const road = { alpha: 'OZAR', estate: 'Easement', interest: 'Public' };

test('NPS is confirmed only by NPS fee land at the pin or NPS’s own campground record', () => {
  assert.equal(landVerdict('NPS', land({ npsTracts: [fee] })).verdict, 'confirmed');
  // Bay Creek before its campground link was considered: a scenic easement is private land.
  assert.equal(landVerdict('NPS', land({ npsTracts: [scenic] })).verdict, 'contradicted');
  assert.equal(landVerdict('NPS', land({ npsTracts: [scenic] }), { npsCampground: true, usfsSite: null }).verdict, 'confirmed');
  // A road easement under the pin is not evidence either way (Round Spring); fee land nearby is only ambiguous.
  assert.equal(landVerdict('NPS', land({ npsTracts: [road] }, { npsTracts: [road, fee] })).verdict, 'ambiguous');
  assert.equal(landVerdict('NPS', land({}, {})).verdict, 'contradicted');
});

test('USFS is confirmed by Forest Service land or a same-named USFS recreation site', () => {
  assert.equal(landVerdict('USFS', land({ usfs: ['USDA FOREST SERVICE'] })).verdict, 'confirmed');
  assert.equal(landVerdict('USFS', land({ usfs: ['NON-FS'] })).verdict, 'contradicted');
  assert.equal(landVerdict('USFS', land({ usfs: ['NON-FS'] }), { npsCampground: false, usfsSite: 'Campbell Cemetery' }).verdict, 'confirmed');
  assert.equal(landVerdict('MDC', land({ npsTracts: [fee] })).verdict, 'contradicted', 'another manager on NPS fee land');
  assert.equal(landVerdict('AGFC', land({}, { usfs: ['USDA FOREST SERVICE'] })).verdict, 'ambiguous', 'Cartney');
  assert.ok(sharesDistinctiveName('Campbell Cemetery access', 'Campbell Cemetery'));
  assert.ok(!sharesDistinctiveName('Turner Mill South', 'North Fork Campground'));
});

test('a link that redirects to a generic page is dead, not confirmed', () => {
  const old = 'https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21670';
  assert.equal(linkVerdict(old, 200, 'https://www.fs.usda.gov/r09/marktwain/recreation').verdict, 'contradicted');
  assert.equal(linkVerdict(old, 200, old).verdict, 'confirmed');
  assert.equal(linkVerdict(old, 404, old).verdict, 'contradicted');
});

test('an added amenity must not be denied by the record, and should be corroborated by it', () => {
  assert.equal(amenityVerdict('boat_ramp', 'Gravel carry-in put-in/take-out above the shut-ins; no ramp, no camping.', []).verdict, 'contradicted');
  assert.equal(amenityVerdict('boat_ramp', 'gravel bar access — no formal boat ramp.', []).verdict, 'contradicted');
  assert.equal(amenityVerdict('boat_ramp', 'gravel canoe launch ramp, campsites, privies', ['boat_ramp']).verdict, 'confirmed', 'Patrick Bridge');
  assert.equal(amenityVerdict('boat_ramp', 'with a gravel canoe launch and designated camping.', []).verdict, 'contradicted', 'Camp Branch');
  assert.equal(amenityVerdict('restrooms', 'No restrooms at this specific access point.', []).verdict, 'contradicted', 'Scotts Ford');
  assert.equal(amenityVerdict('restrooms', 'Vault toilet near the lot.', []).verdict, 'confirmed');
  assert.equal(amenityVerdict('restrooms', 'A quiet gravel bar.', []).verdict, 'unverified');
  assert.equal(amenityVerdict('parking', 'Status: officially closed for parking/takeout repairs since 2017 flood.', []).verdict, 'contradicted', 'Warren Bridge Access');
  assert.equal(amenityVerdict('camping', 'Camping is prohibited.', []).verdict, 'contradicted');
});

test('agency decisions: confirmed, or two concordant sources, never ambiguous or a lone source', () => {
  const base = { verdict: 'unverified' as const, confidence: 'medium', ownership: 'AGFC', description: '' };
  assert.equal(decideAgency({ ...base, proposed: 'AGFC', name: 'Rim Shoals Access' }).accept, true);
  assert.equal(decideAgency({ ...base, proposed: 'AGFC', name: 'Yellville City Park Access' }).accept, false);
  assert.equal(decideAgency({ ...base, proposed: 'AGFC', name: 'Cotter Access (Big Spring Park)' }).accept, false);
  assert.equal(decideAgency({ ...base, proposed: 'AGFC', name: 'X', ownership: null }).accept, false);
  assert.equal(decideAgency({ ...base, proposed: 'County', name: 'Highway Z Bridge', ownership: 'county' }).accept, false);
  assert.equal(decideAgency({ ...base, proposed: 'State Park', name: 'Montauk State Park', ownership: 'state_park' }).accept, true);
  assert.equal(decideAgency({ ...base, proposed: 'Private', name: 'Highway 49 Bridge', ownership: 'private', description: 'Private access. Locals use it.' }).accept, true);
  assert.equal(decideAgency({ ...base, proposed: 'NPS', name: 'Grassy Creek', verdict: 'ambiguous' }).accept, false);
  assert.equal(decideAgency({ ...base, proposed: 'USFS', name: 'Deer Leap', verdict: 'confirmed' }).accept, true);
  assert.ok(cityParkName('Calico Rock City Park Access'));
  assert.ok(!cityParkName('Buffalo City Access'));
});

test('a road surface is contradicted only by the record’s own road text', () => {
  assert.equal(roadVerdict(['gravel_maintained'], 'Paved road to the ramp.').verdict, 'contradicted');
  assert.equal(roadVerdict(['paved', 'seasonal'], 'Paved access road.').verdict, 'confirmed');
  assert.equal(roadVerdict(['dirt'], 'Limited access road.').verdict, 'unverified');
});

test('qualified negatives deny an amenity (Sappington Bridge: "no confirmed restrooms")', () => {
  assert.equal(amenityVerdict('restrooms', 'MDC boat and fishing access. No confirmed restrooms. No water.', []).verdict, 'contradicted');
  assert.equal(amenityVerdict('restrooms', 'No water or restrooms on site.', []).verdict, 'contradicted');
  assert.equal(amenityVerdict('restrooms', 'One-lane gravel ramp, vault toilet; no water or developed day-use amenities.', []).verdict, 'confirmed', 'Bay Nothing');
  assert.equal(amenityVerdict('camping', 'No designated camping.', []).verdict, 'contradicted');
});

test('a hedge in the record is not corroboration (Campbell Bridge)', () => {
  assert.equal(amenityVerdict('restrooms', 'No specific restroom information — may have portable or vault toilet seasonally.', []).verdict, 'unverified');
});

test('whole-table false positives stay confirmed: a named ramp, a season, a road', () => {
  assert.equal(amenityVerdict('boat_ramp', 'Dedicated 2001 with concrete boat ramp and canoe launch.', []).verdict, 'confirmed', 'Barclay');
  assert.equal(amenityVerdict('camping', 'Camping is seasonal (Sept 15 – May 15 only). Day-use only in summer.', []).verdict, 'confirmed', 'Huzzah');
  assert.equal(amenityVerdict('parking', 'Lot at the landing; since March 2023 no parking is allowed anywhere along Kyles Landing Road.', []).verdict, 'confirmed', 'Kyles Landing');
  assert.equal(amenityVerdict('camping', 'Boat ramp, two parking lots, day-use only, no camping.', []).verdict, 'contradicted');
});

test('a redirect to a shallower page, or one that drops the site ID, is a dead link', () => {
  assert.ok(redirectsToGeneric('https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21814', 'https://www.fs.usda.gov/r09/marktwain/recreation'));
  assert.ok(!redirectsToGeneric('https://bigbearriverresort.com/', 'https://bigbearriverresort.com/'));
  assert.ok(!redirectsToGeneric('http://example.org/a/b', 'https://example.org/a/b/'));
});
