/**
 * Step 4 of the rain-to-river lag study. No network.
 *
 * Turns the downloads in WORK into the files the analysis reads and the
 * repository keeps:
 *   data/rain-hourly.csv.gz   watershed inches for each hour
 *   data/flow-hourly.csv.gz   mean discharge for each hour
 *   data/sources.json         what was read: per-day screening, file counts and hashes, USGS requests
 *
 * node --import tsx scripts/research/rain-lag-2026-11/build-series.ts --work DIR
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FlowRecord } from './fetch-flow';
import type { RainDay } from './fetch-rain';
import { encodeTable } from './series';

const HOUR = 3_600_000;
async function main() {
  const args = process.argv.slice(2), work = args[1];
  if (args.length !== 2 || args[0] !== '--work' || !work) throw new Error('Usage: build-series.ts --work DIR');
  const protocol = JSON.parse(await readFile(join(__dirname, 'protocol.json'), 'utf8'));
  const { basins } = JSON.parse(await readFile(join(__dirname, 'data', 'basins.json'), 'utf8')) as { basins: { site: string; studied: boolean }[] };
  const sites = basins.filter(basin => basin.studied).map(basin => basin.site).sort();
  const start = Date.parse(protocol.window.start), hours = (Date.parse(protocol.window.end_exclusive) - start) / HOUR;

  const rain: Record<string, (number | null)[]> = Object.fromEntries(sites.map(site => [site, Array<number | null>(hours).fill(null)]));
  const seen = new Uint8Array(hours), files = createHash('sha256');
  let days = 0, wetDays = 0, unscreenedDays = 0, hourlyFiles = 0, missingFiles = 0;
  for (const name of (await readdir(join(work, 'rain'))).filter(file => file.endsWith('.json')).sort()) {
    const day = JSON.parse(await readFile(join(work, 'rain', name), 'utf8')) as RainDay;
    if (JSON.stringify(day.sites) !== JSON.stringify(sites)) throw new Error(`${name} was made for a different list of gauges`);
    days++; if (day.fetchedHourly) wetDays++; if (!day.screen) unscreenedDays++;
    for (const hour of day.hours) {
      // The file stamped T covers the hour ending at T, stored as the hour starting at T minus one hour.
      const index = (Date.parse(hour.end) - HOUR - start) / HOUR;
      if (day.fetchedHourly) { if (hour.sha256) { hourlyFiles++; files.update(`${hour.end} ${hour.sha256}\n`); } else missingFiles++; }
      if (index < 0 || index >= hours) continue;
      if (seen[index]++) throw new Error(`${hour.end} appears in two days`);
      // Three decimals of an inch: finer than the product resolves, and it keeps the file small.
      sites.forEach((site, i) => { const inches = hour.inches?.[i]; rain[site][index] = inches == null ? null : Math.round(inches * 1000) / 1000; });
    }
  }
  if (seen.some(count => count !== 1)) throw new Error(`${seen.filter(count => count !== 1).length} hours of the window have no rain day yet`);

  const flow: Record<string, (number | null)[]> = {}, requests: Record<string, FlowRecord['requests']> = {}, flowHours: Record<string, number> = {};
  for (const site of sites) {
    const record = JSON.parse(await readFile(join(work, 'flow', `${site}.json`), 'utf8')) as FlowRecord;
    if (record.start !== protocol.window.start || record.hours !== hours) throw new Error(`${site}: flow covers a different window`);
    flow[site] = record.flow; requests[site] = record.requests; flowHours[site] = record.hoursWithFlow;
  }
  const rainFile = encodeTable({ start: protocol.window.start, sites, values: rain }), flowFile = encodeTable({ start: protocol.window.start, sites, values: flow });
  await writeFile(join(__dirname, 'data', 'rain-hourly.csv.gz'), rainFile);
  await writeFile(join(__dirname, 'data', 'flow-hourly.csv.gz'), flowFile);
  const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(__dirname, 'data', 'sources.json'), `${JSON.stringify({
    window: protocol.window.start + '/' + protocol.window.end_exclusive, hours, gauges: sites.length,
    rain: { days, daysWithHourlyFiles: wetDays, daysNoaaHadNo24HourFile: unscreenedDays, hourlyFilesRead: hourlyFiles, hourlyFilesMissing: missingFiles,
      hoursWithNoAmount: Object.fromEntries(sites.map(site => [site, rain[site].filter(value => value === null).length]).filter(([, count]) => count)),
      sha256OfHourlyFileList: files.digest('hex') },
    flow: { hoursWithFlow: flowHours, requests },
    files: { 'rain-hourly.csv.gz': sha(rainFile), 'flow-hourly.csv.gz': sha(flowFile) },
  }, null, 1)}\n`);
  console.log(JSON.stringify({ days, wetDays, unscreenedDays, hourlyFiles, missingFiles, rainBytes: rainFile.length, flowBytes: flowFile.length }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
