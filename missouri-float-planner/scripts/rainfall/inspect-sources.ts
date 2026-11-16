/**
 * Reproducible read-only preflight. Does not connect to Supabase, approve
 * basins, schedule a collector, or produce public rainfall amounts.
 *
 * node --import tsx scripts/rainfall/inspect-sources.ts --inventory FILE --out DIR
 * Inventory: [{ usgs_site_id, drainage_area_sqmi, latitude, longitude }].
 * Export the curated gauge inventory using the SQL in docs/rainfall-sources.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { MRMS_URL, NLDI_URL, RAIN_WINDOWS, inspectBasin, selectMrmsRaster, siteId, statisticsParameters, rasterGrid, diagnosticStatistics } from './source-contract';

const args = process.argv.slice(2);
const value = (flag: string) => args[args.indexOf(flag) + 1];
if (args.length !== 4 || !args.includes('--inventory') || !args.includes('--out')
  || !value('--inventory') || !value('--out')) {
  throw new Error('Usage: inspect-sources.ts --inventory FILE --out NEW_DIRECTORY');
}
const out = resolve(value('--out'));
const deadline = AbortSignal.timeout(8 * 60_000);
let requestCount = 0;
const failures: Array<{ site: string; error: string }> = [];
const numberOrNull = (v: unknown) => (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

async function capture(name: string, url: string, body?: URLSearchParams): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (deadline.aborted) throw new Error('Inspection deadline exceeded');
    try {
      requestCount++;
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET', body,
        headers: { Accept: 'application/json', 'User-Agent': 'Eddy rainfall source validation (https://eddy.guide)' },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(25_000)]),
      });
      if (!response.ok) throw new Error(`${response.status} from ${new URL(url).hostname}`);
      const text = await response.text();
      if (text.length > 4_000_000) throw new Error('Source response exceeds inspection size limit');
      const data: unknown = JSON.parse(text);
      if (data && typeof data === 'object' && 'error' in data) throw new Error(`Provider error: ${JSON.stringify(data)}`);
      await writeFile(join(out, `${name}.json`), JSON.stringify({
        fetchedAt: new Date().toISOString(), url, method: body ? 'POST' : 'GET',
        parameters: body ? Object.fromEntries(body) : null,
        sha256: createHash('sha256').update(text).digest('hex'), data,
      }, null, 2) + '\n');
      return data;
    } catch (error) { lastError = error; }
    // One bounded retry; the script is an operator inspection, not a cron.
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
  }
  throw lastError;
}

async function main() {
  const raw: unknown = JSON.parse(await readFile(value('--inventory'), 'utf8'));
  if (!Array.isArray(raw) || !raw.length || raw.length > 100) throw new Error('Expected 1–100 curated inventory rows');
  const inventory = raw.filter((r) => r.usgs_site_id != null).map((r) => ({
    site: siteId(String(r.usgs_site_id)), storedAreaSqmi: numberOrNull(r.drainage_area_sqmi),
    storedLocation: numberOrNull(r.longitude) != null && numberOrNull(r.latitude) != null
      ? [Number(r.longitude), Number(r.latitude)] : null,
  }));
  if (new Set(inventory.map((r) => r.site)).size !== inventory.length) throw new Error('Duplicate inventory sites');
  // Never overwrite a previous inspection's evidence.
  await mkdir(out, { recursive: false });
  await writeFile(join(out, 'inventory.json'), JSON.stringify(raw, null, 2) + '\n');
  const metadata = await capture('mrms-metadata', `${MRMS_URL}?f=json`);
  const query = new URLSearchParams({ f: 'json', where: '1=1', outFields: '*', returnGeometry: 'false' });
  const catalog = await capture('mrms-catalog', `${MRMS_URL}/query?${query}`);
  const products: Array<ReturnType<typeof selectMrmsRaster> & { grid: ReturnType<typeof rasterGrid> }> = [];
  for (const hours of RAIN_WINDOWS) {
    const product = selectMrmsRaster(metadata, catalog, hours, Date.now());
    const grid = rasterGrid(await capture(`mrms-${hours}h-grid`, `${MRMS_URL}/${product.rasterId}/info?f=json`));
    products.push({ ...product, grid });
  }
  const fullResolutionComparisons: Array<{ site: string; full: ReturnType<typeof inspectBasin>; areaChangeFraction: number | null }> = [];
  const diagnostics: Array<{ site: string; hours: number } & ReturnType<typeof diagnosticStatistics>> = [];
  const basins: Array<Omit<ReturnType<typeof inspectBasin>, 'basin'>> = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < inventory.length && !deadline.aborted) {
      const row = inventory[next++];
      try {
        const base = `${NLDI_URL}/USGS-${row.site}`;
        // Sequential within each worker: at most four upstream requests total.
        const basin = await capture(`${row.site}-basin`, `${base}/basin?f=json&simplified=true`);
        const nldiSite = await capture(`${row.site}-nldi-site`, base);
        const usgsSite = await capture(`${row.site}-usgs-site`, `https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items?f=json&id=USGS-${row.site}&limit=1`);
        const { basin: geometry, ...inspection } = inspectBasin({ ...row, basin, nldiSite, usgsSite });
        basins.push(inspection);
        // Revisit the two topology failures in the original 2026-11-11 capture.
        // Keep the full-resolution evidence; no repair or automatic approval.
        if (['07057500', '07063000'].includes(row.site)) {
          const full = await capture(`${row.site}-basin-full`, `${base}/basin?f=json&simplified=false`);
          const fullInspection = inspectBasin({ ...row, basin: full, nldiSite, usgsSite });
          const areaChangeFraction = fullInspection.basinAreaSqmi != null && inspection.basinAreaSqmi != null
            ? (inspection.basinAreaSqmi - fullInspection.basinAreaSqmi) / fullInspection.basinAreaSqmi : null;
          fullResolutionComparisons.push({ site: row.site, full: fullInspection, areaChangeFraction });
          if (areaChangeFraction == null || Math.abs(areaChangeFraction) > 0.01) {
            inspection.issues.push('simplification_area_mismatch');
            throw new Error('Simplified/full area comparison failed');
          }
        }
        if (!geometry) throw new Error(inspection.geometryError ?? 'Invalid basin geometry');
        if (row.site === '07065495') {
          for (const product of products) {
            const response = await capture(`jacks-fork-${product.hours}h-raw-statistics`, `${MRMS_URL}/computeStatisticsHistograms`, statisticsParameters(geometry, product, product.grid));
            diagnostics.push({ site: row.site, hours: product.hours, ...diagnosticStatistics(response) });
          }
          const daily = products.find((r) => r.hours === 24)!;
          await capture('jacks-fork-24h-display-statistics', `${MRMS_URL}/computeStatisticsHistograms`, statisticsParameters(geometry, daily, daily.grid, 'rft_24hr'));
        }
        console.log(`${row.site}: ${inspection.basinAreaSqmi?.toFixed(1) ?? 'unknown'} sq mi; ${inspection.issues.join(', ') || 'area/point checks agree'}; unreviewed`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ site: row.site, error: message });
        console.error(`${row.site}: ${message}`);
      }
    }
  }));
  const report = {
    inspectedAt: new Date().toISOString(), requestCount,
    publicationReady: false,
    remainingGates: ['hosted_raw_units_crosscheck', 'native_grid_alignment', 'area_weighted_coverage', 'basin_review', 'forecast_sampling', 'storm_replay'],
    basinSource: 'NLDI simplified=true',
    products, fullResolutionComparisons, diagnostics,
    basins: basins.sort((a, b) => a.site.localeCompare(b.site)), failures,
    skippedWithoutUsgsId: raw.length - inventory.length,
    unprocessed: inventory.slice(next).map((r) => r.site),
    note: 'Raw statistics are diagnostics, not validated rainfall amounts. No dry/rain state may be inferred from these files.',
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (failures.length || report.unprocessed.length) process.exitCode = 1;
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
