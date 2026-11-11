import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeBasin, inspectBasin, RAIN_WINDOWS, selectMrmsRaster, siteId, statisticsParameters } from './source-contract';

const now = Date.parse('2026-11-11T14:20:00Z');
const metadata = { pixelType: 'F32', bandCount: 1, rasterFunctionInfos: [{ name: 'None' }] };
const raster = (hours: number, end = '2026-11-11T14:00:00Z') => ({ attributes: {
  objectid: 100 + hours, category: 1, idp_subset: `conus_QPE_${String(hours).padStart(2, '0')}H`, idp_validendtime: Date.parse(end),
} });
const catalog = { features: RAIN_WINDOWS.map((h) => raster(h)) };
const basin = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: {
  type: 'Polygon', coordinates: [[[-92, 37], [-91.9, 37], [-91.9, 37.1], [-92, 37.1], [-92, 37]]],
} }] };
const station = (provider: 'nldi' | 'usgs', id = 'USGS-07065495') => ({ type: 'FeatureCollection', features: [{
  type: 'Feature', geometry: { type: 'Point', coordinates: [-92, 37] },
  properties: provider === 'nldi' ? { identifier: id } : { id, drainage_area: 38.1 },
}] });

test('each MRMS interval pins its own raster and end time without claiming units', () => {
  for (const hours of RAIN_WINDOWS) {
    const product = selectMrmsRaster(metadata, catalog, hours, now);
    assert.equal(Date.parse(product.end) - Date.parse(product.start), hours * 3_600_000);
    assert.deepEqual(product.mosaicRule.lockRasterIds, [100 + hours]);
    assert.deepEqual(product.renderingRule, { rasterFunction: 'None' });
    assert.equal(product.nativeUnits, 'unverified');
    assert.equal(product.stale, false);
  }
  const mixed = { features: [raster(1), raster(72, '2026-11-11T09:00:00Z')] };
  assert.equal(selectMrmsRaster(metadata, mixed, 1, now).stale, false);
  assert.equal(selectMrmsRaster(metadata, mixed, 72, now).stale, true);
});

test('missing, duplicate, truncated, renamed or future products fail closed', () => {
  for (const input of [
    { features: [] }, { features: [raster(1), raster(1)] },
    { ...catalog, exceededTransferLimit: true },
    { features: [{ attributes: { ...raster(1).attributes, idp_subset: 'mrms_1h_co' } }] },
    { features: [raster(1, '2026-11-12T00:00:00Z')] },
    { features: [raster(1, '2026-11-11T14:00:01Z')] },
    { features: [{ attributes: { ...raster(1).attributes, objectid: 1.5 } }] },
  ]) assert.throws(() => selectMrmsRaster(metadata, input, 1, now));
  assert.throws(() => selectMrmsRaster({ ...metadata, pixelType: 'U8' }, catalog, 1, now));
  assert.throws(() => selectMrmsRaster({ ...metadata, rasterFunctionInfos: [] }, catalog, 1, now));
});

test('basins retain geometry but never gain approval from area agreement', () => {
  const result = inspectBasin({ site: '07065495', basin, nldiSite: station('nldi'), usgsSite: station('usgs'), storedAreaSqmi: 38.1, storedLocation: [-92, 37] });
  assert.equal(result.reviewStatus, 'unreviewed');
  assert.deepEqual(result.issues, []);
  assert.equal(result.basin.geometry.type, 'MultiPolygon');
  const bad = inspectBasin({ site: '07065495', basin, nldiSite: station('nldi'), usgsSite: station('usgs'), storedAreaSqmi: null, storedLocation: [-91, 37] });
  assert.ok(bad.issues.includes('stored_area_missing'));
  assert.ok(bad.issues.includes('stored_point_mismatch'));
  assert.throws(() => inspectBasin({ site: '07065495', basin, nldiSite: station('nldi', 'USGS-07066000'), usgsSite: station('usgs') }));
});

test('invalid source geometry and unsafe site identifiers are rejected', () => {
  for (const value of ['../anything', '07065495/basin', 'USGS-07065495', '123', '']) assert.throws(() => siteId(value));
  assert.equal(siteId('07065495'), '07065495');
  const clone = structuredClone(basin);
  clone.features[0].geometry.coordinates[0][4] = [-91.99, 37];
  assert.throws(() => decodeBasin(clone), /Open polygon/);
  clone.features[0].geometry.coordinates[0][0] = [Infinity, 37];
  assert.throws(() => decodeBasin(clone), /Invalid WGS84/);
});

test('statistics diagnostic explicitly locks the raster and requests unrendered pixels', () => {
  const parameters = statisticsParameters(decodeBasin(basin), selectMrmsRaster(metadata, catalog, 24, now));
  assert.deepEqual(JSON.parse(parameters.get('renderingRule')!), { rasterFunction: 'None' });
  assert.deepEqual(JSON.parse(parameters.get('mosaicRule')!).lockRasterIds, [124]);
  const rings = JSON.parse(parameters.get('geometry')!).rings;
  assert.deepEqual(rings[0][1], [-92, 37.1], 'Esri outer ring is clockwise');
});
