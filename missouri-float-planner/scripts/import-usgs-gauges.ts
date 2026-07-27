#!/usr/bin/env npx tsx
/**
 * Import every live USGS stream gauge in the country into gauge_stations.
 *
 * This is the "All Gauges" tier from docs/EDDY_IOS_STRATEGY.md: raw national
 * coverage, secondary to the curated rivers, with NO floatability verdict
 * attached. It writes stations only — readings come from the
 * /api/cron/sync-gauge-latest pass, and thresholds are never touched.
 *
 * ── Why not extend import-missouri-gauges.ts ────────────────────────────────
 * That script hardcodes stateCd=MO against the LEGACY site service, and writes
 * with a per-row select-then-insert/update loop. At 16,500 sites the loop alone
 * is ~33,000 round trips. This one runs the modern OGC API by bbox and upserts
 * in chunks. The old script still works for what it does, so it is left alone.
 *
 * ── What counts as a gauge worth importing ──────────────────────────────────
 * A USGS stream site THAT IS CURRENTLY REPORTING. The monitoring-locations
 * collection lists far more stream sites than are alive — a 1°×1° box over the
 * Ozarks holds 158 stream sites but only 27 with a live discharge value. A
 * station that has not reported since 1997 is not a gauge you can check before
 * a float; it is a search result that always says "no reading". So the live
 * set from latest-continuous is the spine, and monitoring-locations only
 * decorates it with names and geography.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 *   * never sets `curated` — that flag is owned by river_gauges (00196)
 *   * never writes thresholds, and never deactivates an existing row
 *   * dry-run by default; --apply to write; EXPECTED_SUPABASE_REF guard
 *
 * Usage:
 *   npx tsx scripts/import-usgs-gauges.ts --region=ozarks        # preview one
 *   npx tsx scripts/import-usgs-gauges.ts                        # preview all
 *   npx tsx scripts/import-usgs-gauges.ts --apply                # write
 *   npx tsx scripts/import-usgs-gauges.ts --bbox=-96,36,-89,41 --apply
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  US_REGIONS,
  fetchRegionLatest,
  fetchRegionSites,
  type Bbox,
  type NationalSiteMeta,
} from '../src/lib/usgs/national-sites';

// Load env from .env.local (authoritative — overrides the shell), else
// process.env. Copied in spirit from fetch-nws-flood-stages.ts; the scripts in
// this repo are run directly with tsx and never through Next's env loading.
function loadEnv() {
  try {
    const txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const raw of txt.split('\n')) {
      const line = raw.replace(/\r$/, '');
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  } catch {
    /* no .env.local — rely on exported env vars */
  }
}
loadEnv();

const CHUNK = 500;

interface StationRow {
  provider: string;
  site_id_external: string;
  usgs_site_id: string;
  name: string;
  location: string;
  active: boolean;
  state_code: string | null;
  county: string | null;
  huc: string | null;
  site_type_code: string | null;
  agency_code: string | null;
  parameter_codes: string[];
  drainage_area_sqmi: number | null;
  first_seen_at: string;
  last_seen_at: string;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const regionArg = argv.find((a) => a.startsWith('--region='))?.split('=')[1];
  const bboxArg = argv.find((a) => a.startsWith('--bbox='))?.split('=')[1];

  let regions = US_REGIONS;
  if (bboxArg) {
    const parts = bboxArg.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      throw new Error(`--bbox must be four numbers: west,south,east,north (got "${bboxArg}")`);
    }
    regions = [{ name: 'custom', bbox: parts as Bbox }];
  } else if (regionArg) {
    const found = US_REGIONS.filter((r) => r.name === regionArg);
    if (!found.length) {
      throw new Error(
        `Unknown --region "${regionArg}". Known: ${US_REGIONS.map((r) => r.name).join(', ')}`,
      );
    }
    regions = found;
  }

  return { apply, regions };
}

function getSupabase(apply: boolean): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY = service_role key) — checked .env.local + shell env',
    );
  }

  // Guardrail from ingest-dossier.ts, added after the 2026-07 prod/legacy
  // project mixup: name the target and refuse to write to an unexpected one.
  const ref = (url.match(/https?:\/\/([a-z0-9]+)\.supabase\./) || [])[1] || '(unknown)';
  const expected = process.env.EXPECTED_SUPABASE_REF;
  console.log(`  → target Supabase project: ${ref}`);
  if (apply && expected && ref !== expected) {
    throw new Error(
      `ABORT: connected project '${ref}' != EXPECTED_SUPABASE_REF '${expected}'. Point NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL at the intended project before --apply.`,
    );
  }
  return createClient(url, key);
}

/** PostGIS EWKT — the same literal shape the seed SQL uses. */
function pointWkt(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

async function collectRegion(
  name: string,
  bbox: Bbox,
): Promise<{ rows: StationRow[]; liveCount: number; noMeta: number; noCoords: number }> {
  // Readings first: they define which sites are alive, and they carry a
  // coordinate fallback for sites monitoring-locations happens to miss.
  const live = await fetchRegionLatest(bbox);
  const meta = new Map<string, NationalSiteMeta>();
  for (const m of await fetchRegionSites(bbox)) meta.set(m.siteId, m);

  const now = new Date().toISOString();
  const rows: StationRow[] = [];
  let noMeta = 0;
  let noCoords = 0;

  for (const reading of live) {
    const m = meta.get(reading.siteId);
    if (!m) {
      // No stream-site metadata for a site that IS reporting. Once pagination
      // was fixed this stopped meaning "the metadata request truncated" and
      // started meaning what it should: the site is not a stream. Canals
      // (ST-CA), ditches (ST-DCH), tidal stations (ST-TS), lakes and estuaries
      // all report stage, and none of them is a river you float. Skip.
      noMeta++;
      continue;
    }

    const lng = m.lng ?? reading.lng;
    const lat = m.lat ?? reading.lat;
    if (lng === null || lat === null) {
      // No location from either source. A gauge with no coordinates cannot be
      // drawn, searched by distance, or starred usefully — skipping is better
      // than the {0,0} default /api/gauges falls back to.
      noCoords++;
      continue;
    }

    const parameterCodes: string[] = [];
    if (reading.dischargeCfs !== null) parameterCodes.push('00060');
    if (reading.gaugeHeightFt !== null) parameterCodes.push('00065');

    rows.push({
      provider: 'usgs',
      site_id_external: reading.siteId,
      usgs_site_id: reading.siteId,
      // Names come through mixed-case from USGS in some regions and as
      // upper-case shouting in others ("COYLE BRANCH AT HOUSTON, MO."). Left
      // verbatim either way: it is the name USGS publishes and the one people
      // match against on the USGS site, and title-casing would mangle "MO."
      // along with every NR/BL/AB abbreviation in the corpus.
      name: m.name ?? reading.siteId,
      location: pointWkt(lng, lat),
      active: true,
      state_code: m.stateCode,
      county: m.county,
      huc: m.huc,
      site_type_code: m.siteTypeCode,
      agency_code: m.agencyCode ?? 'USGS',
      parameter_codes: parameterCodes,
      drainage_area_sqmi: m.drainageAreaSqMi,
      first_seen_at: now,
      last_seen_at: now,
    });
  }

  return { rows, liveCount: live.length, noMeta, noCoords };
}

async function upsertRows(db: SupabaseClient, rows: StationRow[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db
      .from('gauge_stations')
      // The pair, not usgs_site_id: it is the key 00145 introduced for
      // multi-provider stations, and 00196 backfilled it so no row is missed.
      .upsert(chunk, { onConflict: 'provider,site_id_external', ignoreDuplicates: false });
    if (error) {
      throw new Error(`upsert failed at row ${i}: ${error.message}`);
    }
    written += chunk.length;
    process.stdout.write(`\r    written ${written}/${rows.length}`);
  }
  if (rows.length) process.stdout.write('\n');
  return written;
}

async function main() {
  const { apply, regions } = parseArgs();
  console.log(`USGS national gauge import — ${apply ? 'APPLY' : 'DRY RUN'}`);

  // Connect only when writing. A dry run talks to USGS and nothing else, so it
  // runs in CI and on a laptop with no service-role key in reach — which is
  // the whole point of having one.
  const db = apply ? getSupabase(apply) : null;

  const seen = new Set<string>();
  const all: StationRow[] = [];
  let totalLive = 0;
  let totalNoMeta = 0;
  let totalNoCoords = 0;
  let dupes = 0;

  for (const region of regions) {
    process.stdout.write(`  ${region.name.padEnd(20)} `);
    const { rows, liveCount, noMeta, noCoords } = await collectRegion(region.name, region.bbox);
    totalLive += liveCount;
    totalNoMeta += noMeta;
    totalNoCoords += noCoords;

    // Regions overlap at the seams on purpose (see US_REGIONS). Dedupe by site
    // id so an overlap costs bandwidth, never a duplicate row.
    let fresh = 0;
    for (const row of rows) {
      if (seen.has(row.site_id_external)) {
        dupes++;
        continue;
      }
      seen.add(row.site_id_external);
      all.push(row);
      fresh++;
    }
    console.log(`live=${String(liveCount).padStart(5)}  new=${String(fresh).padStart(5)}`);
  }

  console.log('');
  console.log(`  live readings seen : ${totalLive}`);
  console.log(`  unique stations    : ${all.length}`);
  console.log(`  seam duplicates    : ${dupes}`);
  console.log(`  not a stream site  : ${totalNoMeta} (skipped — canal, ditch, tidal, lake)`);
  console.log(`  no coordinates     : ${totalNoCoords} (skipped)`);

  const withDischarge = all.filter((r) => r.parameter_codes.includes('00060')).length;
  const withStage = all.filter((r) => r.parameter_codes.includes('00065')).length;
  console.log(`  reports discharge  : ${withDischarge}`);
  console.log(`  reports stage      : ${withStage}`);

  if (!apply) {
    console.log('\n  Sample:');
    for (const r of all.slice(0, 5)) {
      console.log(`    ${r.usgs_site_id}  ${r.state_code ?? '--'}  ${r.name}`);
    }
    console.log('\nDry run complete — re-run with --apply to write.');
    return;
  }

  console.log('');
  const written = await upsertRows(db!, all);
  console.log(`  upserted ${written} stations.`);
  console.log('  `curated` untouched — it is owned by river_gauges (00196).');
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
