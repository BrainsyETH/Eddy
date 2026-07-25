#!/usr/bin/env npx tsx
/**
 * Snapshot USGS day-of-year discharge percentiles into usgs_daily_percentiles.
 *
 * WHY: the percentile ladder behind "× normal" framing and the CFS condition
 * ladders comes from the USGS LEGACY statistics service, which has no modern
 * OGC equivalent and is scheduled for decommission in early 2027 (degradation
 * possible sooner). The statistics describe decades of record and effectively
 * never change, so we capture them now and read from our own table when the
 * live service stops answering. See src/lib/usgs/percentile-snapshot.ts.
 *
 * Usage:
 *   npx tsx scripts/snapshot-usgs-percentiles.ts
 *   npx tsx scripts/snapshot-usgs-percentiles.ts --dry-run
 *   npx tsx scripts/snapshot-usgs-percentiles.ts --sites 07068000,07067000
 *   npx tsx scripts/snapshot-usgs-percentiles.ts --only-missing
 *
 * Default site set: every active gauge_stations row with a usgs_site_id —
 * i.e. the gauges that actually drive curated river conditions. Uncurated
 * observatory gauges are fetched on demand and are not snapshotted here.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';
import { snapshotSite } from '../src/lib/usgs/percentile-snapshot';

const projectRoot = process.cwd();
const envPath = join(projectRoot, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyMissing = args.includes('--only-missing');
const sitesArg = args.find((a) => a.startsWith('--sites'));

/** Be a good citizen: the legacy service is shared infrastructure. */
const DELAY_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const supabase = createAdminClient();

  let siteIds: string[];
  if (sitesArg) {
    const raw = sitesArg.includes('=') ? sitesArg.split('=')[1] : args[args.indexOf(sitesArg) + 1];
    siteIds = (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const { data, error } = await supabase
      .from('gauge_stations')
      .select('usgs_site_id')
      .not('usgs_site_id', 'is', null);
    if (error) throw new Error(`Could not list gauge stations: ${error.message}`);
    siteIds = [...new Set((data ?? []).map((r: { usgs_site_id: string }) => r.usgs_site_id))];
  }

  if (!siteIds.length) {
    console.log('No sites to snapshot.');
    return;
  }

  if (onlyMissing) {
    const { data } = await supabase
      .from('usgs_daily_percentiles')
      .select('site_no')
      .in('site_no', siteIds);
    const have = new Set((data ?? []).map((r: { site_no: string }) => r.site_no));
    const before = siteIds.length;
    siteIds = siteIds.filter((id) => !have.has(id));
    console.log(`--only-missing: skipping ${before - siteIds.length} already-snapshotted site(s)`);
  }

  console.log(`Snapshotting ${siteIds.length} site(s)${dryRun ? ' (dry run)' : ''}…\n`);

  let ok = 0;
  let empty = 0;
  const failures: Array<{ siteId: string; error: string }> = [];

  for (const [index, siteId] of siteIds.entries()) {
    const label = `[${index + 1}/${siteIds.length}] ${siteId}`;
    try {
      if (dryRun) {
        const { fetchAllDailyStatistics } = await import('../src/lib/flow-providers/usgs');
        const rows = await fetchAllDailyStatistics(siteId);
        console.log(`${label}: would write ${rows.length} row(s)`);
        if (rows.length) ok++;
        else empty++;
      } else {
        const written = await snapshotSite(supabase, siteId);
        if (written) {
          console.log(`${label}: wrote ${written} row(s)`);
          ok++;
        } else {
          // Common and not an error: many gauges have too short a record for
          // USGS to publish daily statistics.
          console.log(`${label}: no statistics published — skipped`);
          empty++;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${label}: FAILED — ${message}`);
      failures.push({ siteId, error: message });
    }

    if (index < siteIds.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${ok} snapshotted, ${empty} without statistics, ${failures.length} failed.`);
  if (failures.length) {
    console.log('\nFailures (re-run with --sites to retry):');
    for (const f of failures) console.log(`  ${f.siteId}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
