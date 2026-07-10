#!/usr/bin/env npx tsx
/**
 * Finalize Buffalo access points (idempotent).
 *
 * The generic CSV importer (scripts/import-access-points-csv.ts) inserts NEW
 * points and snaps them, but it cannot (a) correct the coordinate of a point
 * that already existed, or (b) set authoritative river miles. This script does
 * both, so the full Buffalo access-point state is reproducible from source:
 *
 *   1. Coordinates — reconciles every Buffalo access point's `location_orig`
 *      to the authoritative NPS value in buffalo-access-points.csv. (Notably,
 *      the pre-existing "Steel Creek" row had a coordinate ~17 mi off the
 *      actual landing; this fixes it.)
 *   2. River miles — sets `river_mile_downstream` (schema's "mile from
 *      headwaters") to the published NPS float-matrix mileage in
 *      buffalo-float-points.ts. The float matrix is more accurate than
 *      geometry-derived snapping (which drifts with simplified seed geometry),
 *      and the current get_float_segment RPC takes segment DISTANCE from these
 *      hand-entered miles while taking segment GEOMETRY from location_snap.
 *
 * Points are matched by normalized name (case/punctuation-insensitive) so the
 * "Kyle's Landing" apostrophe doesn't cause a mismatch. This script does NOT
 * approve or publish anything — that is a deliberate review step.
 *
 * Run AFTER the CSV import + snap:
 *   npx tsx scripts/import-access-points-csv.ts scripts/data/buffalo-access-points.csv
 *   npx tsx scripts/snap-access-points.ts
 *   npx tsx scripts/data/finalize-buffalo-access-points.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { BUFFALO_FLOAT_POINTS } from './buffalo-float-points';

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key);
}

interface CsvCoord { name: string; lat: number; lon: number; }

function loadCsvCoords(): Map<string, CsvCoord> {
  const csvPath = path.join(__dirname, 'buffalo-access-points.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
  const headers = lines[0].split(',');
  const iName = headers.indexOf('name');
  const iLat = headers.indexOf('latitude');
  const iLon = headers.indexOf('longitude');
  const map = new Map<string, CsvCoord>();
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(',');
    map.set(normName(v[iName]), { name: v[iName], lat: parseFloat(v[iLat]), lon: parseFloat(v[iLon]) });
  }
  return map;
}

// normalized name -> published mile from Boxley (mile 0). Dixon Forge (above
// the park, negative mile, no DB row) is skipped by the name-match below.
const MILE_BY_NAME = new Map<string, number>(
  BUFFALO_FLOAT_POINTS.filter((p) => p.milesFromBoxley >= 0).map((p) => [normName(p.name), p.milesFromBoxley]),
);

async function main() {
  const sb = getClient();
  const coords = loadCsvCoords();

  const { data: river, error: rErr } = await sb.from('rivers').select('id, length_miles').eq('slug', 'buffalo').single();
  if (rErr || !river) throw new Error(`Buffalo river not found: ${rErr?.message}`);
  const lengthMiles = river.length_miles != null ? Number(river.length_miles) : null;

  const { data: aps, error: aErr } = await sb
    .from('access_points')
    .select('id, name, location_orig, river_mile_downstream')
    .eq('river_id', river.id);
  if (aErr || !aps) throw new Error(`access_points query failed: ${aErr?.message}`);

  console.log(`Finalizing ${aps.length} Buffalo access points\n${'='.repeat(50)}`);
  let coordFixed = 0, milesSet = 0, unmatched = 0;

  for (const ap of aps) {
    const key = normName(ap.name);
    const coord = coords.get(key);
    const mile = MILE_BY_NAME.get(key);
    if (!coord || mile === undefined) {
      console.warn(`  ⚠️  no authoritative match for "${ap.name}" — skipped`);
      unmatched++;
      continue;
    }

    // 1) reconcile coordinate (location_orig) if it drifts > ~30 m
    const cur = (ap.location_orig as { coordinates?: [number, number] } | null)?.coordinates;
    const drifted = !cur || Math.abs(cur[0] - coord.lon) > 0.0003 || Math.abs(cur[1] - coord.lat) > 0.0003;
    if (drifted) {
      const { error } = await sb.from('access_points')
        .update({ location_orig: { type: 'Point', coordinates: [coord.lon, coord.lat] }, updated_at: new Date().toISOString() })
        .eq('id', ap.id);
      if (error) { console.error(`  ❌ coord ${ap.name}: ${error.message}`); }
      else { console.log(`  📍 fixed coord: ${ap.name} -> ${coord.lat}, ${coord.lon}`); coordFixed++; }
    }

    // 2) set authoritative river mile (done AFTER the coord write so it is the
    // final value regardless of any snap trigger firing on the coord update)
    const patch: Record<string, number> = { river_mile_downstream: mile };
    if (lengthMiles != null) patch.river_mile_upstream = Math.round((lengthMiles - mile) * 100) / 100;
    if (ap.river_mile_downstream == null || Math.abs(Number(ap.river_mile_downstream) - mile) > 0.001) {
      const { error } = await sb.from('access_points').update(patch).eq('id', ap.id);
      if (error) { console.error(`  ❌ mile ${ap.name}: ${error.message}`); }
      else { console.log(`  📏 set mile: ${ap.name} = ${mile}`); milesSet++; }
    }
  }

  console.log(`\n${'='.repeat(50)}\n📊 coords fixed: ${coordFixed} | miles set: ${milesSet} | unmatched: ${unmatched}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
