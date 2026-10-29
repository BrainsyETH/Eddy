import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichmentRows, enrichmentSql, imageUrlsOf, reviewedPhotoEntries, validateEnrichment, type EnrichmentSite } from './agency-enrichment';

function site(): EnrichmentSite {
  return {
    id: '387c6cab-4650-42d7-9b53-889a948c9720', slug: 'simmons-ford-access',
    current_name: 'Simmons Ford Access', name: 'Simmons Ford Access', kind: 'boat_ramp', roles: ['boat_ramp', 'access'],
    description: 'MDC access.', facilities: null, amenities: ['parking'], parking_info: null, parking_capacity: '10',
    road_access: null, road_surface: ['gravel_maintained'], fee_required: false, fee_notes: null, local_tips: null,
    official_site_url: 'https://mdc.mo.gov/discover-nature/places/simmons-ford-access', ownership: 'MDC',
    managing_agency: 'MDC', pin: null, river_mile: null,
    images: [
      { kind: 'open_license', url: 'https://upload.wikimedia.org/a.jpg', title: 'Ford', altText: 'River at the ford',
        caption: 'Location photograph; not current conditions.', credit: 'A. Person', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
        license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
      { kind: 'mdc_og', url: 'https://mdc.mo.gov/sites/default/files/ramp.jpg', title: 'Ramp', altText: 'Concrete ramp',
        caption: 'Location photograph; not current conditions.', credit: 'Missouri Department of Conservation',
        sourceUrl: 'https://mdc.mo.gov/discover-nature/places/simmons-ford-access', license: null, licenseUrl: null },
    ],
    field_sources: { description: ['https://mdc.mo.gov/discover-nature/places/simmons-ford-access'] },
  };
}

test('agency page photo leads; only openly licensed photos enter the credits catalog', () => {
  assert.deepEqual(imageUrlsOf(site()), ['https://mdc.mo.gov/sites/default/files/ramp.jpg', 'https://upload.wikimedia.org/a.jpg']);
  const credits = reviewedPhotoEntries([site()]);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].image.license, 'CC BY-SA 4.0');
});

test('rejects restrictive licenses, GIS links as websites, unsourced prose and off-vocabulary values', () => {
  const nc = site(); nc.images[0].license = 'CC BY-NC 2.0';
  assert.throws(() => validateEnrichment([nc]), /open license/);
  const gis = site(); gis.official_site_url = 'https://gisec2.agfc.com/arcgis/rest/services/GIS/AGFC_DATA/MapServer/1/query?objectIds=1';
  assert.throws(() => validateEnrichment([gis]), /GIS API link/);
  const unsourced = site(); unsourced.field_sources = {};
  assert.throws(() => validateEnrichment([unsourced]), /no source/);
  const amenity = site(); amenity.amenities = ['wifi'];
  assert.throws(() => validateEnrichment([amenity]), /vocabulary/);
  const agency = site(); agency.managing_agency = 'AGFC';
  assert.throws(() => validateEnrichment([agency]), /managing_agency/);
  const fee = site(); fee.fee_required = null;
  assert.throws(() => validateEnrichment([fee]), /fee note/);
});

test('approval is written only from a complete recorded decision', () => {
  assert.equal(enrichmentRows([site()])[0].approve, null);
  const endpointOnly = site(); endpointOnly.decision = { approve: false, is_float_endpoint: true, reviewed_by: 'reviewer' };
  assert.throws(() => validateEnrichment([endpointOnly]), /must be approved/);
  const park = site(); park.roles = ['park']; park.decision = { approve: true, is_float_endpoint: true, reviewed_by: 'reviewer' };
  assert.throws(() => validateEnrichment([park]), /launch role/);
  const ok = site(); ok.decision = { approve: true, is_float_endpoint: true, reviewed_by: 'reviewer' };
  assert.equal(enrichmentRows([ok])[0].approve, true);
});

test('generated SQL is one guarded transaction carrying the rows as a literal', () => {
  const sql = enrichmentSql([site()]);
  assert.match(sql, /^-- Generated/);
  assert.match(sql, /Identity changed/);
  assert.match(sql, /Approved outside this record/);
  assert.match(sql, /distance > 250/);
  assert.ok(sql.includes('"slug":"simmons-ford-access"'));
  const offset = site(); offset.river_mile = { value: 140.1, basis: 'Robertsville stored 136.0 + 4.1 river miles' };
  assert.ok(enrichmentSql([offset]).includes('"river_mile":140.1'));
  const bare = site(); bare.river_mile = { value: 140.1, basis: '' };
  assert.throws(() => validateEnrichment([bare]), /basis/);
  const hostile = site(); hostile.description = 'x $rows$ y';
  assert.throws(() => enrichmentSql([hostile]), /Delimiter/);
});
