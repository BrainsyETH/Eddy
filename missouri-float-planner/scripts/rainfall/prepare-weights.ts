/** Dry by default. Prepare the stored basin versions for a validated capture's
 * native grid; this neither reviews a basin nor enables public rain. */
import { readFile } from 'node:fs/promises';
import { getScriptClient } from '../lib/db';
import { basinWeights } from '../../src/lib/rainfall/native-grid';
import { savePreparedWeights, weightKey } from '../../src/lib/rainfall/weight-store';
import { RESEARCH_BUCKET, type Basin, type Tile } from '../../src/lib/rainfall/research-contract';

async function main() {
  const args = process.argv.slice(2), apply = args.includes('--apply');
  const tileIndex = args.indexOf('--tile'), siteIndex = args.indexOf('--site');
  if (tileIndex < 0 || !args[tileIndex + 1] || (siteIndex >= 0 && !/^\d{8,15}$/.test(args[siteIndex + 1] ?? ''))
    || args.length !== 2 + (siteIndex >= 0 ? 2 : 0) + Number(apply)) {
    throw new Error('Usage: prepare-weights.ts --tile CAPTURE_JSON [--site USGS_ID] [--apply]');
  }
  const { tile } = JSON.parse(await readFile(args[tileIndex + 1], 'utf8')) as { tile: Tile };
  const db = getScriptClient({ script: 'prepare-rain-weights', write: apply });
  const bucket = await db.storage.getBucket(RESEARCH_BUCKET);
  if (bucket.error || !bucket.data || bucket.data.public) throw new Error('Private research storage unavailable');
  let query = db.from('rainfall_research_basins').select('id,usgs_site_id,geometry').eq('enabled', true).order('usgs_site_id').limit(101);
  if (siteIndex >= 0) query = query.eq('usgs_site_id', args[siteIndex + 1]);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length || data.length > 100) throw new Error('Empty or oversized basin inventory');
  let failed = 0;
  for (const basin of data as Basin[]) {
    const started = performance.now();
    try {
      const key = weightKey(basin.geometry, tile); // validate grid before clipping
      const weights = basinWeights(basin.geometry, tile, Date.now() + 120_000);
      if (apply) await savePreparedWeights(db, basin.geometry, tile, weights);
      console.log(JSON.stringify({ site: basin.usgs_site_id, basinId: basin.id, key, cells: weights.cells.length,
        milliseconds: Math.round(performance.now() - started), savedAndReadBack: apply }));
    } catch (error) {
      failed++;
      console.error(JSON.stringify({ site: basin.usgs_site_id, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  if (failed) throw new Error(`${failed} basins failed preparation; do not enable those basins`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
