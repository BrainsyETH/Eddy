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
import { MODERN_BASE, modernHeaders } from '../../src/lib/flow-providers/usgs';

const headers = { Accept: 'application/json,image/tiff', 'User-Agent': 'Eddy rainfall source validation (https://eddy.guide)' };
async function bytes(url: string, requestHeaders: HeadersInit = headers): Promise<Uint8Array> {
  let failure: unknown;
  // An operator capture, not a cron: three bounded tries for a busy provider.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(done => setTimeout(done, attempt * 4000));
    try {
      const response = await fetch(url, { headers: requestHeaders, redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failure = new Error(`${response.status} from ${new URL(url).hostname}`);
      if (response.status < 500) break;
    } catch (error) { failure = error; }
  }
  throw failure;
}
const json = async (url: string, requestHeaders?: HeadersInit): Promise<unknown> => {
  const data: unknown = JSON.parse(Buffer.from(await bytes(url, requestHeaders)).toString('utf8'));
  if (data && typeof data === 'object' && 'error' in data) throw new Error('Provider returned an error');
  return data;
};

/** Every rain-gauge reading (parameter 00045) in the box and window, following USGS's own next links. */
async function gaugeReadings(box: number[], start: string, end: string) {
  const first = new URL(`${MODERN_BASE}/continuous/items`);
  for (const [key, value] of [['f', 'json'], ['bbox', box.map(n => n.toFixed(4)).join(',')], ['parameter_code', '00045'],
    ['datetime', `${start}/${end}`], ['limit', '10000']]) first.searchParams.set(key, value);
  const features: unknown[] = [];
  let url: string | null = first.toString(), pages = 0;
  while (url) {
    if (new URL(url).hostname !== first.hostname || ++pages > 20) throw new Error('USGS paging left its host or did not end');
    const page = await json(url, modernHeaders()) as { features?: unknown[]; links?: { rel?: string; href?: string }[] };
    if (!Array.isArray(page.features)) throw new Error('USGS returned no reading list');
    features.push(...page.features);
    url = page.links?.find(link => link.rel === 'next')?.href ?? null;
  }
  return { url: first.toString(), pages, document: { type: 'FeatureCollection', features } };
}

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
