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
 *
 * The preview does the whole job except the UPDATE — it fetches, filters,
 * spatially matches and reports how many stations WOULD be written and how many
 * curated ones it left alone. Both paths need database credentials for that
 * reason.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { getScriptClient } from './lib/db';

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

function getSupabase(apply: boolean): SupabaseClient {
  // Env loading, name resolution, and the EXPECTED_SUPABASE_REF guard now live
  // in scripts/lib/db.ts; --apply requires the pin to be set, not just consistent.
  return getScriptClient({ script: 'import-nwps-gauges', write: apply });
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
      error?: { code?: number; message?: string; details?: string[] };
    };

    // ── ArcGIS reports failure with HTTP 200 ────────────────────────────────
    // A rate-limited or malformed query comes back 200 with an `error` object
    // and no `features`, which the `?? []` below reads as "this page held no
    // gauges". Every page then does the same, the run finishes with zero rows,
    // and it prints "updated 0 stations" and exits 0 — a total failure wearing
    // the costume of a successful no-op. Observed in practice, which is why
    // this check exists.
    if (data.error) {
      throw new Error(
        `ArcGIS page ${page} → error ${data.error.code ?? '?'}: ${data.error.message ?? 'unknown'}` +
          (data.error.details?.length ? ` (${data.error.details.join('; ')})` : ''),
      );
    }

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

  // A run that read nothing has not "found no flood stages" — the NWS publishes
  // thousands and always has. It has failed to reach them, and the only honest
  // thing to do with that is stop, because everything downstream would go on to
  // report zero matches as a result.
  if (rows.length === 0) {
    throw new Error(
      'ArcGIS returned no usable gauges. The layer is never empty — treat this as an upstream failure and retry.',
    );
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
  // ── Why the page size is 1000 and why we do not stop on a short page ──────
  // This asked for 2000 and stopped as soon as a page came back smaller than it
  // requested. PostgREST caps a response at 1000 rows on this project, so page
  // one arrived with 1000, `1000 < 2000` read as "that was the last page", and
  // the whole run proceeded against a fourteenth of the network. Nothing failed:
  // every NWPS point with no station in that slice was counted as "no station
  // within 150m", which is the same tally a genuinely unmatched gauge produces.
  // The import would have written a few hundred stations and reported success.
  //
  // So the size now matches what the server will actually return, and the loop
  // terminates on an EMPTY page rather than on a short one — which stays correct
  // whatever the cap is set to later. The cost is one extra round trip per run.
  const SIZE = 1000;
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

  const db = getSupabase(apply);
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

  // ── Keyed by STATION, not appended per NWPS row ──────────────────────────
  // The loop below picks the nearest station for each NWPS gauge, which is the
  // right question asked in the wrong direction: two NWPS gauges can both land
  // within 150 m of one station, and a plain array then writes that station
  // twice with whichever row happened to come later in the ArcGIS paging. The
  // thresholds that survived were chosen by page order.
  //
  // Measured on the first full run: 6,851 matches collapsed to 6,829 distinct
  // stations, so 22 stations had their flood stage decided arbitrarily. Small,
  // and not something to decide by accident — a flood stage is the number the
  // whole overlay is drawn from. Nearest wins in both directions now.
  const updates = new Map<string, { row: NwpsRow; distance: number }>();
  let unmatched = 0;
  let skippedCurated = 0;
  let contested = 0;

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
    const existing = updates.get(best.id);
    if (existing) {
      contested++;
      if (bestDist >= existing.distance) continue;
    }
    updates.set(best.id, { row: r, distance: bestDist });
  }

  console.log(`  matched            : ${updates.size}`);
  console.log(`  no station within ${MATCH_RADIUS_M}m: ${unmatched}`);
  console.log(`  skipped (curated)  : ${skippedCurated}`);
  if (contested) {
    console.log(`  contested (nearest won): ${contested}`);
  }

  // ── The dry run stops HERE, not before the match ──────────────────────────
  // Everything above is reads: the ArcGIS pull, loadStations, and an in-memory
  // grid. The early return used to sit above all of it, which made a dry run
  // report what NWPS publishes and nothing about what this script would do to
  // our database — the two numbers that matter (how many stations get written,
  // and how many curated ones were correctly left alone) only appeared once you
  // had already committed to writing them. For a script whose documented guard
  // is "dry-default", that is the wrong half to preview.
  if (!apply) {
    console.log('\n  Would write, sample:');
    for (const { row } of [...updates.values()].slice(0, 5)) {
      console.log(
        `    ${row.lid}  ${row.waterbody ?? '—'}  action=${row.action ?? '—'} flood=${row.flood ?? '—'} major=${row.major ?? '—'}`,
      );
    }
    console.log('\nDry run complete — re-run with --apply to write.');
    return;
  }

  let written = 0;
  for (const [id, { row }] of updates) {
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
    if (written % 250 === 0) process.stdout.write(`\r    written ${written}/${updates.size}`);
  }
  if (written) process.stdout.write('\n');
  console.log(`  updated ${written} stations.`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
