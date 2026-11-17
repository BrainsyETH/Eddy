/**
 * Read-only capture for the raw-unit release gate. No Supabase, no writes
 * outside --out. Saves one locked 24-hour MRMS raster for a wet region and the
 * USGS rain-gauge record for the same window, so the comparison can be replayed
 * from the saved bytes (src/lib/rainfall/units-evidence.ts and its test). The
 * gauge comparison measures the product's accuracy as much as its unit, so the
 * unit is settled separately against NOAA's source file.
 *
 * node --import tsx scripts/rainfall/capture-units-evidence.ts --bbox W,S,E,N --out NEW_DIR
 * Pick a box where it rained in the last day, at most 25 square degrees.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { multiPolygon } from '@turf/turf';
import { MRMS_URL, rasterGrid, selectMrmsRaster } from '../../src/lib/rainfall/source-contract';
import { exportParameters, hash, nativeTile, validateTiff, type Basin } from '../../src/lib/rainfall/research-contract';
import { compareUnits } from '../../src/lib/rainfall/units-evidence';
import { bytes, gaugeReadings, json } from './evidence-fetch';

async function main() {
  const args = process.argv.slice(2), box = args[args.indexOf('--bbox') + 1]?.split(',').map(Number), out = args[args.indexOf('--out') + 1];
  if (args.length !== 4 || !args.includes('--bbox') || !args.includes('--out') || !out || box?.length !== 4 || !box.every(Number.isFinite)
    || box[0] >= box[2] || box[1] >= box[3] || (box[2] - box[0]) * (box[3] - box[1]) > 25) {
    throw new Error('Usage: capture-units-evidence.ts --bbox W,S,E,N --out NEW_DIRECTORY (at most 25 square degrees)');
  }
  const [west, south, east, north] = box, directory = resolve(out);
  const catalogUrl = `${MRMS_URL}/query?f=json&where=1%3D1&outFields=*&returnGeometry=false`;
  const metadata = await json(`${MRMS_URL}?f=json`), raster = selectMrmsRaster(metadata, await json(catalogUrl), 24, Date.now());
  const region = { id: 'region', gauge_id: 'region', usgs_site_id: '00000000', provenance: {}, forecast_points: [],
    geometry: multiPolygon([[[[west, south], [east, south], [east, north], [west, north], [west, south]]]]) } as Basin;
  const tile = nativeTile([region], rasterGrid(await json(`${MRMS_URL}/${raster.rasterId}/info?f=json`)));
  const parameters = exportParameters(tile, raster);
  const tiff = await bytes(`${MRMS_URL}/exportImage?${parameters}`);
  validateTiff(tiff, tile);
  const after = selectMrmsRaster(metadata, await json(catalogUrl), 24, Date.now());
  if (after.rasterId !== raster.rasterId || after.end !== raster.end) throw new Error('MRMS changed during capture; run again');
  const gauges = await gaugeReadings(box, raster.start, raster.end), usgs = Buffer.from(JSON.stringify(gauges.document));
  const comparison = compareUnits(tiff, tile, gauges.document, raster);
  // Never overwrite earlier evidence.
  await mkdir(directory, { recursive: false });
  await writeFile(join(directory, 'raster.tiff.gz'), gzipSync(tiff));
  await writeFile(join(directory, 'usgs-precipitation.json.gz'), gzipSync(usgs));
  await writeFile(join(directory, 'capture.json'), JSON.stringify({ capturedAt: new Date().toISOString(), bbox: box,
    raster: { rasterId: raster.rasterId, subset: raster.subset, start: raster.start, end: raster.end }, tile,
    parameters: Object.fromEntries(parameters), tiffSha256: hash(tiff), usgsUrl: gauges.url, usgsPages: gauges.pages, usgsSha256: hash(usgs),
    result: { gaugesInWindow: comparison.gaugesInWindow, gaugesCompared: comparison.sites.length,
      medianRatio: comparison.medianRatio, middleHalf: comparison.middleHalf, missingPixels: comparison.missingPixels, pixels: comparison.pixels },
    sites: comparison.sites }, null, 2) + '\n');
  // 25.4 would mean millimetres and an unbiased product. This is only the gauge
  // side; the unit itself is settled against NOAA's source file (see the
  // evidence folder's extract-source-values.py).
  console.log(JSON.stringify({ gaugesCompared: comparison.sites.length, medianRawPerGaugeInch: comparison.medianRatio, middleHalf: comparison.middleHalf }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
