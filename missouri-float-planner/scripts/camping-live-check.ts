// Read-only Phase 0 probe. Optional file contains public URL + anon key only.
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import {
  readRegionalStay,
  regionalStay,
  webCampingOverview,
} from '../src/lib/camping/web-data';
import { filteredStay, groupCampgrounds } from '../src/lib/camping/web-search';
import { resolveWeekend } from '../src/lib/camping/window';
async function main() {
  if (process.env.CAMPING_PUBLIC_CONFIG)
    Object.assign(
      process.env,
      JSON.parse(await readFile(process.env.CAMPING_PUBLIC_CONFIG, 'utf8')),
    );
  const now = Date.now();
  const startDate = process.argv[2] ?? resolveWeekend(new Date()).startDate;
  const endDate = (n: number) =>
    new Date(Date.parse(`${startDate}T12:00:00Z`) + n * 86_400_000)
      .toISOString()
      .slice(0, 10);
  for (const [arrival, departure] of [
    [startDate, endDate(2)],
    [startDate, endDate(14)],
  ]) {
    const start = performance.now();
    try {
      const response = await readRegionalStay(arrival, departure);
      console.log(
        JSON.stringify({
          arrival,
          departure,
          elapsedMs: Math.round(performance.now() - start),
          facilities: response.facilities.length,
          catalogSites: response.facilities.reduce(
            (sum, f) => sum + f.catalogSites,
            0,
          ),
          filters: response.filters,
          known: response.facilities.filter(
            (f) => filteredStay([f], [], now).state !== 'unknown',
          ).length,
          compressedBytes: gzipSync(JSON.stringify(response)).byteLength,
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          arrival,
          departure,
          elapsedMs: Math.round(performance.now() - start),
          error: String(error),
        }),
      );
    }
  }
  try {
    const overview = await webCampingOverview();
    console.log(
      JSON.stringify({
        tracked: overview.tracked.length,
        campgroundResults: groupCampgrounds(overview.tracked).length,
        untracked: overview.untracked.length,
        unmapped: overview.tracked.filter((c) => !c.place).map((c) => c.name),
      }),
    );
    await regionalStay(startDate, endDate(2));
    const times = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await regionalStay(startDate, endDate(2));
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.log(JSON.stringify({ memoHits: times.length, p95Ms: times[94] }));
  } catch (error) {
    console.log(JSON.stringify({ overviewOrMemoError: String(error) }));
  }
}
void main();
