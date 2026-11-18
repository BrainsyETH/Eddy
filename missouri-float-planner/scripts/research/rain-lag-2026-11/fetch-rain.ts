/**
 * Step 2 of the rain-to-river lag study. Reads NOAA's public archive only.
 *
 * For each day of the study window (the 24 hours ending 12:00 UTC) it reads
 * the 24-hour gauge-corrected total, and when any studied watershed has 0.05 in
 * or more it reads the day's 24 hourly files. Each watershed's amount is the
 * public rain view's own area-weighted mean. One JSON file per day is written
 * to WORK/rain, so a run that stops can be started again and only does what is
 * left. Run several at once with --shard.
 *
 * node --import tsx scripts/research/rain-lag-2026-11/fetch-rain.ts --work DIR [--shard I/N] [--final]
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { correctedListed, correctedListUrl, correctedTile, correctedUrl, type CorrectedHours } from '../../../src/lib/rainfall/corrected-source';
import { weightedRain, type basinWeights } from '../../../src/lib/rainfall/native-grid';
import type { Tile } from '../../../src/lib/rainfall/research-contract';

const HOUR = 3_600_000, DAY = 24 * HOUR, SCREEN_INCHES = 0.05;
export interface RainDay {
  /** The 24 hours ending at this time (12:00 UTC). */
  end: string;
  /** 24-hour watershed totals the day was screened on. null when NOAA has no 24-hour file. */
  screen: Record<string, number | null> | null;
  fetchedHourly: boolean;
  /** Hour ends, oldest first, and each watershed's inches for that hour (null: no amount). */
  hours: { end: string; inches: (number | null)[] | null; sha256: string | null }[];
  sites: string[];
}

async function bytes(url: string): Promise<Uint8Array> {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(done => setTimeout(done, attempt * 3000));
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Eddy rainfall research (https://eddy.guide)' }, redirect: 'error', signal: AbortSignal.timeout(90_000) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failure = new Error(`HTTP ${response.status}`);
      if (response.status < 500) break;
    } catch (error) { failure = error; }
  }
  throw failure;
}

async function main() {
  const args = process.argv.slice(2), value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const work = value('--work'), [shard, shards] = (value('--shard') ?? '0/1').split('/').map(Number);
  const final = args.includes('--final');
  if (!work || !Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards) throw new Error('Usage: fetch-rain.ts --work DIR [--shard I/N]');
  const protocol = JSON.parse(await readFile(join(__dirname, 'protocol.json'), 'utf8'));
  const { tile, weights } = JSON.parse(await readFile(join(work, 'weights.json'), 'utf8')) as { tile: Tile; weights: Record<string, ReturnType<typeof basinWeights>> };
  const sites = Object.keys(weights).sort(), out = join(work, 'rain');
  await mkdir(out, { recursive: true });
  const amounts = (download: Uint8Array, hours: CorrectedHours, end: string) => {
    const { values, source } = correctedTile(download, hours, end, tile);
    // weightedRain skips a cell that is not a finite number, which is how the tile marks a gap.
    const pixels = values as unknown as (number | null)[];
    return { sha256: source.sha256, inches: sites.map(site => weightedRain(pixels, weights[site]).inches) };
  };
  const listed = async (hours: CorrectedHours, day: string) => correctedListed(Buffer.from(await bytes(correctedListUrl(hours, day))).toString('utf8'), hours);
  // Day ends: every 12:00 UTC from the first that lies inside the window to the first at or past its end.
  const start = Date.parse(protocol.window.start), stop = Date.parse(protocol.window.end_exclusive);
  const ends: number[] = [];
  for (let end = Math.floor(start / DAY) * DAY + 12 * HOUR; end - DAY < stop; end += DAY) if (end > start) ends.push(end);
  let done = 0, wet = 0, failed = 0;
  for (const [index, end] of ends.entries()) {
    if (index % shards !== shard) continue;
    const iso = new Date(end).toISOString(), file = join(out, `${iso.slice(0, 10)}.json`);
    if (await stat(file).then(() => true, () => false)) { done++; continue; }
    try {
      const hourEnds = Array.from({ length: 24 }, (_, i) => new Date(end - (23 - i) * HOUR).toISOString());
      let screen: RainDay['screen'] = null;
      const dayKey = iso.slice(0, 10).replaceAll('-', '');
      if ((await listed(24, dayKey)).has(iso)) {
        const total = amounts(await bytes(correctedUrl(24, iso)), 24, iso);
        screen = Object.fromEntries(sites.map((site, i) => [site, total.inches[i]]));
      }
      // Fetch the hours when the day was wet anywhere, or when it could not be screened for every watershed.
      const values = screen ? Object.values(screen) : [];
      const fetchedHourly = !screen || values.some(inches => inches === null || inches >= SCREEN_INCHES);
      const hours: RainDay['hours'] = [];
      if (fetchedHourly) {
        const have = new Set([...await listed(1, dayKey), ...await listed(1, new Date(end - DAY).toISOString().slice(0, 10).replaceAll('-', ''))]);
        const results = await Promise.all(hourEnds.map(async hourEnd => {
          if (!have.has(hourEnd)) return { end: hourEnd, inches: null, sha256: null };
          try {
            return { end: hourEnd, ...amounts(await bytes(correctedUrl(1, hourEnd)), 1, hourEnd) };
          } catch (error) {
            // A file NOAA lists but that cannot be read fails the day, so the next run tries again.
            // --final records the hour as having no amount instead, as the protocol says.
            if (!final) throw error;
            console.error(JSON.stringify({ hour: hourEnd, unreadable: error instanceof Error ? error.message : String(error) }));
            return { end: hourEnd, inches: null, sha256: null };
          }
        }));
        hours.push(...results);
        wet++;
      } else for (const hourEnd of hourEnds) hours.push({ end: hourEnd, inches: sites.map(() => 0), sha256: null });
      const day: RainDay = { end: iso, screen, fetchedHourly, hours, sites };
      await writeFile(`${file}.tmp`, JSON.stringify(day));
      await rename(`${file}.tmp`, file);
      done++;
      if (done % 20 === 0) console.log(JSON.stringify({ shard, done, wet, failed, at: iso }));
    } catch (error) {
      failed++;
      console.error(JSON.stringify({ shard, day: iso, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  console.log(JSON.stringify({ shard, finished: true, done, wet, failed }));
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
