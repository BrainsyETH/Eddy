#!/usr/bin/env npx tsx
/**
 * Compare legacy vs modern USGS day-of-year percentiles, per gauge.
 *
 * WHY THIS EXISTS, AND WHY IT EXPIRES
 * The percentile ladder behind "× normal", the CFS condition ladders and the
 * national tier's flow bands moved from the legacy statistics service
 * (waterservices.usgs.gov/nwis/stat/) to the modern Statistics API
 * (api.waterdata.usgs.gov/statistics/v0). USGS states plainly that the two are
 * not interchangeable — "the methodology used to derive statistics has changed"
 * (https://waterdata.usgs.gov/blog/wdfn-stats-delivery/).
 *
 * So the question is not whether the numbers move. It is whether any of them
 * move far enough to change what a user READS — a flow band, or a
 * PERCENTILE_RATINGS label. This script measures that.
 *
 * ⚠️ It can only run while the legacy service still answers. That service is
 * decommissioned in Q1 2027 with degradation authorized from August 2026. After
 * that this script cannot be re-run, and the comparison cannot be recovered.
 *
 * READ-ONLY. Writes nothing to Supabase; --json only writes a local file.
 *
 * Usage:
 *   npx tsx scripts/compare-usgs-percentiles.ts
 *   npx tsx scripts/compare-usgs-percentiles.ts --sites 07068000,07067000
 *   npx tsx scripts/compare-usgs-percentiles.ts --limit 5
 *   npx tsx scripts/compare-usgs-percentiles.ts --json tmp/percentile-drift.json
 *
 * Default site set: curated gauges only (gauge_stations.curated = true) — the
 * stations Eddy actually issues a verdict on. Needs Supabase env unless
 * --sites is given, in which case it needs no database at all.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fetchAllDailyStatistics, toDailyStatistics } from '../src/lib/flow-providers/usgs';
import { fetchDailyStatisticsRows } from '../src/lib/flow-providers/usgs-statistics';
import { calculateDischargePercentile } from '../src/lib/usgs/gauges';
import { flowBand } from '../shared/flow-band';
import type { DailyStatisticsRow } from '../src/lib/flow-providers/types';

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

function flagValue(name: string): string | undefined {
  const arg = args.find((a) => a === name || a.startsWith(`${name}=`));
  if (!arg) return undefined;
  return arg.includes('=') ? arg.split('=').slice(1).join('=') : args[args.indexOf(arg) + 1];
}

const sitesArg = flagValue('--sites');
const jsonPath = flagValue('--json');
const limit = Number(flagValue('--limit') ?? '0') || 0;

/** Shared infrastructure on both ends; two requests per site, unhurried. */
const DELAY_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The columns both services publish. p20/p80 are legacy-only; p90 modern-only. */
const SHARED_COLUMNS = ['p05', 'p10', 'p25', 'p50', 'p75', 'p95'] as const;
type SharedColumn = (typeof SHARED_COLUMNS)[number];

interface DayDrift {
  month: number;
  day: number;
  pct: Partial<Record<SharedColumn, number>>;
}

interface BandFlip {
  month: number;
  day: number;
  probeCfs: number;
  legacyPercentile: number | null;
  modernPercentile: number | null;
  legacyBand: string | null;
  modernBand: string | null;
}

interface SiteReport {
  siteId: string;
  legacyDays: number;
  modernDays: number;
  comparedDays: number;
  /** Median absolute % difference per percentile column. */
  medianDrift: Partial<Record<SharedColumn, number>>;
  worstDrift: { column: SharedColumn; pct: number; month: number; day: number } | null;
  /** Band changes for a reading BETWEEN ladder anchors — the real signal. */
  bandFlips: BandFlip[];
  /**
   * Band changes for a reading sitting exactly ON a cut point. Informational:
   * these flip on rounding noise from any source and say nothing about whether
   * the two services agree. See the probe-placement comment in compareSite.
   */
  boundaryTies: number;
  /** Denominator for the flip rate. */
  probesCompared: number;
  /** Which band transition, and how often — the shape of the change. */
  flipsByTransition: Record<string, number>;
  legacyP90Populated: number;
  modernP90Populated: number;
  error?: string;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentDiff(legacy: number, modern: number): number | null {
  if (legacy === 0) return null;
  return Math.abs((modern - legacy) / legacy) * 100;
}

function keyOf(row: DailyStatisticsRow): string {
  return `${row.month}-${row.day}`;
}

async function compareSite(siteId: string): Promise<SiteReport> {
  const report: SiteReport = {
    siteId,
    legacyDays: 0,
    modernDays: 0,
    comparedDays: 0,
    medianDrift: {},
    worstDrift: null,
    bandFlips: [],
    boundaryTies: 0,
    probesCompared: 0,
    flipsByTransition: {},
    legacyP90Populated: 0,
    modernP90Populated: 0,
  };

  const [legacyRows, modernRows] = await Promise.all([
    fetchAllDailyStatistics(siteId),
    fetchDailyStatisticsRows(siteId),
  ]);

  report.legacyDays = legacyRows.length;
  report.modernDays = modernRows.length;
  report.legacyP90Populated = legacyRows.filter((r) => r.p90 !== null).length;
  report.modernP90Populated = modernRows.filter((r) => r.p90 !== null).length;

  const modernByDay = new Map(modernRows.map((r) => [keyOf(r), r]));
  const driftSamples: Record<string, number[]> = {};
  const drifts: DayDrift[] = [];

  for (const legacy of legacyRows) {
    const modern = modernByDay.get(keyOf(legacy));
    if (!modern) continue;
    report.comparedDays++;

    const dayDrift: DayDrift = { month: legacy.month, day: legacy.day, pct: {} };
    for (const column of SHARED_COLUMNS) {
      const a = legacy[column];
      const b = modern[column];
      if (a === null || b === null) continue;
      const diff = percentDiff(a, b);
      if (diff === null) continue;
      dayDrift.pct[column] = diff;
      (driftSamples[column] ??= []).push(diff);
      if (!report.worstDrift || diff > report.worstDrift.pct) {
        report.worstDrift = { column, pct: diff, month: legacy.month, day: legacy.day };
      }
    }
    drifts.push(dayDrift);

    // ── Does anything a user READS change? ──
    //
    // PROBE PLACEMENT IS THE WHOLE METHOD, and getting it wrong invents a
    // scary number. Probing exactly AT a legacy anchor (p25, p75, …) is
    // degenerate: calculateDischargePercentile returns that percentile by
    // construction, so it sits precisely on a FLOW_BAND cut point and any
    // difference at all — 0.02% is enough — tips the modern answer one below.
    // That measures the boundary, not the services. The first run of this
    // script reported 81 such "flips" across three gauges; every one was
    // p25→p24 or p75→p74.
    //
    // Real readings land BETWEEN anchors, so probe there. Geometric midpoints,
    // because discharge distributions are log-ish and an arithmetic midpoint
    // sits too close to the upper anchor.
    const legacyStats = toDailyStatistics(siteId, legacy);
    const modernStats = toDailyStatistics(siteId, modern);

    const anchors = [legacy.p05, legacy.p10, legacy.p25, legacy.p50, legacy.p75, legacy.p95].filter(
      (v): v is number => v !== null && v > 0
    );
    const probes: number[] = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      probes.push(Math.sqrt(anchors[i] * anchors[i + 1]));
    }
    // Plus outside the ladder on both ends, where the extrapolation branches run.
    if (anchors.length) {
      probes.push(anchors[0] * 0.6, anchors[anchors.length - 1] * 1.6);
    }

    for (const probe of probes) {
      report.probesCompared++;
      const legacyPercentile = calculateDischargePercentile(probe, legacyStats);
      const modernPercentile = calculateDischargePercentile(probe, modernStats);
      const legacyBand = flowBand(legacyPercentile);
      const modernBand = flowBand(modernPercentile);
      if (legacyBand !== modernBand) {
        const transition = `${legacyBand} → ${modernBand}`;
        report.flipsByTransition[transition] = (report.flipsByTransition[transition] ?? 0) + 1;
        report.bandFlips.push({
          month: legacy.month,
          day: legacy.day,
          probeCfs: Math.round(probe),
          legacyPercentile,
          modernPercentile,
          legacyBand,
          modernBand,
        });
      }
    }

    // Knife-edge cases, tracked separately so they cannot be mistaken for
    // disagreement between the services. A reading sitting exactly on a cut
    // point flips on rounding noise from ANY source, including two readings
    // five minutes apart from the same service.
    for (const anchor of anchors) {
      const l = flowBand(calculateDischargePercentile(anchor, legacyStats));
      const m = flowBand(calculateDischargePercentile(anchor, modernStats));
      if (l !== m) report.boundaryTies++;
    }
  }

  for (const column of SHARED_COLUMNS) {
    const m = median(driftSamples[column] ?? []);
    if (m !== null) report.medianDrift[column] = Math.round(m * 100) / 100;
  }

  return report;
}

async function resolveSiteIds(): Promise<string[]> {
  if (sitesArg) {
    return sitesArg.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('gauge_stations')
    .select('usgs_site_id')
    .eq('curated', true)
    .not('usgs_site_id', 'is', null);
  if (error) throw new Error(`Could not list curated gauge stations: ${error.message}`);
  return [...new Set((data ?? []).map((r: { usgs_site_id: string }) => r.usgs_site_id))];
}

function pctLabel(value: number | undefined): string {
  return value === undefined ? '   —  ' : `${value.toFixed(1).padStart(5)}%`;
}

async function main() {
  let siteIds = await resolveSiteIds();
  if (limit > 0) siteIds = siteIds.slice(0, limit);

  if (!siteIds.length) {
    console.log('No sites to compare.');
    return;
  }

  console.log(`Comparing ${siteIds.length} site(s): legacy nwis/stat vs Statistics API\n`);
  console.log(
    `${'site'.padEnd(12)}${SHARED_COLUMNS.map((c) => c.padStart(7)).join('')}  flips  p90 legacy→modern`
  );
  console.log('─'.repeat(78));

  const reports: SiteReport[] = [];
  for (const [index, siteId] of siteIds.entries()) {
    try {
      const report = await compareSite(siteId);
      reports.push(report);
      const flips = report.bandFlips.length;
      console.log(
        `${siteId.padEnd(12)}` +
          SHARED_COLUMNS.map((c) => pctLabel(report.medianDrift[c])).join('') +
          `  ${String(flips).padStart(5)}` +
          `  ${report.legacyP90Populated}→${report.modernP90Populated}` +
          (flips ? '  ⚠️' : '')
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reports.push({
        siteId,
        legacyDays: 0,
        modernDays: 0,
        comparedDays: 0,
        medianDrift: {},
        worstDrift: null,
        bandFlips: [],
        boundaryTies: 0,
        probesCompared: 0,
        flipsByTransition: {},
        legacyP90Populated: 0,
        modernP90Populated: 0,
        error: message,
      });
      console.log(`${siteId.padEnd(12)}FAILED — ${message}`);
    }
    if (index < siteIds.length - 1) await sleep(DELAY_MS);
  }

  // ── Summary ──
  const ok = reports.filter((r) => !r.error);
  const totalFlips = ok.reduce((sum, r) => sum + r.bandFlips.length, 0);
  const sitesWithFlips = ok.filter((r) => r.bandFlips.length > 0);

  console.log('\n' + '═'.repeat(78));
  console.log(`Compared ${ok.length} site(s); ${reports.length - ok.length} failed.`);

  for (const column of SHARED_COLUMNS) {
    const values = ok.map((r) => r.medianDrift[column]).filter((v): v is number => v !== undefined);
    const m = median(values);
    if (m !== null) console.log(`  ${column}: median drift across sites ${m.toFixed(2)}%`);
  }

  const p90Gained = ok.filter((r) => r.legacyP90Populated === 0 && r.modernP90Populated > 0).length;
  console.log(
    `\n  p90: ${p90Gained}/${ok.length} site(s) go from NO published p90 to a populated one.`
  );
  console.log('       upperAnchor() in src/lib/usgs/gauges.ts stops falling back for those.');

  const totalTies = ok.reduce((sum, r) => sum + r.boundaryTies, 0);
  const totalProbes = ok.reduce((sum, r) => sum + r.probesCompared, 0);
  const rate = totalProbes ? ((totalFlips / totalProbes) * 100).toFixed(1) : '0.0';
  console.log(
    `\n  Band flips (readings between anchors): ${totalFlips} of ${totalProbes} probes ` +
      `(${rate}%) across ${sitesWithFlips.length} site(s).` +
      (totalFlips === 0 ? ' Nothing a user reads changes.' : '')
  );

  const transitions: Record<string, number> = {};
  for (const report of ok) {
    for (const [key, count] of Object.entries(report.flipsByTransition)) {
      transitions[key] = (transitions[key] ?? 0) + count;
    }
  }
  const ranked = Object.entries(transitions).sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    console.log('\n  By transition:');
    for (const [key, count] of ranked) {
      console.log(`    ${String(count).padStart(5)}  ${key}`);
    }
  }
  console.log(
    `  Boundary ties (readings exactly ON a cut point): ${totalTies} — informational.` +
      '\n    These flip on rounding noise from any source and are not disagreement.'
  );
  for (const report of sitesWithFlips) {
    console.log(`\n  ${report.siteId} — ${report.bandFlips.length} flip(s):`);
    for (const flip of report.bandFlips.slice(0, 8)) {
      console.log(
        `    ${String(flip.month).padStart(2, '0')}-${String(flip.day).padStart(2, '0')} ` +
          `@ ${flip.probeCfs} cfs: ${flip.legacyBand} (p${flip.legacyPercentile}) → ` +
          `${flip.modernBand} (p${flip.modernPercentile})`
      );
    }
    if (report.bandFlips.length > 8) {
      console.log(`    … and ${report.bandFlips.length - 8} more (use --json for the full list)`);
    }
  }

  if (jsonPath) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify({ generatedFor: siteIds, reports }, null, 2));
    console.log(`\nFull report written to ${jsonPath}`);
  }

  if (reports.some((r) => r.error)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
