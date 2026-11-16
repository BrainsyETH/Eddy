/** Offline, repeatable benchmark against the same captured shapes used to seed
 * research basins. Writes JSON to stdout; no network or production writes. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { inspectBasin } from '../../src/lib/rainfall/source-contract';
import { basinWeights } from '../../src/lib/rainfall/native-grid';
import { WEIGHT_VERSION, weightKey } from '../../src/lib/rainfall/weight-store';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--evidence' || args[2] !== '--tile') throw new Error('Usage: benchmark-weights.ts --evidence DIRECTORY --tile CAPTURE_JSON');
const inventory = JSON.parse(readFileSync(`${args[1]}/inventory.json`, 'utf8'));
const captures = JSON.parse(gunzipSync(readFileSync(`${args[1]}/source-responses.json.gz`)).toString());
const { tile } = JSON.parse(readFileSync(args[3], 'utf8'));
const results = [];
for (const row of inventory.filter((r: { usgs_site_id?: string }) => r.usgs_site_id)) {
  const site = String(row.usgs_site_id);
  const inspected = inspectBasin({ site, basin: captures[`${site}-basin.json`].data,
    nldiSite: captures[`${site}-nldi-site.json`].data, usgsSite: captures[`${site}-usgs-site.json`].data,
    storedAreaSqmi: row.drainage_area_sqmi == null ? null : Number(row.drainage_area_sqmi), storedLocation: [Number(row.longitude), Number(row.latitude)] });
  if (!inspected.basin) throw new Error(`Invalid captured basin: ${site}`);
  const key = weightKey(inspected.basin, tile), start = performance.now();
  try {
    const weights = basinWeights(inspected.basin, tile);
    results.push({ site, name: row.name, key, milliseconds: Math.round(performance.now() - start), cells: weights.cells.length,
      coverage: weights.cells.reduce((sum, cell) => sum + cell.area, 0) / weights.totalArea });
  } catch (error) {
    results.push({ site, name: row.name, key, milliseconds: Math.round(performance.now() - start), error: error instanceof Error ? error.message : String(error) });
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), node: process.version, version: WEIGHT_VERSION, tile, results }, null, 2));
if (results.some(row => 'error' in row)) process.exitCode = 1;
