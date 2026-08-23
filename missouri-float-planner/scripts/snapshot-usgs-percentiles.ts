#!/usr/bin/env npx tsx
/**
 * Snapshot USGS day-of-year discharge percentiles into usgs_daily_percentiles.
 *
 * WHY: the percentile ladder behind "× normal" framing and the CFS condition
 * ladders is fetched per site from the USGS Statistics API. The statistics
 * describe decades of record and effectively never change, so we capture them
 * into our own table and read from it whenever the live call fails — and
 * always, for the national gauges no cron polls. See
 * src/lib/usgs/percentile-snapshot.ts.
 *
 * Rows written before the Q1 2027 WaterServices migration carry
 * source='usgs_legacy_stat_service'; re-running this replaces them in place.
 *
 * Usage:
 *   npx tsx scripts/snapshot-usgs-percentiles.ts
 *   npx tsx scripts/snapshot-usgs-percentiles.ts --dry-run
 *   npx tsx scripts/snapshot-usgs-percentiles.ts --sites 07068000,07067000
 *   npx tsx scripts/snapshot-usgs-percentiles.ts --only-missing
 *   npx tsx scripts/snapshot-usgs-percentiles.ts --parameter 00065
 *
 * --parameter selects the ladder ('00060' discharge, the default, or '00065'
 * gage height). THIS SCRIPT IS THE STAGE BACKFILL: the monthly cron re-walks
 * the same curated-first head of the national list each pass and never
 * reaches the tail, so national coverage for a parameter is established here,
 * once, and the cron only maintains what actually gets refreshed. Stage rows
 * feed no user-facing band until the publication policy in
 * percentile-snapshot.ts enables them.
 *
 * Default site set: every active gauge_stations row with a usgs_site_id —
 * i.e. the gauges that actually drive curated river conditions. Uncurated
 * observatory gauges are fetched on demand and are not snapshotted here.
 */

import {
  PARAM_DISCHARGE,
  assertSnapshotParameter,
  snapshotSite,
} from '../src/lib/usgs/percentile-snapshot';
import { getScriptClient } from './lib/db';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyMissing = args.includes('--only-missing');
const sitesArg = args.find((a) => a.startsWith('--sites'));
const parameterArg = args.find((a) => a.startsWith('--parameter'));
const parameterCode = assertSnapshotParameter(
  parameterArg
    ? (parameterArg.includes('=')
        ? parameterArg.split('=')[1]
        : args[args.indexOf(parameterArg) + 1]) || ''
    : PARAM_DISCHARGE
);

/** Be a good citizen: the legacy service is shared infrastructure. */
const DELAY_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const supabase = getScriptClient({ script: 'snapshot-usgs-percentiles', write: !dryRun });

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
    // Filtered by parameter, or a stage backfill would skip every site the
    // discharge pass already covered — i.e. all of them.
    const { data } = await supabase
      .from('usgs_daily_percentiles')
      .select('site_no')
      .eq('parameter_code', parameterCode)
      .in('site_no', siteIds);
    const have = new Set((data ?? []).map((r: { site_no: string }) => r.site_no));
    const before = siteIds.length;
    siteIds = siteIds.filter((id) => !have.has(id));
    console.log(`--only-missing: skipping ${before - siteIds.length} already-snapshotted site(s)`);
  }

  console.log(
    `Snapshotting ${siteIds.length} site(s) for parameter ${parameterCode}${dryRun ? ' (dry run)' : ''}…\n`
  );

  let ok = 0;
  let empty = 0;
  const failures: Array<{ siteId: string; error: string }> = [];

  for (const [index, siteId] of siteIds.entries()) {
    const label = `[${index + 1}/${siteIds.length}] ${siteId}`;
    try {
      if (dryRun) {
        // Must be the SAME fetcher snapshotSite() uses, or a dry run previews
        // one service while the write hits another — which is exactly what this
        // branch did through the WaterServices migration.
        const { fetchDailyStatisticsRows } = await import('../src/lib/flow-providers/usgs-statistics');
        const rows = await fetchDailyStatisticsRows(siteId, parameterCode);
        console.log(`${label}: would write ${rows.length} row(s)`);
        if (rows.length) ok++;
        else empty++;
      } else {
        const written = await snapshotSite(supabase, siteId, parameterCode);
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
