/**
 * Step 1 of the rain-to-river lag study. Read-only.
 *
 * Reads the gauges in scope (reviewed, enabled research basins), the tile the
 * rain collector archives on, and prepares each watershed's cell weights with
 * the public rain view's own code. Writes:
 *   data/basins.json   what was studied: site, name, area, outline hash, tile (committed)
 *   WORK/weights.json  the cell weights the rain backfill reads (not committed)
 *
 * node --import tsx scripts/research/rain-lag-2026-11/prepare.ts --work DIR
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { area } from '@turf/turf';
import { getScriptClient } from '../../lib/db';
import { basinWeights } from '../../../src/lib/rainfall/native-grid';
import { hash, type Basin, type Tile } from '../../../src/lib/rainfall/research-contract';

const SQUARE_MILE = 2_589_988.110336;
async function main() {
  const args = process.argv.slice(2), work = args[args.indexOf('--work') + 1];
  if (args.length !== 2 || args[0] !== '--work' || !work) throw new Error('Usage: prepare.ts --work DIR');
  const protocol = JSON.parse(await readFile(join(__dirname, 'protocol.json'), 'utf8'));
  const dam = Object.keys(protocol.scope.dam_controlled.sites), unreviewed: string[] = protocol.scope.not_studied.sites;
  const db = getScriptClient({ script: 'rain-lag-study-prepare', write: false });
  const { data, error } = await db.from('rainfall_research_basins').select('id,usgs_site_id,gauge_id,geometry,review_status,enabled').order('usgs_site_id').limit(101);
  if (error) throw error;
  const rows = data as (Basin & { review_status: string; enabled: boolean })[];
  const scope = rows.filter(row => row.review_status === 'reviewed' && row.enabled);
  const outside = rows.filter(row => !scope.includes(row)).map(row => row.usgs_site_id).sort();
  // The protocol named the gauges it leaves out before any data was read. The database must still agree.
  if (JSON.stringify(outside) !== JSON.stringify([...unreviewed].sort())) throw new Error(`Scope has changed since the protocol was locked: ${outside.join(',')}`);
  if (dam.some(site => !scope.some(row => row.usgs_site_id === site))) throw new Error('A dam-controlled gauge named in the protocol is not in scope');
  const names = await db.from('gauge_stations').select('id,name').in('id', scope.map(row => row.gauge_id));
  if (names.error) throw names.error;
  const last = await db.from('rainfall_research_captures').select('metadata,fetched_at').eq('kind', 'mrms')
    .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
  if (last.error) throw last.error;
  const tile = (last.data?.metadata as { tile?: Tile } | undefined)?.tile;
  if (!tile) throw new Error('No archived rain tile');
  const weights: Record<string, ReturnType<typeof basinWeights>> = {};
  const basins = scope.map(row => {
    const site = row.usgs_site_id, studied = !dam.includes(site);
    if (studied) weights[site] = basinWeights(row.geometry, tile, Date.now() + 120_000);
    const covered = studied ? weights[site].cells.reduce((total, cell) => total + cell.area, 0) / weights[site].totalArea : null;
    if (covered !== null && Math.abs(covered - 1) > 0.001) throw new Error(`${site}: the tile does not cover the watershed`);
    return { site, name: names.data.find(station => station.id === row.gauge_id)?.name ?? null, basinId: row.id,
      squareMiles: Math.round(area(row.geometry) / SQUARE_MILE * 10) / 10, outlineSha256: hash(JSON.stringify(row.geometry)),
      studied, cells: studied ? weights[site].cells.length : null };
  });
  await mkdir(work, { recursive: true });
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(join(work, 'weights.json'), JSON.stringify({ tile, weights }));
  await writeFile(join(__dirname, 'data', 'basins.json'), `${JSON.stringify({ readAt: new Date().toISOString(), tile, tileFromCaptureAt: last.data!.fetched_at, basins }, null, 1)}\n`);
  console.log(JSON.stringify({ inScope: scope.length, studied: Object.keys(weights).length, damControlled: dam.length, notReviewed: outside.length, tile }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
