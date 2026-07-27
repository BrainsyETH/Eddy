#!/usr/bin/env npx tsx
/**
 * Attach NWS flood thresholds to the national reference gauges.
 *
 * The "All Gauges" tier shows a reading and how it compares to the site's own
 * history. Neither says anything about danger, and Eddy will not invent a
 * floatability verdict for an unrated gauge — but the National Weather Service
 * HAS published an official action/flood/moderate/major stage for about 12,700
 * forecast points, and quoting someone else's official threshold is not the
 * same as inventing one. That is what this imports.
 *
 * ── Source ─────────────────────────────────────────────────────────────────
 * The NOAA ArcGIS `riv_gauges` layer, not the NWPS REST API. NWPS
 * /v1/gauges?bbox.* returns an empty list as of 2026-07 (the same call
 * src/lib/nws/flood-stages.ts makes), and the per-gauge endpoint would be
 * ~12,700 requests. The ArcGIS layer answers the whole country in seven pages.
 *
 * ── What it refuses to write ───────────────────────────────────────────────
 * Roughly 6% of the published thresholds are not stages in feet at all:
 *   * values in the thousands — gauges reported against an ELEVATION datum, so
 *     "flood = 3207" is feet above sea level, not feet of river. Writing that
 *     next to a paddler's 6 ft ceiling would be gibberish.
 *   * values in kcfs — a discharge threshold, which does not belong in a
 *     column named _ft under any circumstances.
 *   * sets that are not ordered action <= flood <= moderate <= major, which
 *     means the row disagrees with itself.
 * Each is skipped and counted, never coerced. This follows the rule
 * fetch-nws-flood-stages.ts already established for the curated path: a
 * threshold we are not sure about is not written.
 *
 * ── What it will not touch ─────────────────────────────────────────────────
 * CURATED stations. Their flood stages live on river_gauges and arrive through
 * fetch-nws-flood-stages.ts, which cross-checks the USGS id NWPS reports
 * against ours and skips mismatches. That path is more careful than a spatial
 * match and it feeds real verdicts, so this script stays out of its way.
 *
 * Usage:
 *   npx tsx scripts/import-nwps-gauges.ts              # preview
 *   npx tsx scripts/import-nwps-gauges.ts --apply      # write
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const raw of txt.split('\n')) {
      const m = raw.replace(/\r$/, '').match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  } catch {
    /* rely on exported env vars */
  }
}
loadEnv();

const ARCGIS =
  'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/0/query';
const PAGE = 2000;
const MAX_PAGES = 20;

/**
 * The highest number that can still be a river stage in feet.
 *
 * Real US flood stages top out in the fifties; the Mississippi at its deepest
 * forecast points is around 50 ft. 120 is comfortably above anything genuine
 * and comfortably below the elevation-datum values, which start in the
 * hundreds and run to thousands.
 */
const MAX_PLAUSIBLE_STAGE_FT = 120;

/** How close an NWS forecast point must sit to a USGS station to be the same gauge. */
const MATCH_RADIUS_M = 150;

interface NwpsRow {
  lid: string;
  waterbody: string | null;
  lng: number;
  lat: number;
  action: number | null;
  flood: number | null;
  moderate: number | null;
  major: number | null;
}

interface Station {
  id: string;
  lng: number;
  lat: number;
  curated: boolean;
}

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY = service_role key) — checked .env.local + shell env',
    );
  }
  const ref = (url.match(/https?:\/\/([a-z0-9]+)\.supabase\./) || [])[1] || '(unknown)';
  const expected = process.env.EXPECTED_SUPABASE_REF;
  console.log(`  → target Supabase project: ${ref}`);
  if (expected && ref !== expected) {
    throw new Error(
      `ABORT: connected project '${ref}' != EXPECTED_SUPABASE_REF '${expected}'.`,
    );
  }
  return createClient(url, key);
}

function parseStage(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n)) return null;
  // -9999 is NWPS's "not published" sentinel; 0 is indistinguishable from unset
  // in this feed and is not a meaningful flood stage anywhere.
  if (n <= 0 || n > MAX_PLAUSIBLE_STAGE_FT) return null;
  return Math.round(n * 100) / 100;
}

/**
 * True unless the published stages contradict each other.
 *
 * An EMPTY set passes. Thousands of forecast points publish no thresholds at
 * all — they are still real gauges with a real LID and a real waterbody name,
 * and both are worth having: the LID is the link to the NWS page and to the
 * stage/flow forecast endpoint. Treating "published nothing" as "published
 * something wrong" would throw away two thirds of the feed.
 */
function stagesAgree(row: {
  action: number | null;
  flood: number | null;
  moderate: number | null;
  major: number | null;
}): boolean {
  const seq = [row.action, row.flood, row.moderate, row.major].filter(
    (v): v is number => v !== null,
  );
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] < seq[i - 1]) return false;
  }
  return true;
}

async function fetchAllNwps(): Promise<{
  rows: NwpsRow[];
  rejected: Record<string, number>;
  withoutStages: number;
}> {
  const rows: NwpsRow[] = [];
  const rejected = { notFeet: 0, implausible: 0, unordered: 0, noGeometry: 0 };
  let withoutStages = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(ARCGIS);
    url.searchParams.set('where', '1=1');
    url.searchParams.set(
      'outFields',
      'gaugelid,waterbody,state,action,flood,moderate,major,units',
    );
    url.searchParams.set('returnGeometry', 'true');
    // The layer publishes NAD83 (wkid 4759). Ask for WGS84 explicitly rather
    // than treating one as the other — sub-metre in CONUS, but the match radius
    // below is 150 m and the datum should not be part of its error budget.
    url.searchParams.set('outSR', '4326');
    url.searchParams.set('resultOffset', String(page * PAGE));
    url.searchParams.set('resultRecordCount', String(PAGE));
    url.searchParams.set('f', 'json');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`ArcGIS page ${page} → ${res.status} ${res.statusText}`);
    const data = (await res.json()) as {
      features?: Array<{
        attributes?: Record<string, unknown>;
        geometry?: { x?: number; y?: number };
      }>;
      exceededTransferLimit?: boolean;
    };

    for (const f of data.features ?? []) {
      const a = f.attributes ?? {};
      const lid = typeof a.gaugelid === 'string' ? a.gaugelid.trim() : '';
      if (!lid) continue;

      const x = f.geometry?.x;
      const y = f.geometry?.y;
      if (typeof x !== 'number' || typeof y !== 'number' || (x === 0 && y === 0)) {
        rejected.noGeometry++;
        continue;
      }

      // kcfs thresholds are discharge, not stage. There is no honest way to put
      // one in a column called *_stage_ft.
      const units = typeof a.units === 'string' ? a.units.trim().toLowerCase() : '';
      if (units !== 'ft') {
        rejected.notFeet++;
        continue;
      }

      const parsed = {
        action: parseStage(a.action),
        flood: parseStage(a.flood),
        moderate: parseStage(a.moderate),
        major: parseStage(a.major),
      };

      const anyRaw = [a.action, a.flood, a.moderate, a.major].some(
        (v) => v !== null && v !== undefined && v !== '',
      );
      if (anyRaw && !Object.values(parsed).some((v) => v !== null)) {
        // Published something, none of it survived the plausibility gate —
        // almost always an elevation-datum gauge.
        rejected.implausible++;
        continue;
      }
      if (!stagesAgree(parsed)) {
        rejected.unordered++;
        continue;
      }
      if (!Object.values(parsed).some((v) => v !== null)) withoutStages++;

      rows.push({
        lid,
        waterbody: typeof a.waterbody === 'string' && a.waterbody ? a.waterbody : null,
        lng: x,
        lat: y,
        ...parsed,
      });
    }

    if (!data.exceededTransferLimit) break;
  }

  return { rows, rejected, withoutStages };
}

/**
 * Every active station's coordinates, walked by keyset cursor.
 *
 * gauge_points, not gauges_in_bbox: the latter caps at 1,000 rows because it
 * answers a phone's viewport, and stacking .range() on top of it cannot page
 * past that cap — it would silently return the first 1,000 stations and match
 * every NWPS point in the country against them.
 */
async function loadStations(db: SupabaseClient): Promise<Station[]> {
  const out: Station[] = [];
  const SIZE = 2000;
  let after: string | null = null;

  for (;;) {
    const { data, error } = await db.rpc('gauge_points', { p_after: after, p_limit: SIZE });
    if (error) throw new Error(`station load failed: ${error.message}`);
    const rows = (data ?? []) as Array<{
      id: string;
      lng: number | null;
      lat: number | null;
      curated: boolean;
    }>;
    if (!rows.length) break;

    for (const r of rows) {
      if (r.lng === null || r.lat === null) continue;
      out.push({ id: r.id, lng: r.lng, lat: r.lat, curated: r.curated });
    }
    after = rows[rows.length - 1].id;
    if (rows.length < SIZE) break;
  }
  return out;
}

/** Metres between two points, good enough at 150 m scale. */
function metresBetween(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const latRad = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dx = (bLng - aLng) * 111_320 * Math.cos(latRad);
  const dy = (bLat - aLat) * 110_574;
  return Math.sqrt(dx * dx + dy * dy);
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`NWPS flood-stage import — ${apply ? 'APPLY' : 'DRY RUN'}`);

  const { rows, rejected, withoutStages } = await fetchAllNwps();
  console.log(`  NWPS rows usable   : ${rows.length}`);
  console.log(`    of those, with stages : ${rows.length - withoutStages}`);
  console.log(`    of those, LID only    : ${withoutStages} (no thresholds published)`);
  console.log(`  rejected, not feet : ${rejected.notFeet} (kcfs thresholds)`);
  console.log(`  rejected, implausible: ${rejected.implausible} (elevation datum)`);
  console.log(`  rejected, contradictory: ${rejected.unordered}`);
  console.log(`  rejected, no geometry: ${rejected.noGeometry}`);

  if (!apply) {
    console.log('\n  Sample:');
    for (const r of rows.slice(0, 5)) {
      console.log(
        `    ${r.lid}  ${r.waterbody ?? '—'}  action=${r.action ?? '—'} flood=${r.flood ?? '—'} major=${r.major ?? '—'}`,
      );
    }
    console.log('\nDry run complete — re-run with --apply to match and write.');
    return;
  }

  const db = getSupabase();
  const stations = await loadStations(db);
  console.log(`  stations loaded    : ${stations.length}`);

  // Bucket stations by whole degree so each NWPS point compares against a few
  // dozen candidates instead of all 14,000.
  const grid = new Map<string, Station[]>();
  for (const s of stations) {
    const key = `${Math.floor(s.lng)},${Math.floor(s.lat)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(s);
    else grid.set(key, [s]);
  }

  const updates: Array<{ id: string; row: NwpsRow }> = [];
  let unmatched = 0;
  let skippedCurated = 0;

  for (const r of rows) {
    const gx = Math.floor(r.lng);
    const gy = Math.floor(r.lat);
    let best: Station | null = null;
    let bestDist = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const s of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const d = metresBetween(r.lng, r.lat, s.lng, s.lat);
          if (d < bestDist) {
            bestDist = d;
            best = s;
          }
        }
      }
    }

    if (!best || bestDist > MATCH_RADIUS_M) {
      unmatched++;
      continue;
    }
    if (best.curated) {
      // Curated flood stages come from fetch-nws-flood-stages.ts, which
      // cross-checks the USGS id NWPS reports rather than trusting proximity.
      skippedCurated++;
      continue;
    }
    updates.push({ id: best.id, row: r });
  }

  console.log(`  matched            : ${updates.length}`);
  console.log(`  no station within ${MATCH_RADIUS_M}m: ${unmatched}`);
  console.log(`  skipped (curated)  : ${skippedCurated}`);

  let written = 0;
  for (const { id, row } of updates) {
    const { error } = await db
      .from('gauge_stations')
      .update({
        nws_lid: row.lid,
        waterbody_name: row.waterbody,
        nwps_action_stage_ft: row.action,
        nwps_flood_stage_ft: row.flood,
        nwps_moderate_stage_ft: row.moderate,
        nwps_major_stage_ft: row.major,
      })
      .eq('id', id);
    if (error) throw new Error(`update ${id} failed: ${error.message}`);
    written++;
    if (written % 250 === 0) process.stdout.write(`\r    written ${written}/${updates.length}`);
  }
  if (written) process.stdout.write('\n');
  console.log(`  updated ${written} stations.`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
