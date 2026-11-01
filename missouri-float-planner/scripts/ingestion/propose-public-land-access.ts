#!/usr/bin/env npx tsx
/**
 * Missing river-access finder, v2 (November 2026). WRITES NOTHING TO THE DATABASE.
 *
 * For each river it lists places where a drivable road ends at the water, or
 * crosses it, and Eddy has no trusted access point nearby. Each is a place for
 * a person to check, not an access point.
 *
 * ── What v2 changed, and why (Long Hollow, Eleven Point, 2026-11-01) ───────────
 * v1 read only Forest Service (MVUM) roads and measured against Eddy's river
 * line. It ranked "Boom Hole" first, a 1.5-mile high-clearance Forest Service
 * track to a river feature. The access floaters actually use, Long Hollow, is a
 * COUNTY road ending 48 m from the channel, which v1 could not see. So v2:
 *   - reads county and local roads (Census TIGER; MTFCC S1500 marks a 4WD
 *     trail) alongside Forest Service roads and trails (MVUM vehicle and
 *     maintenance class);
 *   - measures distance to water against the high-resolution USGS channel
 *     (NHD), not Eddy's line, which has one vertex per ~400 m; Eddy's line is
 *     used only for position along the river;
 *   - takes a road END only where nothing continues from it (segments split at
 *     every junction), AND a road's closest approach where it comes down to
 *     the water and turns back: Long Hollow is County Road 416 looping to the
 *     river, so its nearest point is mid-road, not an end;
 *   - counts as "known" only APPROVED access points whose pin is within 300 m
 *     of the real channel, and reports the rest as suspect records (an
 *     unapproved "Hwy 160 Bridge" pinned 17 km from its bridge distorted v1's
 *     gaps);
 *   - ranks county road ends on public bank above high-clearance Forest
 *     Service tracks, and closer ends above farther ones;
 *   - names each candidate by the nearest tributary mouth ("Long Hollow Creek
 *     mouth") with a search phrase, because a quick search confirmed Long
 *     Hollow in minutes.
 *
 * ── v3 recalibration (same day) ──────────────────────────────────────────────
 * The owner reviewed v2's five Eleven Point tier-A spots against the map:
 * none was an access. All five were Census roads on National Forest land with
 * no MVUM route within 300 m: two "Forest Rd"s missing from the MVUM, two S1740
 * private service roads, one unnamed road. On National Forest land only MVUM
 * routes and county/state roads are open to vehicles (36 CFR 212.51), but the
 * MVUM omits county roads (Cane Bluff's CR 405 is "Forest Rd 3189" in Census)
 * and site roads (East Gate), so dropping off-MVUM roads lost real accesses.
 * v3 instead stops reading S1740 as drivable, gives tier A only to county/state
 * roads (TIGER RTTYP C/S/U/I) and passenger-grade MVUM roads, and flags a
 * forest road end that is off the MVUM.
 *
 * Tiers: A = a county/state road, or an MVUM road open to passenger vehicles,
 * reaches public riverbank. B = it reaches the water but the land is not shown
 * public (often a county right-of-way; check legality), or it is a
 * high-clearance Forest Service track, or a local/unnamed road of unknown
 * status. C = a road crosses the river (bridge or ford).
 *
 * Run from missouri-float-planner/ (Node 20):
 *   npx tsx scripts/ingestion/propose-public-land-access.ts --river=eleven-point,big-piney
 *   npx tsx scripts/ingestion/propose-public-land-access.ts --river=eleven-point --holdout=long-hollow
 * --holdout treats the named access points as unknown, to test that the finder
 * finds them. Output goes to scripts/ingestion/finder-2026-11/ (or --out=).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { booleanPointInPolygon, length, lineIntersect, lineString, point, pointToPolygonDistance } from '@turf/turf';
import type { LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { getScriptClient } from '../lib/db';
import { type LngLat, PADUS_NON_FEE, agencyFromPadus, csvCell, mapLink } from './access-enrichment-2026-11';
import { type ArcFeature, arcgis, envelope, envelopeFilter, featureUrl, fetchAll, selectAll } from './arcgis-fetch';
import { type RoadKind, type RoadSource, alongRiverKm, approachPoints, channelIndex, deadEnds, gapAround, nearestMouth, offMvumNote, rankRoadEnd, tigerClass, tigerRoadKind, vehicleClass } from './public-land-access-2026-11';

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer';
const MVUM = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer';
const NHD_FLOWLINE = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6';
const USFS_OWNERSHIP = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0';
const SOURCES = {
  tigerLocal: { url: `${TIGER}/8`, fields: 'OBJECTID,NAME,MTFCC,RTTYP' },
  tigerSecondary: { url: `${TIGER}/6`, fields: 'OBJECTID,NAME,MTFCC,RTTYP' },
  mvumRoads: { url: `${MVUM}/1`, fields: 'objectid,id,name,operationalmaintlevel,seasonal,passengervehicle,highclearancevehicle,atv,motorcycle' },
  mvumTrails: { url: `${MVUM}/2`, fields: 'objectid,id,name,seasonal,passengervehicle,highclearancevehicle,atv,motorcycle' },
  nhd: { url: NHD_FLOWLINE, fields: 'objectid,gnis_name' },
};

const REACH_M = 200; // a road end this close to the real channel reaches the water
const TRUSTED_PIN_M = 300; // a known access pinned farther than this from the channel is suspect
const KNOWN_KM = 1.0;
const NEAR_PARCEL_M = 30;

interface Road { source: RoadSource; kind: RoadKind; name: string; fourWd: boolean; maintLevel: number | null; paths: number[][][]; url: string }

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  for (const a of process.argv.slice(2)) if (!['--river', '--out', '--holdout'].includes(a.split('=')[0])) throw new Error(`Unknown argument ${a}`);
  const slugs = (argValue('river') ?? 'eleven-point,big-piney').split(',').map((s) => s.trim()).filter(Boolean);
  const holdout = new Set((argValue('holdout') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const outDir = argValue('out') ?? join(__dirname, 'finder-2026-11');
  const db = getScriptClient({ script: 'propose-public-land-access', write: false });

  const rows: Record<string, unknown>[] = [];
  const features: unknown[] = [];
  const summary: Record<string, unknown>[] = [];
  const suspects: Record<string, unknown>[] = [];
  const holdoutReport: string[] = [];

  for (const slug of slugs) {
    const { data: river, error } = await db.from('rivers').select('id, slug, name, geom').eq('slug', slug).single();
    if (error || !river?.geom) throw new Error(`river ${slug}: ${error?.message ?? 'no geometry'}`);
    const eddyLine = river.geom as LineString | MultiLineString;
    const riverKm = length({ type: 'Feature', properties: {}, geometry: eddyLine }, { units: 'kilometers' });
    const coords = (eddyLine.type === 'LineString' ? [eddyLine.coordinates] : eddyLine.coordinates).flat();
    const box = {
      xmin: Math.min(...coords.map((c) => c[0])) - 0.01, ymin: Math.min(...coords.map((c) => c[1])) - 0.01,
      xmax: Math.max(...coords.map((c) => c[0])) + 0.01, ymax: Math.max(...coords.map((c) => c[1])) + 0.01,
    };
    console.log(`\n${slug}: fetching the channel, roads and land…`);

    // ── The real channel (NHD), plus named tributary mouths ──────────────────
    const nhd = await fetchAll(SOURCES.nhd, { ...envelopeFilter(box), where: 'gnis_name IS NOT NULL' });
    const channel = nhd.features.filter((f) => String(f.attributes.gnis_name) === river.name).flatMap((f) => f.geometry?.paths ?? []).filter((p) => p.length > 1);
    if (!channel.length) throw new Error(`${slug}: no NHD flowline named "${river.name}" in the river's box; check the name`);
    const toWater = channelIndex(channel);
    const mouths = nhd.features.filter((f) => String(f.attributes.gnis_name) !== river.name)
      .flatMap((f) => (f.geometry?.paths ?? []).filter((p) => p.length > 1).map((p) => ({ name: String(f.attributes.gnis_name), at: p[p.length - 1] as LngLat })))
      .filter((m) => toWater(m.at) <= 60);

    // ── Known accesses: approved and pinned near the real channel ────────────
    const aps = await selectAll<{ slug: string; name: string; approved: boolean | null; is_float_endpoint: boolean; location_orig: { coordinates?: number[] } | null }>(
      (a, b) => db.from('access_points').select('slug, name, approved, is_float_endpoint, location_orig').eq('river_id', river.id).order('slug').range(a, b));
    const located = aps.flatMap((ap) => {
      const c = ap.location_orig?.coordinates;
      if (!c) return [];
      const at: LngLat = [c[0], c[1]];
      return [{ ...ap, at, km: alongRiverKm(eddyLine, at).km, offChannelM: Math.round(toWater(at)) }];
    });
    for (const k of located) {
      if (k.offChannelM > TRUSTED_PIN_M) suspects.push({ river: slug, slug: k.slug, name: k.name, approved: !!k.approved, pin_to_channel_m: Number.isFinite(k.offChannelM) ? k.offChannelM : '>500', map: mapLink(k.at) });
    }
    const trusted = located.filter((k) => k.approved && k.offChannelM <= TRUSTED_PIN_M);
    const known = trusted.filter((k) => !holdout.has(k.slug));

    // ── Public land (PAD-US, refined by USFS ownership on national forests) ──
    const { data: lands, error: landsError } = await db.rpc('public_lands_in_bbox', {
      p_west: box.xmin, p_south: box.ymin, p_east: box.xmax, p_north: box.ymax, p_tolerance: 0.00002, p_limit: 1000,
    });
    if (landsError) throw landsError;
    const landRows = (lands as Array<{ unit_name: string; manager_name: string | null; designation: string | null; gis_acres: number | null; geojson: string; total: number }>) ?? [];
    if (landRows.length && Number(landRows[0].total) > 1000) throw new Error(`${slug}: PAD-US query capped`);
    const stateOf = (p: LngLat) => (p[1] < 36.5 && !(p[0] > -90.4 && p[1] > 36.0) ? 'AR' : 'MO');
    const parcels = landRows.filter((l) => !PADUS_NON_FEE.has((l.designation ?? '').toUpperCase()))
      .map((l) => ({ ...l, geom: JSON.parse(l.geojson) as Polygon | MultiPolygon }));
    const publicAt = async (p: LngLat): Promise<string | null> => {
      const hit = parcels
        .filter((l) => { const a = agencyFromPadus(l.manager_name, stateOf(p)).agency; return a && a !== 'Private'; })
        .filter((l) => booleanPointInPolygon(point(p), l.geom) || pointToPolygonDistance(point(p), l.geom, { units: 'meters' }) <= NEAR_PARCEL_M)
        .sort((a, b) => Number(a.gis_acres ?? Infinity) - Number(b.gis_acres ?? Infinity))[0];
      if (!hit) return null;
      if (hit.manager_name === 'USFS') {
        // PAD-US blurs inholdings; the Forest Service's own ownership decides.
        const r = await arcgis(USFS_OWNERSHIP, { ...envelopeFilter(envelope(p, NEAR_PARCEL_M)), outFields: 'ownerclassification', returnGeometry: 'false' });
        const classes = ((r.features as ArcFeature[]) ?? []).map((f) => String(f.attributes.ownerclassification));
        if (!classes.includes('USDA FOREST SERVICE')) return null;
      }
      return `${hit.unit_name} (${hit.manager_name})`;
    };

    // ── Roads: county/local (TIGER) and Forest Service (MVUM) ───────────────
    const roads: Road[] = [];
    for (const layer of [SOURCES.tigerLocal, SOURCES.tigerSecondary]) {
      for (const f of (await fetchAll(layer, envelopeFilter(box))).features) {
        const cls = tigerClass(f.attributes.MTFCC);
        if (!cls.drivable || !f.geometry?.paths?.length) continue;
        roads.push({ source: 'county', kind: tigerRoadKind(f.attributes), name: String(f.attributes.NAME ?? 'unnamed road'), fourWd: cls.fourWd, maintLevel: null, paths: f.geometry.paths, url: featureUrl(layer.url, f.attributes.OBJECTID) });
      }
    }
    for (const layer of [SOURCES.mvumRoads, SOURCES.mvumTrails]) {
      for (const f of (await fetchAll(layer, envelopeFilter(box))).features) {
        if (vehicleClass(f.attributes) === 'none' || !f.geometry?.paths?.length) continue;
        const maint = parseInt(String(f.attributes.operationalmaintlevel ?? ''), 10);
        roads.push({ source: 'usfs', kind: 'mvum', name: `FS ${f.attributes.id} ${f.attributes.name ?? ''}`.trim(), fourWd: vehicleClass(f.attributes) !== 'passenger' && vehicleClass(f.attributes) !== 'high_clearance', maintLevel: Number.isFinite(maint) ? maint : null, paths: f.geometry.paths, url: featureUrl(layer.url, f.attributes.objectid) });
      }
    }
    // A Census road that is the same road as an MVUM route is open as that route.
    const toMvum = channelIndex(roads.filter((r) => r.source === 'usfs').flatMap((r) => r.paths), 0.002);
    const pathsOf = (src: RoadSource) => roads.filter((r) => r.source === src).flatMap((r) => r.paths);
    const ends = new Map<string, LngLat>();
    for (const src of ['county', 'usfs'] as const) {
      for (const e of deadEnds(pathsOf(src), 8, pathsOf(src === 'county' ? 'usfs' : 'county'))) ends.set(`${src}|${e.join()}`, e);
    }

    // ── Candidates ────────────────────────────────────────────────────────────
    type Cand = { kind: 'road end' | 'road loops to river' | 'crosses river'; road: Road; at: LngLat; toWaterM: number; km: number; tier: string; score: number; notes: string[]; land: string | null };
    const raw: Cand[] = [];
    for (const road of roads) {
      for (const path of road.paths.filter((p) => p.length > 1)) {
        const pathEnds = ([path[0], path[path.length - 1]] as LngLat[]).filter((e) => ends.has(`${road.source}|${e.join()}`));
        // A road that comes down to the water and turns back (Long Hollow) has
        // its nearest point mid-road; take it unless a dead end is right there.
        const loops = approachPoints(path, toWater, REACH_M)
          // On the channel itself it is a bridge or ford, which the crossing test reports.
          .filter((a) => toWater(a) > 15)
          .filter((a) => !pathEnds.some((e) => Math.hypot((e[0] - a[0]) * 89_000, (e[1] - a[1]) * 111_000) < 30));
        for (const [end, kind] of [...pathEnds.map((e) => [e, 'road end'] as const), ...loops.map((a) => [a, 'road loops to river'] as const)]) {
          const d = toWater(end);
          if (d > REACH_M) continue;
          const nearestOnChannel = channel.flat().reduce((best, v) => {
            const dd = Math.hypot((v[0] - end[0]) * 89_000, (v[1] - end[1]) * 111_000);
            return dd < best.d ? { v: v as LngLat, d: dd } : best;
          }, { v: end, d: Infinity }).v;
          const [landEnd, landBank] = await Promise.all([publicAt(end), publicAt(nearestOnChannel)]);
          const r = rankRoadEnd({ kind: road.kind, toWaterM: d, fourWd: road.fourWd, maintLevel: road.maintLevel, publicEnd: !!landEnd, publicBank: !!landBank });
          // Judged by the land the road ENDS on: a private resort road beside forest bank is not a forest road.
          const offMvum = offMvumNote({ kind: road.kind, endOnNationalForest: !!landEnd?.endsWith('(USFS)'), onMvum: toMvum(end) <= 30 });
          raw.push({ kind, road, at: end, toWaterM: Math.round(d), km: alongRiverKm(eddyLine, end).km, tier: r.tier, score: r.score, notes: offMvum ? [offMvum, ...r.notes] : r.notes, land: landEnd ?? landBank });
        }
        for (const x of lineIntersect(lineString(path), { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: channel } }).features) {
          const at = x.geometry.coordinates as LngLat;
          const land = await publicAt(at);
          raw.push({ kind: 'crosses river', road, at, toWaterM: 0, km: alongRiverKm(eddyLine, at).km, tier: 'C', score: 40, notes: ['bridge or ford: check bank access and parking'], land });
        }
      }
    }

    // Recall: trusted, road-served launches the raw candidates would have found.
    const roadServed = trusted.filter((k) => k.is_float_endpoint && raw.some((c) => Math.abs(c.km - k.km) <= 0.5));
    const launches = trusted.filter((k) => k.is_float_endpoint);
    const missed = launches.filter((k) => !roadServed.includes(k));
    if (missed.length) console.log(`  ${slug}: launches with no road candidate within 0.5 km: ${missed.map((k) => k.slug).join(', ')}`);
    for (const h of holdout) {
      const k = trusted.find((t) => t.slug === h);
      if (!k) { holdoutReport.push(`${slug}/${h}: not a trusted access on this river`); continue; }
      const hits = raw.filter((c) => Math.abs(c.km - k.km) <= 0.5).sort((a, b) => b.score - a.score);
      holdoutReport.push(hits.length
        ? `${slug}/${h}: FOUND as tier ${hits[0].tier} via ${hits[0].road.name} (${hits[0].toWaterM} m to water, ${Math.round(Math.hypot((hits[0].at[0] - k.at[0]) * 89_000, (hits[0].at[1] - k.at[1]) * 111_000))} m from the access pin)`
        : `${slug}/${h}: NOT FOUND`);
    }

    // Unknown stretches only; one per 300 m, best first.
    const fresh = raw
      .filter((c) => gapAround(c.km, known.map((k) => k.km), riverKm).nearestKm >= KNOWN_KM)
      .sort((a, b) => ({ A: 0, B: 1, C: 2 }[a.tier as 'A'] - { A: 0, B: 1, C: 2 }[b.tier as 'A']) || b.score - a.score);
    const kept: Cand[] = [];
    for (const c of fresh) if (!kept.some((k) => Math.abs(k.km - c.km) < 0.3)) kept.push(c);

    for (const c of kept) {
      const g = gapAround(c.km, known.map((k) => k.km), riverKm);
      const up = known.find((k) => k.km === g.upKm);
      const down = known.find((k) => k.km === g.downKm);
      const place = nearestMouth(c.at, mouths);
      const row = {
        tier: c.tier,
        score: c.score,
        river: slug,
        place: place ?? '',
        kind: c.kind,
        road: c.road.name,
        road_source: c.road.source === 'county' ? 'Census roads' : 'Forest Service (MVUM)',
        road_kind: c.road.kind,
        four_wd: c.road.fourWd ? 'yes' : '',
        usfs_maint_level: c.road.maintLevel ?? '',
        to_water_m: c.toWaterM,
        land: c.land ?? 'not shown public',
        between: `${up?.name ?? '(river start)'} → ${down?.name ?? '(river end)'}`,
        gap_km: g.gapKm.toFixed(1),
        notes: c.notes.join('; '),
        search: `"${(place ?? c.road.name).replace(/ mouth$/, '')}" ${river.name} access`,
        lat: c.at[1].toFixed(6),
        lon: c.at[0].toFixed(6),
        map: mapLink(c.at),
        road_record: c.road.url,
      };
      rows.push(row);
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c.at }, properties: row });
    }
    summary.push({
      river: slug, roads: roads.length, road_ends_at_water: raw.filter((c) => c.kind !== 'crosses river').length,
      crossings: raw.filter((c) => c.kind === 'crosses river').length,
      candidates: kept.length, tier_A: kept.filter((c) => c.tier === 'A').length,
      recall: `${roadServed.length}/${launches.length} trusted launches have a road candidate within 0.5 km`,
      suspect_records: located.filter((k) => k.offChannelM > TRUSTED_PIN_M).length,
    });
  }

  mkdirSync(outDir, { recursive: true });
  const write = (file: string, list: Record<string, unknown>[]) => {
    const cols = Object.keys(list[0] ?? { none: '' });
    writeFileSync(join(outDir, file), `${[cols.join(','), ...list.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')}\n`);
  };
  write('candidates.csv', rows);
  write('suspect-records.csv', suspects);
  writeFileSync(join(outDir, 'candidates.geojson'), `${JSON.stringify({ type: 'FeatureCollection', features }, null, 1)}\n`);
  console.table(summary);
  for (const h of holdoutReport) console.log(`holdout ${h}`);
  console.log(`Wrote ${rows.length} candidates and ${suspects.length} suspect records to ${outDir}. Nothing was written to the database.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
