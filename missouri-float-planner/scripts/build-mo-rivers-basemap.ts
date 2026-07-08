#!/usr/bin/env npx tsx
/**
 * Build src/data/mo-rivers-basemap.json — the static "named MO rivers + lakes"
 * basemap that renders under the curated rivers on /missouri-surface-water.
 *
 * Source: USGS National Map NHD HR HUC8 shapefiles (the same source as
 * scripts/import-nhd-rivers-from-tnm.ts). For each HUC8 in HUC8_LIST we
 * download NHD_H_<huc>_HU8_Shape.zip, then:
 *   - extract NHDFlowline features with FCode ∈ {46006 perennial, 55800
 *     connector} and a non-empty gnis_name
 *   - extract NHDWaterbody features whose gnis_name matches one of the
 *     major MO reservoirs / lakes
 *
 * Across HUC8s, flowlines sharing a gnis_name are dissolved into the longest
 * connected component (the main channel) — same trick the per-river script
 * uses. We then drop any merged channel under MIN_LENGTH_MI to keep the
 * basemap from getting cluttered with small named tributaries.
 *
 * Output: src/data/mo-rivers-basemap.json — a small bundle of GeoJSON
 * FeatureCollections (rivers + lakes) projected at runtime by MOMap.tsx.
 *
 * Run:
 *   npm install   (once, brings in shpjs + @turf/turf)
 *   npx tsx scripts/build-mo-rivers-basemap.ts
 */

// shpjs's CJS bundle references browser-only `self`. Polyfill before the
// dynamic import below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).self = globalThis;

import { createWriteStream, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { simplify, lineString as turfLine, length as turfLength } from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Polygon, MultiPolygon } from 'geojson';

// HUC8s that cover MO's named-river network at the scale of geology.com's
// reference MO river map. Add more here to extend basemap coverage.
const HUC8_LIST: string[] = [
  // SE Missouri / Ozarks
  '11010008', // Current + Jacks Fork
  '11010011', // Eleven Point
  '11010007', // Black (lower)
  '11010006', // North Fork (White)
  '11010003', // Bull Shoals area / White
  '11010002', // James
  '11010001', // Upper White / Table Rock
  // Meramec basin
  '07140102', // Meramec + Huzzah + Courtois
  '07140103', // Bourbeuse + Big River
  // Osage / Gasconade
  '10290110', // Niangua + Truman tail
  '10290111', // Lower Osage / Lake of the Ozarks
  '10290109', // Sac + Stockton Lake
  '10290108', // Pomme de Terre
  '10290107', // Upper Sac
  '10290201', // Upper Gasconade
  '10290202', // Big Piney
  '10290203', // Lower Gasconade
  // Missouri River (along MO's northern border + St. Louis confluence)
  '10300101', // Lower Missouri – Crooked
  '10300102', // Lamine + Missouri R reach
  '10300103', // Lower Missouri (Boonville)
  '10300104', // Bonne Femme
  '10300200', // Lower Missouri (Mississippi confluence)
  // Mississippi River (eastern border)
  '07140101', // Cahokia–Joachim (St. Louis)
  '07140105', // Big Muddy (south of St. Louis)
  '07140107', // Cape Girardeau – Mississippi
  // St. Francis
  '08020203', // St. Francis (lower)
  '08020202', // St. Francis (upper)
  // Salt / Mark Twain Lake
  '07110002', // North + Middle Fork Salt + Mark Twain Lake
  '07110007', // Lower Salt
  // Cuivre
  '07110008', // Cuivre
  // Spring / SW corner
  '11070207', // Spring River + Center Creek
  // Osage headwaters (Marais des Cygnes, Sac, Cedar)
  '10290101', // Marais des Cygnes
  '10290102', // Marais des Cygnes (lower) / Osage main
  '10290103', // Osage main
  '10290104', // Osage / Cedar
  '10290105', // Sac (mid)
  '10290106', // Sac (lower) / Stockton Lake
  // Grand River basin (NW MO)
  '10280101', // Upper Grand
  '10280102', // Thompson R
  '10280103', // Lower Grand
  // Chariton basin (Locust Cr, Mussel Fork)
  '10280201', // Upper Chariton
  '10280202', // Mid Chariton
  '10280203', // Lower Chariton (Thomas Hill Reservoir)
  // Salt R (more coverage)
  '07110001', // Headwaters
  '07110005', // Middle Salt
  // Lower Platte
  '10240005',
  // ── Arkansas — Ozark + Ouachita float country (the two-state extent) ──
  '11010005', // Buffalo River
  '11010004', // Middle White / Buffalo confluence
  '11010012', // Spring River (AR) + Strawberry
  '11010013', // Eleven Point (AR) / Spring lower
  '11010014', // Little Red
  '08020301', // Cache / lower White
  '11110201', // Frog / Mulberry (Ozark NF)
  '11110203', // Illinois Bayou / Big Piney (AR)
  '11110207', // Petit Jean / Fourche LaFave
  '08040101', // Upper Ouachita
  '08040102', // Lake Ouachita reach
  '08040202', // Caddo / Little Missouri
  '08040203', // Saline (AR)
];

// Major reservoirs / lakes shown on the reference map. We match by gnis_name
// against the NHDWaterbody features in the HUC8 shapefiles.
// NHD GNIS names (verified by probing NHDWaterbody features in the cached
// HUC8 zips — note "Harry S Truman" has no period in NHD).
const LAKE_NAMES = new Set<string>([
  'Lake of the Ozarks',
  'Harry S Truman Reservoir',
  'Stockton Lake',
  'Stockton Reservoir',
  'Table Rock Lake',
  'Bull Shoals Lake',
  'Mark Twain Lake',
  'Thomas Hill Reservoir',
  'Thomas Hill Lake',
  'Pomme de Terre Lake',
  'Clearwater Lake',
  'Wappapello Lake',
  'Lake Wappapello',
  'Smithville Lake',
  'Long Branch Lake',
  // Arkansas reservoirs
  'Beaver Lake',
  'Norfork Lake',
  'Lake Norfork',
  'Greers Ferry Lake',
  'Lake Ouachita',
  'DeGray Lake',
  'Millwood Lake',
  'Lake Dardanelle',
]);

const FCODE_PERENNIAL = new Set([46006, 55800]);
const SIMPLIFY_TOLERANCE_DEG = 0.0014; // ~150 m — coarser vertices shrink the bundle
const MIN_LENGTH_MI = 10; // drop small named tributaries (the map ships to phones)
// See import-nhd-rivers-from-tnm.ts — same digitization-gap problem.
const CHAIN_BRIDGE_TOLERANCE_DEG = 0.012;
const TNM_BASE = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHD/HU8/Shape';

function pointKey(c: number[]): string {
  return c[0].toFixed(7) + ',' + c[1].toFixed(7);
}

function distDeg(a: number[], b: number[]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

async function ensureZip(huc: string, cacheDir: string): Promise<string> {
  const path = join(cacheDir, `${huc}.zip`);
  if (existsSync(path)) return path;
  const url = `${TNM_BASE}/NHD_H_${huc}_HU8_Shape.zip`;
  console.error(`  ↓ Downloading HUC ${huc}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.body) throw new Error('No body');
  // @ts-expect-error Node 18+ ReadableStream → web stream interop
  await pipeline(res.body, createWriteStream(path));
  return path;
}

interface FlowFeat {
  geometry: { type: string; coordinates: number[][] };
  properties: { gnis_name?: string; fcode?: number };
}
interface BodyFeat {
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: { gnis_name?: string; fcode?: number; ftype?: number; areasqkm?: number };
}

function dissolveLongest(segs: FlowFeat[]): number[][] {
  const segCoords = segs
    .map((f) => f.geometry?.coordinates)
    .filter((c): c is number[][] => Array.isArray(c) && c.length >= 2)
    .map((c) => c.map((p) => [p[0], p[1]] as [number, number]));
  if (!segCoords.length) return [];

  const epIdx = new Map<string, number[]>();
  for (let i = 0; i < segCoords.length; i++) {
    const sk = pointKey(segCoords[i][0]);
    const ek = pointKey(segCoords[i][segCoords[i].length - 1]);
    (epIdx.get(sk) ?? epIdx.set(sk, []).get(sk)!).push(i);
    (epIdx.get(ek) ?? epIdx.set(ek, []).get(ek)!).push(i);
  }
  const parent = Array.from({ length: segCoords.length }, (_, i) => i);
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  epIdx.forEach((list) => { for (let i = 1; i < list.length; i++) union(list[0], list[i]); });
  const comps = new Map<number, number[]>();
  for (let i = 0; i < segCoords.length; i++) {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r)!.push(i);
  }

  type Chain = { coords: number[][]; lengthKm: number };
  const chains: Chain[] = [];
  comps.forEach((idxs) => {
    const sub = idxs.map((i: number) => segCoords[i]);
    const coords = chainComponent(sub);
    if (coords.length < 2) return;
    const lengthKm = turfLength(turfLine(coords), { units: 'kilometers' });
    chains.push({ coords, lengthKm });
  });
  if (!chains.length) return [];

  // Greedy bridge of NHD HR digitization gaps — see comment in
  // scripts/import-nhd-rivers-from-tnm.ts for the rationale.
  chains.sort((a, b) => b.lengthKm - a.lengthKm);
  const used = new Set<number>([0]);
  let workCoords = chains[0].coords.slice();
  let progressed = true;
  while (progressed) {
    progressed = false;
    const head = workCoords[0];
    const tail = workCoords[workCoords.length - 1];
    type BridgeMode = 'prepend' | 'prepend-rev' | 'append' | 'append-rev';
    let bestIdx = -1;
    let bestDist = CHAIN_BRIDGE_TOLERANCE_DEG;
    let bestMode: BridgeMode = 'append';
    for (let i = 1; i < chains.length; i++) {
      if (used.has(i)) continue;
      const c = chains[i].coords;
      const cs = c[0], ce = c[c.length - 1];
      const cands: Array<{ d: number; mode: BridgeMode }> = [
        { d: distDeg(tail, cs), mode: 'append' },
        { d: distDeg(tail, ce), mode: 'append-rev' },
        { d: distDeg(head, ce), mode: 'prepend' },
        { d: distDeg(head, cs), mode: 'prepend-rev' },
      ];
      for (const ca of cands) {
        if (ca.d < bestDist) { bestDist = ca.d; bestIdx = i; bestMode = ca.mode; }
      }
    }
    if (bestIdx >= 0) {
      const c = chains[bestIdx].coords;
      switch (bestMode) {
        case 'append':      workCoords = workCoords.concat(c); break;
        case 'append-rev':  workCoords = workCoords.concat(c.slice().reverse()); break;
        case 'prepend':     workCoords = c.concat(workCoords); break;
        case 'prepend-rev': workCoords = c.slice().reverse().concat(workCoords); break;
      }
      used.add(bestIdx);
      progressed = true;
    }
  }
  return workCoords;
}

function chainComponent(segs: number[][][]): number[][] {
  const startMap = new Map<string, number[]>();
  const degree = new Map<string, number>();
  for (let i = 0; i < segs.length; i++) {
    const sk = pointKey(segs[i][0]);
    const ek = pointKey(segs[i][segs[i].length - 1]);
    degree.set(sk, (degree.get(sk) ?? 0) + 1);
    degree.set(ek, (degree.get(ek) ?? 0) + 1);
    if (!startMap.has(sk)) startMap.set(sk, []);
    startMap.get(sk)!.push(i);
  }
  let head = -1;
  degree.forEach((deg, pt) => {
    if (head < 0 && deg === 1 && startMap.has(pt)) head = startMap.get(pt)![0];
  });
  if (head < 0) head = 0;
  const merged: number[][] = [];
  const visited = new Set<number>();
  let cur: number = head;
  while (cur >= 0 && !visited.has(cur)) {
    visited.add(cur);
    const seg = segs[cur];
    if (!merged.length) merged.push(...seg);
    else merged.push(...seg.slice(1));
    const ek = pointKey(seg[seg.length - 1]);
    const candidates = (startMap.get(ek) ?? []).filter((n) => !visited.has(n));
    cur = candidates[0] ?? -1;
  }
  for (let i = 0; i < segs.length; i++) {
    if (visited.has(i)) continue;
    const seg = segs[i];
    if (merged.length && pointKey(merged[merged.length - 1]) === pointKey(seg[0])) {
      merged.push(...seg.slice(1));
      visited.add(i);
    }
  }
  return merged;
}

function roundCoords(coords: number[][]): number[][] {
  return coords.map((c) => [Number(c[0].toFixed(5)), Number(c[1].toFixed(5))]);
}

async function main() {
  const cacheDir = join(process.cwd(), 'tmp', 'nhd');
  mkdirSync(cacheDir, { recursive: true });

  const shpModule = (await import('shpjs')) as unknown as {
    default: (b: ArrayBuffer) => Promise<Array<{ fileName: string; features: (FlowFeat | BodyFeat)[] }>>;
  };
  const shp = shpModule.default;

  // Accumulate all perennial named flowline segments by GNIS name.
  const flowsByName = new Map<string, FlowFeat[]>();
  // And lake polygons by GNIS name (one polygon per lake — pick the largest
  // when multiple HUC8s touch the same lake).
  const lakeByName = new Map<string, BodyFeat>();

  console.error(`NHD basemap build · ${HUC8_LIST.length} HUC8s`);
  console.error('='.repeat(60));

  for (const huc of HUC8_LIST) {
    let zipPath: string;
    try { zipPath = await ensureZip(huc, cacheDir); }
    catch (e) { console.error(`  ${huc}: download failed: ${e instanceof Error ? e.message : e}`); continue; }
    const buf = readFileSync(zipPath);
    let layers: Array<{ fileName: string; features: (FlowFeat | BodyFeat)[] }>;
    try { layers = await shp(buf.buffer); }
    catch (e) { console.error(`  ${huc}: shp parse failed: ${e instanceof Error ? e.message : e}`); continue; }

    const flow = layers.find((l) => l.fileName === 'Shape/NHDFlowline');
    const body = layers.find((l) => l.fileName === 'Shape/NHDWaterbody');

    let namedFlows = 0;
    if (flow) {
      for (const f of flow.features as FlowFeat[]) {
        const name = f.properties.gnis_name;
        const fcode = f.properties.fcode;
        if (!name || fcode == null) continue;
        if (!FCODE_PERENNIAL.has(fcode)) continue;
        if (!flowsByName.has(name)) flowsByName.set(name, []);
        flowsByName.get(name)!.push(f);
        namedFlows++;
      }
    }
    let lakes = 0;
    if (body) {
      for (const b of body.features as BodyFeat[]) {
        const name = b.properties.gnis_name;
        if (!name || !LAKE_NAMES.has(name)) continue;
        const prev = lakeByName.get(name);
        if (!prev || (b.properties.areasqkm ?? 0) > (prev.properties.areasqkm ?? 0)) {
          lakeByName.set(name, b);
          lakes++;
        }
      }
    }
    console.error(`  ${huc}: ${namedFlows} named perennial segs · ${lakes} matching lakes`);
  }

  // Dissolve flowlines per GNIS name and emit features.
  const riverFeatures: Feature<LineString>[] = [];
  const skipped: string[] = [];
  for (const [name, segs] of Array.from(flowsByName.entries()).sort()) {
    const merged = dissolveLongest(segs);
    if (merged.length < 2) continue;
    const ls = turfLine(merged);
    const lengthMi = turfLength(ls, { units: 'miles' });
    if (lengthMi < MIN_LENGTH_MI) { skipped.push(`${name} (${lengthMi.toFixed(1)} mi)`); continue; }
    const simplified = simplify(ls, { tolerance: SIMPLIFY_TOLERANCE_DEG, highQuality: true }) as Feature<LineString>;
    riverFeatures.push({
      type: 'Feature',
      properties: {
        name,
        length_mi: Number(lengthMi.toFixed(1)),
        seg_count: segs.length,
      },
      geometry: {
        type: 'LineString',
        coordinates: roundCoords(simplified.geometry.coordinates),
      },
    });
  }

  // Emit lake polygons (using the largest occurrence per name).
  const lakeFeatures: Feature<Polygon | MultiPolygon>[] = [];
  for (const [name, b] of Array.from(lakeByName.entries()).sort()) {
    const geomType = b.geometry.type === 'MultiPolygon' ? 'MultiPolygon' : 'Polygon';
    const simplifiedAny = simplify(
      { type: 'Feature', properties: {}, geometry: { type: geomType, coordinates: b.geometry.coordinates } as unknown as Polygon | MultiPolygon },
      { tolerance: SIMPLIFY_TOLERANCE_DEG, highQuality: true },
    ) as Feature<Polygon | MultiPolygon>;
    lakeFeatures.push({
      type: 'Feature',
      properties: {
        name,
        area_sqkm: Number((b.properties.areasqkm ?? 0).toFixed(1)),
      },
      geometry: simplifiedAny.geometry,
    });
  }

  const rivers: FeatureCollection<LineString> = { type: 'FeatureCollection', features: riverFeatures };
  const lakes: FeatureCollection<Polygon | MultiPolygon> = { type: 'FeatureCollection', features: lakeFeatures };

  const out = {
    rivers,
    lakes,
    generated_at: new Date().toISOString(),
    source: {
      flowlines: 'USGS NHD HR HUC8 shapefiles · perennial FCodes 46006/55800 · named only',
      waterbodies: 'USGS NHD HR HUC8 shapefiles · gnis_name match against curated MO reservoir list',
      huc8_count: HUC8_LIST.length,
    },
  };

  const outPath = 'src/data/mo-rivers-basemap.json';
  writeFileSync(outPath, JSON.stringify(out));
  const bytes = readFileSync(outPath).length;

  console.error('');
  console.error(`Wrote ${riverFeatures.length} rivers, ${lakeFeatures.length} lakes (${(bytes / 1024).toFixed(0)} KB) → ${outPath}`);
  console.error('');
  console.error('Rivers:');
  for (const f of riverFeatures.slice(0, 60)) {
    console.error(`  ${(f.properties as { name: string }).name.padEnd(28)} ${(f.properties as { length_mi: number }).length_mi.toFixed(1)} mi`);
  }
  if (riverFeatures.length > 60) console.error(`  …and ${riverFeatures.length - 60} more`);
  console.error('');
  console.error(`Skipped (under ${MIN_LENGTH_MI} mi): ${skipped.length}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
