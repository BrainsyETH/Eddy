/**
 * Step 3 of the rain-to-river lag study. Reads USGS's public service only.
 *
 * For each studied gauge it reads discharge (parameter 00060) across the study
 * window in quarter-year requests and reduces it to the mean of the readings
 * inside each clock hour. One JSON file per gauge goes to WORK/flow, so a run
 * that stops can be started again. A gauge USGS serves no discharge for is
 * recorded as such, not skipped.
 *
 * node --import tsx scripts/research/rain-lag-2026-11/fetch-flow.ts --work DIR
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HOUR = 3_600_000, QUARTER = 92 * 24 * HOUR;
export interface FlowRecord {
  site: string; start: string; hours: number;
  /** Mean discharge (cfs) for each hour from start; null where the hour has no numeric reading. */
  flow: (number | null)[];
  readings: number; hoursWithFlow: number;
  requests: { url: string; sha256: string; bytes: number; readings: number }[];
}

/** Read with curl so the machine's proxy settings apply; Node's own fetch ignores them. */
async function text(url: string): Promise<string> {
  let failure: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise(done => setTimeout(done, attempt * 5000));
    try {
      const { stdout } = await run('curl', ['-sS', '--compressed', '--max-time', '180', '-A', 'Eddy rainfall research (https://eddy.guide)',
        '-w', '\n%{http_code}', url], { maxBuffer: 64 * 1024 * 1024 });
      const cut = stdout.lastIndexOf('\n'), status = Number(stdout.slice(cut + 1)), body = stdout.slice(0, cut);
      if (status === 200) return body;
      failure = new Error(`HTTP ${status}`);
      if (status < 500 && status !== 429) break;
    } catch (error) { failure = error; }
  }
  throw failure;
}

/** USGS tab-separated rows: agency, site, local time, time zone, then value and qualifier columns. */
export function readings(rdb: string): { at: number; cfs: number }[] {
  const lines = rdb.split('\n').filter(line => line && !line.startsWith('#'));
  if (lines.length < 2) return [];
  const header = lines[0].split('\t'), time = header.indexOf('datetime'), zone = header.indexOf('tz_cd');
  const value = header.findIndex(name => /^\d+_00060$/.test(name));
  if (time < 0 || zone < 0 || value < 0) return [];
  const offsets: Record<string, string> = { UTC: '+00:00', CST: '-06:00', CDT: '-05:00', EST: '-05:00', EDT: '-04:00', MST: '-07:00', MDT: '-06:00' };
  const found: { at: number; cfs: number }[] = [];
  for (const line of lines.slice(2)) {
    const cells = line.split('\t'), offset = offsets[cells[zone]];
    if (!offset) throw new Error(`Unknown USGS time zone ${cells[zone]}`);
    const at = Date.parse(`${cells[time].replace(' ', 'T')}:00${offset}`), cfs = Number(cells[value]);
    // Ice, equipment and other remarks arrive as text in the value column: not a reading.
    if (Number.isFinite(at) && cells[value] !== '' && Number.isFinite(cfs) && cfs >= 0) found.push({ at, cfs });
  }
  return found;
}

async function main() {
  const args = process.argv.slice(2), work = args[1];
  if (args.length !== 2 || args[0] !== '--work' || !work) throw new Error('Usage: fetch-flow.ts --work DIR');
  const protocol = JSON.parse(await readFile(join(__dirname, 'protocol.json'), 'utf8'));
  const { basins } = JSON.parse(await readFile(join(__dirname, 'data', 'basins.json'), 'utf8')) as { basins: { site: string; studied: boolean }[] };
  const start = Date.parse(protocol.window.start), stop = Date.parse(protocol.window.end_exclusive), hours = (stop - start) / HOUR;
  const out = join(work, 'flow');
  await mkdir(out, { recursive: true });
  const queue = basins.filter(basin => basin.studied).map(basin => basin.site);
  const one = async (site: string) => {
    const file = join(out, `${site}.json`);
    if (await stat(file).then(() => true, () => false)) return;
    const sums = new Float64Array(hours), counts = new Uint16Array(hours), requests: FlowRecord['requests'] = [];
    let total = 0;
    const seen = new Set<number>();
    for (let from = start; from < stop; from += QUARTER) {
      const to = Math.min(stop, from + QUARTER);
      // Each request overlaps its neighbours by three hours, because USGS does not cut the answer
      // exactly at the times asked for. A reading that arrives twice is used once.
      const stamp = (at: number) => `${new Date(at).toISOString().slice(0, 16)}Z`;
      const url = `https://nwis.waterservices.usgs.gov/nwis/iv/?format=rdb&sites=${site}&parameterCd=00060&startDT=${stamp(from - 3 * HOUR)}&endDT=${stamp(to + 3 * HOUR)}`;
      const body = await text(url), found = readings(body).filter(reading => !seen.has(reading.at));
      for (const { at, cfs } of found) {
        seen.add(at);
        const hour = Math.floor((at - start) / HOUR);
        if (hour >= 0 && hour < hours) { sums[hour] += cfs; counts[hour]++; }
      }
      total += found.length;
      requests.push({ url, sha256: createHash('sha256').update(body).digest('hex'), bytes: Buffer.byteLength(body), readings: found.length });
    }
    const flow = Array.from(sums, (sum, hour) => counts[hour] ? Math.round(sum / counts[hour] * 100) / 100 : null);
    const record: FlowRecord = { site, start: protocol.window.start, hours, flow, readings: total, hoursWithFlow: flow.filter(value => value !== null).length, requests };
    await writeFile(`${file}.tmp`, JSON.stringify(record));
    await rename(`${file}.tmp`, file);
    console.log(JSON.stringify({ site, readings: total, hoursWithFlow: record.hoursWithFlow, ofHours: hours }));
  };
  // Five gauges at a time: each request takes USGS about ten seconds.
  await Promise.all(Array.from({ length: 5 }, async () => { for (let site = queue.shift(); site; site = queue.shift()) await one(site); }));
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
