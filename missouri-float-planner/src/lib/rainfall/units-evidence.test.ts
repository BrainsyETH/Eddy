import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { hash, type Tile } from './research-contract';
import { compareSource, compareUnits, gaugeRatio, MM_PER_INCH } from './units-evidence';

// A wet 24 hours over Louisiana, 2026-11-15 18:00Z to 2026-11-16 18:00Z: the
// locked raster the collector's own request returns, the USGS rain gauges under
// it, and NOAA's source files read at those gauges.
const directory = '../docs/validation/rainfall/2026-11-16-units/';
const capture = JSON.parse(readFileSync(`${directory}capture.json`, 'utf8')) as {
  raster: { start: string; end: string }; tile: Tile; tiffSha256: string; usgsSha256: string;
  result: { gaugesCompared: number; medianRatio: number };
};
const tiff = gunzipSync(readFileSync(`${directory}raster.tiff.gz`));
const usgsBytes = gunzipSync(readFileSync(`${directory}usgs-precipitation.json.gz`));
const source = JSON.parse(readFileSync(`${directory}source-comparison.json`, 'utf8')) as {
  unitDocumentedByNoaa: string; sites: ({ site: string } & Record<string, number>)[];
};
const column = (name: string) => Object.fromEntries(source.sites.map(site => [site.site, site[name]]));
const comparison = compareUnits(tiff, capture.tile, JSON.parse(usgsBytes.toString('utf8')), capture.raster);

test('the saved wet-window capture replays byte for byte', () => {
  assert.equal(hash(tiff), capture.tiffSha256);
  assert.equal(hash(usgsBytes), capture.usgsSha256);
  assert.equal(comparison.sites.length, capture.result.gaugesCompared);
  assert.equal(comparison.sites.length, 75);
  assert.equal(comparison.missingPixels, 0);
  assert.ok(Math.abs(comparison.medianRatio! - capture.result.medianRatio) < 1e-9);
});

test('hosted raw values are NOAA\'s RadarOnly source values, which NOAA documents in millimetres', () => {
  assert.equal(source.unitDocumentedByNoaa, 'mm');
  const agreement = compareSource(comparison, column('RadarOnly_QPE_24H'));
  assert.equal(agreement.sites, 75);
  // Same product, resampled once from NOAA's 0.01 degree grid to the hosted one.
  assert.ok(Math.abs(agreement.medianRatio! - 1) < 0.02, `median ${agreement.medianRatio}`);
  assert.ok(agreement.middleHalf![0] > 0.95 && agreement.middleHalf![1] < 1.05, `middle half ${agreement.middleHalf}`);
});

test('the gauges rule out inches, and show the radar-only product reading high in this storm', () => {
  // Inches would put this near 1 and centimetres near 2.5.
  assert.ok(comparison.medianRatio! > 10);
  // The finding that matters for display: radar-only read about 1.9 times the
  // gauges here, while the gauge-corrected product sat within about 5% of them.
  // If a later change makes this test fail, re-measure; do not widen the bands.
  const radarOnly = gaugeRatio(comparison, column('RadarOnly_QPE_24H'))!, corrected = gaugeRatio(comparison, column('MultiSensor_QPE_24H_Pass2'))!;
  assert.ok(radarOnly / MM_PER_INCH > 1.7 && radarOnly / MM_PER_INCH < 2.1, `radar-only ${radarOnly / MM_PER_INCH}x`);
  assert.ok(corrected / MM_PER_INCH > 0.95 && corrected / MM_PER_INCH < 1.15, `gauge-corrected ${corrected / MM_PER_INCH}x`);
});

test('a broken or partial gauge record is dropped, never counted as dry', () => {
  const series = (values: [string, string][], record = 'a') => values.map(([time, value]) => ({
    properties: { monitoring_location_id: 'USGS-x', time_series_id: record, parameter_code: '00045', time, value },
    geometry: { type: 'Point', coordinates: [-91.5, 31] } }));
  const whole: [string, string][] = Array.from({ length: 96 }, (_, i) => [new Date(Date.parse(capture.raster.start) + (i + 1) * 900_000).toISOString(), '0.01']);
  const count = (values: [string, string][]) => compareUnits(tiff, capture.tile, { features: series(values) }, capture.raster).sites.length;
  assert.equal(count(whole), 1);
  assert.equal(count(whole.slice(0, 40)), 0, 'record stops mid-window');
  assert.equal(count(whole.map(([at, v], i) => [at, i === 10 ? '-999999' : v])), 0, 'logger fault code');
  assert.equal(count(whole.map(([at]) => [at, '0'])), 0, 'no measurable rain');
  assert.equal(compareUnits(tiff, capture.tile, { features: [...series(whole), ...series(whole, 'b')] }, capture.raster).sites.length, 0, 'two sensor records for one gauge');
});
