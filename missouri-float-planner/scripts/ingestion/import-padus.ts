#!/usr/bin/env npx tsx
/**
 * Public land boundaries for Eddy's river corridors, from USGS PAD-US.
 *
 * "Can I camp on that gravel bar?" is the commonest question a float raises
 * that this product has never been able to touch. The Ozarks answer is a
 * patchwork of national forest, national riverway, state conservation area and
 * private ground, none of it visible from the water. This imports the parts of
 * it that lie near a river Eddy covers.
 *
 * ── Source ─────────────────────────────────────────────────────────────────
 * The PAD-US feature layer on ArcGIS Online, queried per corridor. NOT the
 * USGS tile services: gis1.usgs.gov answers 502, the ArcGIS Online vector tile
 * services answer "Token Required", and the one dependable ArcGIS service
 * (apps.fs.usda.gov EDW_PADUS_01) is FOREST SERVICE ONLY — a quarter of what
 * matters here, with no MDC conservation areas and no NPS. This layer has all
 * of it and needs no token.
 *
 * It is PAD-US v3.0. v4 is published as downloadable geodatabases and, as of
 * writing, has no equivalent keyless query endpoint. Recorded here because a
 * future run against a v4 service is a change of URL and a re-check of the
 * field names below, not a rewrite.
 *
 * ── Corridors, not states ──────────────────────────────────────────────────
 * The MO+AR bounding box holds 11,701 parcels and most of them are nowhere near
 * a river anyone floats. Each active river's own bbox, buffered, is queried
 * instead — about 256 parcels for the Current — and the results are deduped by
 * PAD-US id, because one national forest legitimately touches many corridors.
 *
 * ── What this refuses to write ─────────────────────────────────────────────
 * Anything without a polygon, and anything without the source's own stable id.
 * A parcel with no id cannot be re-imported without duplicating itself, and the
 * source is republished periodically.
 *
 * Usage:
 *   npx tsx scripts/ingestion/import-padus.ts              # preview
 *   npx tsx scripts/ingestion/import-padus.ts --apply      # write
 *   npx tsx scripts/ingestion/import-padus.ts --river=current
 *
 * The preview does the whole job except the write — it fetches, dedupes and
 * reports what WOULD be stored. Both paths need database credentials for that
 * reason. Export EXPECTED_SUPABASE_REF; this script honours it.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { getScriptClient } from '../lib/db';

const PADUS =
  'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name/FeatureServer/0/query';

/** The service's own page size. Asking for more silently returns this many. */
const PAGE = 2000;
/** A corridor that needs more than this many pages is a bug, not a corridor. */
const MAX_PAGES = 12;

/**
 * How far from the river to look, in degrees (~5.5 km).
 *
 * Wide enough to catch the conservation area whose boundary is a mile off the
 * water and still relevant to where you can camp; narrow enough that a corridor
 * query does not turn into a state query.
 */
const CORRIDOR_BUFFER_DEG = 0.05;

/**
 * Coordinate precision requested from the service, in decimal places.
 *
 * 5 dp is about a metre. These are agency boundaries drawn at agency precision
 * and are explicitly not a survey — see the migration header — so more than a
 * metre is bytes spent on a claim the data does not support.
 */
const GEOMETRY_PRECISION = 5;

interface RiverBox {
  slug: string;
  name: string;
  west: number;
  south: number;
  east: number;
  north: number;
}

interface Parcel {
  padusId: string;
  unitName: string;
  managerName: string | null;
  managerType: string | null;
  designation: string | null;
  publicAccess: string | null;
  gisAcres: number | null;
  stateCode: string | null;
  /** GeoJSON geometry, already MultiPolygon-normalised. */
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

function getSupabase(apply: boolean): SupabaseClient {
  // Env loading, name resolution, and the EXPECTED_SUPABASE_REF guard now live
  // in scripts/lib/db.ts; --apply requires the pin to be set, not just consistent.
  return getScriptClient({ script: 'import-padus', write: apply });
}

/** Every active river's bounding box, buffered into a corridor. */
async function loadCorridors(db: SupabaseClient, only: string | null): Promise<RiverBox[]> {
  // Extent computed client-side rather than in SQL: it needs no RPC, the whole
  // set is 24 rows, and PostgREST already returns `geom` as GeoJSON.
  const res = await db
    .from('rivers')
    .select('slug, name, geom')
    .eq('active', true)
    .order('slug');
  if (res.error) throw new Error(`river load failed: ${res.error.message}`);

  const boxes: RiverBox[] = [];
  for (const row of (res.data ?? []) as Array<{
    slug: string;
    name: string;
    geom: { coordinates?: unknown } | null;
  }>) {
    if (only && row.slug !== only) continue;
    const coords = flatten(row.geom?.coordinates);
    if (coords.length === 0) {
      console.warn(`  ! ${row.slug}: no geometry, skipped`);
      continue;
    }
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [lng, lat] of coords) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    if (!Number.isFinite(west)) continue;
    boxes.push({
      slug: row.slug,
      name: row.name,
      west: west - CORRIDOR_BUFFER_DEG,
      south: south - CORRIDOR_BUFFER_DEG,
      east: east + CORRIDOR_BUFFER_DEG,
      north: north + CORRIDOR_BUFFER_DEG,
    });
  }
  return boxes;
}

/** Every [lng, lat] in an arbitrarily nested GeoJSON coordinate array. */
function flatten(coords: unknown): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(coords);
  return out;
}

/** One corridor's parcels, paged. */
async function fetchCorridor(box: RiverBox): Promise<Parcel[]> {
  const out: Parcel[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      geometry: `${box.west},${box.south},${box.east},${box.north}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields:
        'GlobalID,Unit_Nm,Mang_Name,Mang_Type,Des_Tp,Pub_Access,GIS_Acres,State_Nm',
      returnGeometry: 'true',
      geometryPrecision: String(GEOMETRY_PRECISION),
      resultOffset: String(page * PAGE),
      resultRecordCount: String(PAGE),
      f: 'geojson',
    });

    const res = await fetch(`${PADUS}?${params}`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      throw new Error(`PAD-US ${box.slug} page ${page} → ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }>;
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
      error?: { code?: number; message?: string };
    };

    // ArcGIS reports failure with HTTP 200 and an `error` object — the same
    // trap that made import-nwps-gauges.ts report a total outage as a
    // successful no-op. Never treat a missing `features` as "none here".
    if (data.error) {
      throw new Error(
        `PAD-US ${box.slug} page ${page} → error ${data.error.code ?? '?'}: ${data.error.message ?? 'unknown'}`,
      );
    }

    for (const f of data.features ?? []) {
      const parcel = toParcel(f);
      if (parcel) out.push(parcel);
    }

    const more = data.exceededTransferLimit ?? data.properties?.exceededTransferLimit ?? false;
    if (!more) break;
  }

  return out;
}

function toParcel(feature: {
  properties?: Record<string, unknown>;
  geometry?: unknown;
}): Parcel | null {
  const p = feature.properties ?? {};
  // ── GlobalID, and emphatically NOT Source_PAID ───────────────────────────
  // Source_PAID reads like the parcel id and is the source DATASET id. On one
  // Current River corridor, 256 features carried 18 distinct values of it —
  // 184 of them the bare string 'OZAR' — and 48 nulls. Keying on it collapsed
  // the corridor to 60 parcels and reported success. The dry run's
  // fetched-vs-unique counts are what surfaced that, which is the reason they
  // are printed.
  const padusId = typeof p.GlobalID === 'string' ? p.GlobalID.trim() : '';
  // No stable id means no way to re-import without duplicating it, and this
  // source is republished. Dropped rather than given a synthetic key.
  if (!padusId) return null;

  const geom = feature.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (!geom?.type || !geom.coordinates) return null;

  // Normalise to MultiPolygon so the column type is one thing. PAD-US mixes
  // both, and a Polygon is a MultiPolygon of one.
  let coordinates: number[][][][];
  if (geom.type === 'MultiPolygon') {
    coordinates = geom.coordinates as number[][][][];
  } else if (geom.type === 'Polygon') {
    coordinates = [geom.coordinates as number[][][]];
  } else {
    return null;
  }
  if (coordinates.length === 0) return null;

  const acres = Number(p.GIS_Acres);
  return {
    padusId,
    unitName: typeof p.Unit_Nm === 'string' && p.Unit_Nm ? p.Unit_Nm : 'Unnamed parcel',
    managerName: typeof p.Mang_Name === 'string' ? p.Mang_Name : null,
    managerType: typeof p.Mang_Type === 'string' ? p.Mang_Type : null,
    designation: typeof p.Des_Tp === 'string' ? p.Des_Tp : null,
    publicAccess: typeof p.Pub_Access === 'string' ? p.Pub_Access : null,
    gisAcres: Number.isFinite(acres) ? Math.round(acres) : null,
    stateCode: typeof p.State_Nm === 'string' ? p.State_Nm : null,
    geometry: { type: 'MultiPolygon', coordinates },
  };
}

function vertexCount(parcel: Parcel): number {
  return parcel.geometry.coordinates.reduce(
    (sum, poly) => sum + poly.reduce((s, ring) => s + ring.length, 0),
    0,
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  const riverArg = process.argv.find((a) => a.startsWith('--river='));
  const only = riverArg ? riverArg.slice('--river='.length) : null;

  console.log(`PAD-US public land import — ${apply ? 'APPLY' : 'DRY RUN'}`);
  const db = getSupabase(apply);

  const corridors = await loadCorridors(db, only);
  if (corridors.length === 0) {
    throw new Error(only ? `No active river with slug '${only}'.` : 'No active rivers with geometry.');
  }
  console.log(`  corridors          : ${corridors.length}`);

  // Deduped by PAD-US id: one national forest touches many corridors, and it is
  // one parcel however many rivers run through it.
  const parcels = new Map<string, Parcel>();
  let fetched = 0;
  let shared = 0;

  for (const box of corridors) {
    const found = await fetchCorridor(box);
    fetched += found.length;
    for (const parcel of found) {
      if (parcels.has(parcel.padusId)) shared++;
      else parcels.set(parcel.padusId, parcel);
    }
    process.stdout.write(`\r    ${box.slug}: ${found.length} parcels (${parcels.size} unique so far)   `);
  }
  process.stdout.write('\n');

  // A run that read nothing has not found an America with no public land. It
  // has failed to reach the service, and reporting that as success is the
  // failure mode import-nwps-gauges.ts shipped with for its whole life.
  if (parcels.size === 0) {
    throw new Error('PAD-US returned no parcels for any corridor — treat as an upstream failure.');
  }

  const list = [...parcels.values()];
  const vertices = list.reduce((s, p) => s + vertexCount(p), 0);
  const byAccess = list.reduce<Record<string, number>>((m, p) => {
    const k = p.publicAccess ?? 'null';
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

  console.log(`  parcels fetched    : ${fetched}`);
  console.log(`  unique parcels     : ${parcels.size}`);
  // Should be ~0 for a single corridor. A large number here on one river means
  // the id is not per-parcel — see the note in toParcel.
  console.log(`  shared across rivers: ${shared}`);
  console.log(`  total vertices     : ${vertices.toLocaleString()}`);
  console.log(`  by public access   : ${JSON.stringify(byAccess)}`);

  if (!apply) {
    console.log('\n  Would write, largest first:');
    for (const p of [...list].sort((a, b) => (b.gisAcres ?? 0) - (a.gisAcres ?? 0)).slice(0, 8)) {
      console.log(
        `    ${p.unitName} — ${p.managerName ?? '?'}/${p.designation ?? '?'} access=${p.publicAccess ?? '?'} ${(p.gisAcres ?? 0).toLocaleString()} ac`,
      );
    }
    console.log('\nDry run complete — re-run with --apply to write.');
    return;
  }

  let written = 0;
  const CHUNK = 25;
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).map((p) => ({
      padus_id: p.padusId,
      unit_name: p.unitName,
      manager_name: p.managerName,
      manager_type: p.managerType,
      designation: p.designation,
      public_access: p.publicAccess,
      gis_acres: p.gisAcres,
      state_code: p.stateCode,
      // PostGIS accepts GeoJSON on a geometry column through PostgREST.
      geometry: p.geometry,
      last_seen_at: new Date().toISOString(),
    }));
    const { error } = await db.from('public_lands').upsert(rows, { onConflict: 'padus_id' });
    if (error) throw new Error(`upsert at ${i} failed: ${error.message}`);
    written += rows.length;
    process.stdout.write(`\r    written ${written}/${list.length}`);
  }
  process.stdout.write('\n');
  console.log(`  stored ${written} parcels.`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
