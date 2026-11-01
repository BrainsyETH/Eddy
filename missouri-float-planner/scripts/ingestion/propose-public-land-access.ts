#!/usr/bin/env npx tsx
/**
 * Missing public-land access finder (one-off, November 2026).
 *
 * WRITES NOTHING TO THE DATABASE, EVER. For each river it lists places where:
 *   1. an open National Forest route (MVUM road or trail) ends within 300 m of
 *      the river line, or crosses it. 300 m, not less: known access pins sit up
 *      to ~300 m off the NHD river line (Turner Mill North 317 m, Greer Crossing
 *      159 m), and Forest Service access roads end at a lot, not the water;
 *   2. that end, and the riverbank beside it, are on a public PAD-US parcel;
 *   3. Eddy has no access point (approved or not) within 1 km along the river.
 *
 * Each candidate is a place for a person to look at, not an access point. A
 * route reaching public ground says nothing about a launch being legal, safe or
 * usable — the 00209 rule, ownership is not permission. Promotion is by hand:
 * a reviewed candidate goes into a dossier, and import-dossier-access-points.ts
 * lands it `approved = false`.
 *
 * Tiers:
 *   strong    open to passenger or high-clearance vehicles, the end and the bank
 *             are public, and at least 90% of the route's last 500 m is too.
 *   possible  anything else that passed 1–3: ATV/motorcycle routes, a route that
 *             leaves public ground before the river, or a river crossing.
 *
 * Recall check: the same rules are run without step 3 and reported against the
 * river's existing access points that sit on public land AND have an open MVUM
 * route within 300 m — how many of the known road-served public accesses the
 * method would have found on its own. Float camps reached only by water, and
 * MDC accesses on county roads (not in MVUM), are outside what it can find.
 *
 * Run from missouri-float-planner/ (Node 20):
 *   npx tsx scripts/ingestion/propose-public-land-access.ts
 *   npx tsx scripts/ingestion/propose-public-land-access.ts --river=big-piney --out=/tmp/x
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  booleanPointInPolygon, length, lineIntersect, lineSliceAlong, lineString, point, pointToLineDistance, pointToPolygonDistance,
} from '@turf/turf';
import type { LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { getScriptClient } from '../lib/db';
import {
  type LngLat, PADUS_NON_FEE, agencyFromPadus, csvCell, mapLink, metersBetween,
} from './access-enrichment-2026-11';
import { type ArcFeature, envelopeFilter, featureUrl, fetchAll, selectAll } from './arcgis-fetch';
import { type VehicleClass, VEHICLE_RANK, alongRiverKm, dedupeAlongRiver, gapAround, routeEnds, vehicleClass } from './public-land-access-2026-11';

const DEFAULT_RIVERS = ['eleven-point', 'big-piney'];
const MVUM = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer';
const VEHICLE_FIELDS = 'passengervehicle,highclearancevehicle,atv,motorcycle,otherwheeled_ohv,other_ohv_lt50inches';
const LAYERS = {
  road: { url: `${MVUM}/1`, fields: `objectid,id,name,surfacetype,seasonal,districtname,${VEHICLE_FIELDS}` },
  trail: { url: `${MVUM}/2`, fields: `objectid,id,name,seasonal,districtname,${VEHICLE_FIELDS}` },
} as const;

const REACH_M = 300;
const KNOWN_KM = 1.0;
const TAIL_M = 500;
const NEAR_PARCEL_M = 30;
const RECALL_KM = 0.5;

interface Parcel { id: string; unit_name: string; manager_name: string | null; designation: string | null; public_access: string | null; gis_acres: number | null; geom: Polygon | MultiPolygon }

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  for (const a of process.argv.slice(2)) if (!['--river', '--out'].includes(a.split('=')[0])) throw new Error(`Unknown argument ${a}`);
  const slugs = (argValue('river') ?? DEFAULT_RIVERS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const outDir = argValue('out') ?? join(__dirname, 'agency-gis', '2026-11-oneoff');
  const db = getScriptClient({ script: 'propose-public-land-access', write: false });

  const rows: Record<string, unknown>[] = [];
  const features: unknown[] = [];
  const summary: Record<string, unknown>[] = [];

  for (const slug of slugs) {
    const { data: river, error } = await db.from('rivers').select('id, slug, name, geom').eq('slug', slug).single();
    if (error || !river?.geom) throw new Error(`river ${slug}: ${error?.message ?? 'no geometry'}`);
    const geom = river.geom as LineString | MultiLineString;
    const riverKm = length({ type: 'Feature', properties: {}, geometry: geom }, { units: 'kilometers' });
    const coords = (geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates).flat();
    const box = {
      xmin: Math.min(...coords.map((c) => c[0])) - 0.01, ymin: Math.min(...coords.map((c) => c[1])) - 0.01,
      xmax: Math.max(...coords.map((c) => c[0])) + 0.01, ymax: Math.max(...coords.map((c) => c[1])) + 0.01,
    };

    const aps = await selectAll<{ id: string; name: string; approved: boolean | null; location_orig: { coordinates?: number[] } | null }>(
      (a, b) => db.from('access_points').select('id, name, approved, location_orig').eq('river_id', river.id).order('id').range(a, b));
    const existing = aps.flatMap((ap) => {
      const c = ap.location_orig?.coordinates;
      if (!c) return [];
      return [{ name: ap.name, approved: !!ap.approved, at: [c[0], c[1]] as LngLat, km: alongRiverKm(geom, [c[0], c[1]]).km }];
    });

    // PAD-US for the whole corridor in one viewport query, lightly simplified (≈2 m).
    const { data: lands, error: landsError } = await db.rpc('public_lands_in_bbox', {
      p_west: box.xmin, p_south: box.ymin, p_east: box.xmax, p_north: box.ymax, p_tolerance: 0.00002, p_limit: 1000,
    });
    if (landsError) throw landsError;
    const landRows = (lands as Array<Omit<Parcel, 'geom'> & { geojson: string; total: number }>) ?? [];
    // `total` counts bbox overlaps before parcels that only touch the edge are
    // dropped, so fewer rows than `total` is normal. The cap is the 1000-row limit.
    if (landRows.length && Number(landRows[0].total) > 1000) throw new Error(`${slug}: PAD-US query capped at 1000 of ${landRows[0].total}`);
    const parcels: Parcel[] = landRows
      .filter((l) => !PADUS_NON_FEE.has((l.designation ?? '').toUpperCase()))
      .map((l) => ({ ...l, geom: JSON.parse(l.geojson) as Polygon | MultiPolygon }));
    const stateOf = (p: LngLat) => (p[1] < 36.5 && !(p[0] > -90.4 && p[1] > 36.0) ? 'AR' : 'MO');
    /** The public (non-private, known-manager) fee parcel at a point, smallest first. */
    const publicAt = (p: LngLat, nearM = 0): Parcel | null => parcels
      .filter((l) => agencyFromPadus(l.manager_name, stateOf(p)).agency && agencyFromPadus(l.manager_name, stateOf(p)).agency !== 'Private')
      .filter((l) => booleanPointInPolygon(point(p), l.geom) || (nearM > 0 && pointToPolygonDistance(point(p), l.geom, { units: 'meters' }) <= nearM))
      .sort((a, b) => Number(a.gis_acres ?? Infinity) - Number(b.gis_acres ?? Infinity))[0] ?? null;

    const routes: { kind: 'road' | 'trail'; f: ArcFeature }[] = [];
    for (const kind of ['road', 'trail'] as const) {
      const { features: fs } = await fetchAll(LAYERS[kind], envelopeFilter(box));
      for (const f of fs) if (f.geometry?.paths?.length && vehicleClass(f.attributes) !== 'none') routes.push({ kind, f });
    }

    type Cand = { km: number; offsetM: number; vehicle: VehicleClass; at: LngLat; onRiver: LngLat; how: 'route end' | 'crosses river';
      kind: 'road' | 'trail'; f: ArcFeature; land: Parcel | null; bank: Parcel | null; tailPct: number };
    const raw: Cand[] = [];
    for (const { kind, f } of routes) {
      const vehicle = vehicleClass(f.attributes);
      const paths = f.geometry!.paths!.filter((p) => p.length > 1);
      const consider = (at: LngLat, how: Cand['how'], path: number[][]) => {
        const a = alongRiverKm(geom, at);
        if (a.offsetM > REACH_M) return;
        // The last TAIL_M of the route leading to `at`, sampled every 50 m.
        const oriented = metersBetween([path[0][0], path[0][1]], at) < metersBetween([path[path.length - 1][0], path[path.length - 1][1]], at) ? path : [...path].reverse();
        const line = lineString(oriented);
        const total = length(line, { units: 'meters' });
        const tail = lineSliceAlong(line, 0, Math.min(TAIL_M, total), { units: 'meters' });
        const tailLen = length(tail, { units: 'meters' });
        const samples: LngLat[] = [];
        for (let m = 0; m <= tailLen; m += 50) {
          const s = lineSliceAlong(tail, 0, Math.max(m, 0.01), { units: 'meters' }).geometry.coordinates;
          samples.push(s[s.length - 1] as LngLat);
        }
        const tailPct = samples.length ? samples.filter((s) => publicAt(s)).length / samples.length : 0;
        raw.push({ km: a.km, offsetM: a.offsetM, vehicle, at, onRiver: a.onRiver, how, kind, f,
          land: publicAt(at, NEAR_PARCEL_M), bank: publicAt(a.onRiver, NEAR_PARCEL_M), tailPct });
      };
      for (const path of paths) {
        for (const end of routeEnds([path])) consider(end, 'route end', path);
        for (const x of lineIntersect(lineString(path), { type: 'Feature', properties: {}, geometry: geom }).features) {
          consider(x.geometry.coordinates as LngLat, 'crosses river', path);
        }
      }
    }
    const publicRaw = raw.filter((c) => c.land || c.bank);

    // Recall against existing access points that are on public land.
    const routeNear = (p: LngLat) => routes.some(({ f }) => f.geometry!.paths!.some((path) => path.length > 1 &&
      pointToLineDistance(point(p), lineString(path), { units: 'meters' }) <= REACH_M));
    const knownPublic = existing.filter((e) => publicAt(e.at, NEAR_PARCEL_M) && routeNear(e.at));
    const found = knownPublic.filter((e) => publicRaw.some((c) => Math.abs(c.km - e.km) <= RECALL_KM));

    const fresh = dedupeAlongRiver(publicRaw.filter((c) => gapAround(c.km, existing.map((e) => e.km), riverKm).nearestKm >= KNOWN_KM));
    for (const c of fresh) {
      const g = gapAround(c.km, existing.map((e) => e.km), riverKm);
      const up = existing.find((e) => e.km === g.upKm);
      const down = existing.find((e) => e.km === g.downKm);
      const strong = VEHICLE_RANK[c.vehicle] >= VEHICLE_RANK.high_clearance && c.how === 'route end' && c.land && c.bank && c.tailPct >= 0.9;
      const a = c.f.attributes;
      const parcel = c.land ?? c.bank!;
      const row = {
        tier: strong ? 'strong' : 'possible',
        river: slug,
        river_km: c.km.toFixed(2),
        gap_km: g.gapKm.toFixed(1),
        nearest_access_km: g.nearestKm.toFixed(1),
        upstream_access: up?.name ?? '(river start)',
        downstream_access: down?.name ?? '(river end)',
        how: c.how,
        layer: c.kind,
        route: `${a.id ?? ''} ${a.name ?? ''}`.trim(),
        vehicle: c.vehicle,
        seasonal: a.seasonal ?? '',
        surface: a.surfacetype ?? '',
        distance_to_water_m: Math.round(c.offsetM),
        land_unit: parcel.unit_name,
        land_manager: parcel.manager_name ?? '',
        land_access_code: parcel.public_access ?? 'UK',
        end_public: c.land ? 'yes' : 'no',
        bank_public: c.bank ? 'yes' : 'no',
        last_500m_public_pct: Math.round(c.tailPct * 100),
        district: a.districtname ?? '',
        map: mapLink(c.at),
        mvum_url: featureUrl(LAYERS[c.kind].url, a.objectid),
      };
      rows.push(row);
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c.at }, properties: row });
    }
    summary.push({
      river: slug, river_km: Math.round(riverKm), existing_access_points: existing.length,
      open_routes: routes.length, reaching_public_bank: publicRaw.length,
      candidates: fresh.length, strong: fresh.filter((c) => rows.find((r) => r.river === slug && r.river_km === c.km.toFixed(2))?.tier === 'strong').length,
      recall: `${found.length}/${knownPublic.length} known road-served public accesses rediscovered`,
    });
  }

  rows.sort((a, b) => String(a.tier).localeCompare(String(b.tier)) * -1 || Number(b.gap_km) - Number(a.gap_km));
  mkdirSync(outDir, { recursive: true });
  const cols = Object.keys(rows[0] ?? { tier: '' });
  writeFileSync(join(outDir, 'finder.csv'), `${[cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')}\n`);
  writeFileSync(join(outDir, 'finder.geojson'), `${JSON.stringify({ type: 'FeatureCollection', features }, null, 1)}\n`);
  console.table(summary);
  console.log(`Wrote ${rows.length} candidates to ${join(outDir, 'finder.csv')} (+ finder.geojson). Nothing was written to the database.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
