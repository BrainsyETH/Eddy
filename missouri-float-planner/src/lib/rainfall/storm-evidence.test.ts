import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { nativePixels, weightedRain, type basinWeights } from './native-grid';
import { RAIN_RELEASE } from './public-policy';
import { hash, type Tile } from './research-contract';
import { compareUnits, MM_PER_INCH } from './units-evidence';

// Two real 24-hour storms over the Jacks Fork, saved by
// scripts/rainfall/capture-storm-evidence.ts: one in autumn, one in summer.
const folder = `../${RAIN_RELEASE.coverageEvidence}/`, storms = ['2026-11-04', '2026-08-08'];
interface Amount { coverage: number; inches: number | null }
interface Saved {
  window: { start: string; end: string }; tile: Tile; sha256: Record<'correctedTiff' | 'radarOnlyTiff' | 'usgs' | 'weights', string>;
  basins: { site: string; basinId: string; reviewStatus: string; weightedAreaFraction: number; corrected: Amount; radarOnly: Amount;
    hourlySumInches: number; hourlyMinimumCoverage: number; denseSampleInches: number }[];
  gauges: Record<'corrected' | 'radarOnly', { gaugesCompared: number; medianRatio: number; middleHalf: [number, number] }>;
}
const load = (storm: string) => {
  const read = (name: string) => gunzipSync(readFileSync(`${folder}${storm}/${name}`));
  return { saved: JSON.parse(readFileSync(`${folder}${storm}/capture.json`, 'utf8')) as Saved, corrected: read('corrected-24h.tiff.gz'),
    radarOnly: read('radar-only-24h.tiff.gz'), usgs: read('usgs-precipitation.json.gz'), weights: read('weights.json.gz') };
};

test('the release list names evidence that exists and covers every released station at its released basin version', () => {
  assert.ok(existsSync(`../${RAIN_RELEASE.unitsEvidence}/README.md`)); assert.ok(existsSync(`${folder}README.md`));
  for (const storm of storms) {
    const { saved } = load(storm);
    for (const [site, release] of Object.entries(RAIN_RELEASE.sites)) {
      const basin = saved.basins.find(row => row.site === site);
      assert.ok(basin, `${site} was not measured in ${storm}`);
      assert.equal(basin.basinId, release.basinId, `${site} was measured with another basin version`);
      assert.equal(basin.reviewStatus, 'reviewed');
    }
  }
});

for (const storm of storms) test(`${storm}: the saved rasters and weights replay to the recorded basin rain`, () => {
  const { saved, corrected, radarOnly, usgs, weights } = load(storm);
  assert.deepEqual({ correctedTiff: hash(corrected), radarOnlyTiff: hash(radarOnly), usgs: hash(usgs), weights: hash(weights) }, saved.sha256);
  const prepared = JSON.parse(weights.toString()) as Record<string, ReturnType<typeof basinWeights>>;
  const correctedPixels = nativePixels(corrected, saved.tile), radarPixels = nativePixels(radarOnly, saved.tile);
  for (const basin of saved.basins) {
    const amount = weightedRain(correctedPixels, prepared[basin.site]);
    assert.ok(Math.abs(amount.inches! - basin.corrected.inches!) < 1e-9);
    assert.ok(Math.abs(weightedRain(radarPixels, prepared[basin.site]).inches! - basin.radarOnly.inches!) < 1e-9);
    // The weights account for the whole basin, and every hour of the storm had full coverage.
    assert.ok(Math.abs(basin.weightedAreaFraction - 1) < 1e-6 && Math.abs(amount.coverage - 1) < 1e-6 && Math.abs(basin.hourlyMinimumCoverage - 1) < 1e-6);
    assert.ok(amount.inches! > 0.8, 'a real storm, not a dry day');
    // The 24 hourly bars add up to NOAA's own 24-hour total.
    assert.ok(Math.abs(basin.hourlySumInches / amount.inches! - 1) < 0.001, `hourly sum ${basin.hourlySumInches}`);
    // NOAA's cells sampled densely inside the outline, without the tile or the weights.
    assert.ok(Math.abs(basin.denseSampleInches / amount.inches! - 1) < 0.01, `dense sample ${basin.denseSampleInches}`);
  }
});

for (const storm of storms) test(`${storm}: gauge-corrected rain stays near the rain gauges under the tile`, () => {
  const { saved, corrected, radarOnly, usgs } = load(storm), readings = JSON.parse(usgs.toString());
  const measured = { corrected: compareUnits(corrected, saved.tile, readings, saved.window), radarOnly: compareUnits(radarOnly, saved.tile, readings, saved.window) };
  for (const product of ['corrected', 'radarOnly'] as const) {
    assert.equal(measured[product].sites.length, saved.gauges[product].gaugesCompared);
    assert.ok(Math.abs(measured[product].medianRatio! - saved.gauges[product].medianRatio) < 1e-9);
  }
  assert.ok(measured.corrected.sites.length >= 30);
  // 1.0 would be exact agreement; the two storms measured 1.02 and 1.18. Radar-only
  // is replayed above for the record and is not held to a band: it measured 1.00
  // and 1.40 here and 1.9 in the Louisiana check. If a later change makes this
  // fail, re-measure; do not widen the band.
  const ratio = measured.corrected.medianRatio! / MM_PER_INCH;
  assert.ok(ratio > 0.95 && ratio < 1.2, `gauge-corrected ${ratio}x`);
});
