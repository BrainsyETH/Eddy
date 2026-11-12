/** Dry by default. Uses the committed source inspector bundle; never approves a basin. */
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { getScriptClient } from '../lib/db';
import { inspectBasin } from '../../src/lib/rainfall/source-contract';
import { hash, samplePoints } from '../../src/lib/rainfall/research-contract';

async function main() {
  const args = process.argv.slice(2), apply = args.includes('--apply');
  const index = args.indexOf('--evidence');
  if (index < 0 || !args[index + 1] || args.length !== (apply ? 3 : 2)) throw new Error('Usage: seed-research-basins.ts --evidence DIRECTORY [--apply]');
  const directory = resolve(args[index + 1]);
  const inventory = JSON.parse(await readFile(`${directory}/inventory.json`, 'utf8'));
  const captures = JSON.parse(gunzipSync(await readFile(`${directory}/source-responses.json.gz`)).toString('utf8'));
  if (!Array.isArray(inventory) || inventory.length > 100) throw new Error('Invalid seed inventory');
  const rows = inventory.filter(row => row.usgs_site_id).map(row => {
    const site = String(row.usgs_site_id), capture = captures[`${site}-basin.json`];
    const inspection = inspectBasin({ site, basin: capture.data, nldiSite: captures[`${site}-nldi-site.json`].data,
      usgsSite: captures[`${site}-usgs-site.json`].data, storedAreaSqmi: row.drainage_area_sqmi == null ? null : Number(row.drainage_area_sqmi),
      storedLocation: [Number(row.longitude), Number(row.latitude)] });
    if (!inspection.basin) throw new Error(`Invalid research geometry for ${site}`);
    const { basin: geometry, ...review } = inspection;
    const provenance = { source: capture.url, capturedAt: capture.fetchedAt, sourceSha256: capture.sha256, review, publicUse: false };
    const id = hash(JSON.stringify({ site, geometry }));
    return { id, gauge_id: String(row.id), usgs_site_id: site, geometry, forecast_points: samplePoints(geometry), provenance, review_status: 'unreviewed' };
  });
  if (!rows.length || new Set(rows.map(row => row.gauge_id)).size !== rows.length) throw new Error('Duplicate or empty seed inventory');
  console.log(JSON.stringify({ apply, basins: rows.length, flagged: rows.filter(row => row.provenance.review.issues.length).map(row => row.usgs_site_id), forecastPoints: rows.reduce((n, row) => n + row.forecast_points.length, 0) }));
  if (!apply) return;
  const db = getScriptClient({ script: 'seed-research-basins', write: true });
  const current = await db.from('gauge_stations').select('id,usgs_site_id,active').in('id', rows.map(row => row.gauge_id));
  if (current.error) throw current.error;
  for (const row of rows) if (!current.data?.some(g => g.id === row.gauge_id && g.usgs_site_id === row.usgs_site_id)) throw new Error(`Gauge identity changed: ${row.usgs_site_id}`);
  // An inactive station has no readings to compare with rain, so its basin would
  // mark every hourly collection partial. Skip it and say so.
  const inactive = new Set(current.data?.filter(g => !g.active).map(g => g.id));
  const seedable = rows.filter(row => !inactive.has(row.gauge_id));
  if (seedable.length !== rows.length) console.log(JSON.stringify({ skippedInactiveStations: rows.filter(row => inactive.has(row.gauge_id)).map(row => row.usgs_site_id) }));
  if (!seedable.length) throw new Error('No active stations to seed');
  // A different active version fails the partial unique index; don't silently swap boundaries.
  const { error } = await db.from('rainfall_research_basins').upsert(seedable, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
  const saved = await db.from('rainfall_research_basins').select('id').in('id', seedable.map(row => row.id));
  if (saved.error || saved.data?.length !== seedable.length) throw new Error('Basin seed readback failed');
  console.log(`Verified ${saved.data.length} private research basins.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
