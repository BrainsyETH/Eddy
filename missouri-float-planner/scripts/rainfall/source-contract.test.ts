import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeBasin, inspectBasin, RAIN_WINDOWS, selectMrmsRaster, siteId, statisticsParameters, rasterGrid, diagnosticStatistics } from './source-contract';

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
  assert.equal(result.basin!.geometry.type, 'MultiPolygon');
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

const gridInfo = {
  pixelType: 'F32', bandCount: 1, pixelSizeX: 1189.18, pixelSizeY: 1189.18,
  origin: { x: -14471533.8, y: 7361866.1, spatialReference: { wkid: 102100, latestWkid: 3857 } },
  extent: { xmin: -14471533.8, ymin: 2273348.7, xmax: -6678812.5, ymax: 7361866.1, spatialReference: { wkid: 3857 } },
};

test('statistics mask the locked raw item before nearest-neighbor sampling at its native resolution', () => {
  const grid = rasterGrid(gridInfo);
  const product = selectMrmsRaster({ ...metadata, pixelSizeX: 573, pixelSizeY: 573 }, catalog, 24, now);
  const parameters = statisticsParameters(decodeBasin(basin), product, grid);
  assert.equal(JSON.parse(parameters.get('pixelSize')!).x, 1189.18, 'service minimum must not replace the item grid');
  assert.equal(grid.origin.x, gridInfo.origin.x);
  const rule = JSON.parse(parameters.get('renderingRule')!);
  assert.equal(rule.rasterFunctionArguments.ResamplingType, 0);
  assert.equal(rule.rasterFunctionArguments.InputCellsize.x, 1189.18);
  const mask = rule.rasterFunctionArguments.Raster;
  assert.equal(mask.rasterFunction, 'Mask');
  assert.equal(mask.rasterFunctionArguments.Raster, '$124');
  assert.equal(mask.rasterFunctionArguments.IncludedRanges[0], 0, 'zero rain stays valid');
  assert.deepEqual(JSON.parse(parameters.get('mosaicRule')!).lockRasterIds, [124]);
  assert.deepEqual(JSON.parse(parameters.get('geometry')!).rings[0][1], [-92, 37.1]);
  const display = statisticsParameters(decodeBasin(basin), product, grid, 'rft_24hr');
  assert.deepEqual(JSON.parse(display.get('renderingRule')!), { rasterFunction: 'rft_24hr' });
  assert.throws(() => rasterGrid({ ...gridInfo, pixelSizeX: 0 }));
  assert.throws(() => rasterGrid({ ...gridInfo, origin: { x: 0, y: 0, spatialReference: { wkid: 4326 } } }));
});

test('invalid geometry retains independent station checks and diagnostic area', () => {
  const touching = structuredClone(basin);
  // Two lobes touch at a repeated vertex; the positive shoelace area is still diagnostic.
  touching.features[0].geometry.coordinates = [[[-92,37],[-91.9,37],[-91.9,37.1],[-92,37.1],[-92,37],[-92.1,37],[-92.1,36.9],[-92,36.9],[-92,37]]];
  const result = inspectBasin({ site: '07065495', basin: touching, nldiSite: station('nldi'), usgsSite: station('usgs'), storedLocation: [-91, 37] });
  assert.equal(result.basin, null);
  assert.equal(result.geometryValid, false);
  assert.equal(result.areaIsDiagnostic, true);
  assert.ok(result.basinAreaSqmi! > 0);
  assert.equal(result.sourceAreaSqmi, 38.1);
  assert.equal(result.sourcePointDistanceM, 0);
  assert.ok(result.storedPointDistanceM! > 100);
  assert.ok(result.issues.includes('invalid_geometry'));
  assert.ok(result.issues.includes('stored_point_mismatch'));
  assert.equal(result.reviewStatus, 'unreviewed');
  const malformed = inspectBasin({ site: '07065495', basin: {}, nldiSite: station('nldi'), usgsSite: station('usgs') });
  assert.equal(malformed.basinAreaSqmi, null);
  assert.equal(malformed.sourceAreaSqmi, 38.1);
});

test('missing coverage never becomes zero and unmasked results fail closed', () => {
  assert.deepEqual(diagnosticStatistics({ statistics: [{ count: 0, min: -3, max: -3, mean: -3 }] }),
    { validPixels: 0, mean: null, min: null, max: null });
  assert.equal(diagnosticStatistics({ statistics: [{ count: 5, min: 0, max: 0, mean: 0 }] }).mean, 0);
  assert.equal(diagnosticStatistics({ statistics: [{ count: 5, min: 0, max: 20, mean: 10 }] }).mean, 10);
  assert.throws(() => diagnosticStatistics({ statistics: [{ count: 5, min: -1, max: 20, mean: 10 }] }));
  assert.throws(() => diagnosticStatistics({ statistics: [{ count: 5, min: 0, max: 20, mean: NaN }] }));
  assert.equal(diagnosticStatistics({ statistics: [] }).mean, null);
  assert.throws(() => diagnosticStatistics({}));
});
