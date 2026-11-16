/** Dry by default. Archive NOAA's gauge-corrected rainfall for recent hours the
 * hourly collector has not captured: before a first release, or after an outage
 * longer than the collector's own catch-up. Uses the collector's code path and
 * tile, so a backfilled hour is identical to a collected one. NOAA keeps these
 * files back to October 2020; the publisher reads only the last eight days.
 *
 * node --import tsx scripts/rainfall/backfill-corrected.ts [--hours N] [--apply]
 */
import { getScriptClient } from '../lib/db';
import { collectCorrected } from '../../src/lib/rainfall/corrected-sync';
import { hash, RESEARCH_BUCKET, type Basin } from '../../src/lib/rainfall/research-contract';
import { saveCapture } from '../../src/lib/rainfall/research-store';

async function bytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(done => setTimeout(done, attempt * 3000));
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Eddy rainfall research (https://eddy.guide)' }, redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failure = new Error(`Research source HTTP ${response.status}`);
      if (response.status < 500) break;
    } catch (error) { failure = error; }
  }
  throw failure;
}

async function main() {
  const args = process.argv.slice(2), apply = args.includes('--apply'), at = args.indexOf('--hours');
  const hours = at < 0 ? 192 : Number(args[at + 1]);
  if (!Number.isInteger(hours) || hours < 1 || hours > 240 || args.length !== (at < 0 ? 0 : 2) + Number(apply)) {
    throw new Error('Usage: backfill-corrected.ts [--hours 1..240] [--apply]');
  }
  const db = getScriptClient({ script: 'backfill-corrected-rain', write: apply });
  const bucket = await db.storage.getBucket(RESEARCH_BUCKET);
  if (bucket.error || !bucket.data || bucket.data.public) throw new Error('Private research storage unavailable');
  // The same inventory, order and identity as the hourly collector.
  const { data, error } = await db.from('rainfall_research_basins').select('*').eq('enabled', true).order('id').limit(101);
  if (error) throw error;
  const basins = data as Basin[] | null;
  if (!basins?.length || basins.length > 100) throw new Error('Research basin inventory missing or too large');
  const basinIds = basins.map(basin => basin.id), basinSetHash = hash(JSON.stringify(basinIds));
  let savedBytes = 0;
  const found: string[] = [];
  const result = await collectCorrected(db, { basinIds, basinSetHash, now: Date.now(), tile: null, lookbackHours: hours, maxHourly: hours },
    AbortSignal.timeout(20 * 60_000), bytes, async capture => {
      found.push(`${capture.sourceKey} ${capture.end}`);
      if (apply) savedBytes += await saveCapture(db, { ...capture, basinSetHash });
    });
  console.log(JSON.stringify({ applied: apply, basins: basins.length, hoursChecked: hours, ...result, savedBytes,
    archived: found.length, newest: found[0] ?? null }));
  if (result.failed) throw new Error(`${result.failed} files failed; run again`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
