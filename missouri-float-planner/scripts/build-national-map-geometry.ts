#!/usr/bin/env npx tsx
/**
 * Build the national River Map's geometry: state shapes, major lakes and the
 * river network, pre-projected into the composite frame
 * (src/lib/national-map/projection.ts) and written as static assets under
 * public/river-map/geometry/.
 *
 * ── Sources (all public domain, no attribution obligation) ─────────────────
 *   * States: us-atlas states-10m (Census cartographic boundaries 1:10M),
 *     already a dependency.
 *   * Rivers: USGS National Hydrography small-scale "streaml010g" — the
 *     1:1,000,000 national streams, all 50 states, with Strahler order and
 *     From/To node topology. Lines are digitized DOWNSTREAM (checked on the
 *     Mississippi: each segment's first vertex is upstream of its last), which
 *     is what the map's downstream traces rely on.
 *   * Lakes: the same series' "wtrbdyp010g" waterbodies (Lake / Reservoir).
 *   Staged at https://prd-tnm.s3.amazonaws.com/StagedProducts/Small-scale/data/Hydrography/
 *   The version (TNM product id) is recorded in the output's `source` block.
 *
 * Why the 1:1M series and not 3DHP / NHDPlus HR: the national view needs a
 * nationally consistent, generalized network, and this is the one USGS
 * product that is exactly that — one download, one scale, every state. Finer
 * regional geometry is a later, region-by-region job (see the plan).
 *
 * ── Output ─────────────────────────────────────────────────────────────────
 *   base.v2.json    states, lakes, and rivers of Strahler ≥ 5 (Hawaii ≥ 2,
 *                   whose streams are short) — the first-screen network.
 *                   Each base line carries `d`: the base line it flows into
 *                   and how far along it (From/To node topology), so the
 *                   wall's "Follow the river" can walk a real network.
 *   detail.v2.json  Strahler 3–4 (Hawaii 1), fetched when the camera zooms in.
 * Coordinates are integers in 1/QUANT frame pixels, delta-encoded per line.
 *
 * Usage:
 *   npx tsx scripts/build-national-map-geometry.ts [--source-dir DIR]
 * Downloads the two TNM archives (~250 MB) into DIR (default: the OS temp dir)
 * when absent. No database, no credentials.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feature } from 'topojson-client';
import topology from 'us-atlas/states-10m.json';
import {
  componentOf,
  projectComponent,
  type Bounds,
  type MapComponent,
} from '../src/lib/national-map/projection';
import { NATIONAL_STATE_FIPS } from '../src/lib/national-map/scope';
import { GEOMETRY_VERSION, type GeometryFile, type GeoLine, type GeoPolygon } from '../src/lib/national-map/geometry';

const TNM = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Small-scale/data/Hydrography';
const STREAMS = { archive: 'streaml010g.shp_nt00885.tar.gz', base: 'streaml010g', product: 'nt00885' };
const WATER = { archive: 'wtrbdyp010g.shp_nt00886.tar.gz', base: 'wtrbdyp010g', product: 'nt00886' };

const OUT_DIR = 'public/river-map/geometry';

/** Simplification tolerances, in landscape-frame pixels (~960 wide). */
const TOL_STATES = 0.12;
const TOL_BASE = 0.18;
const TOL_DETAIL = 0.05;
const QUANT_BASE = 20;
const QUANT_DETAIL = 50;
const MIN_LAKE_SQMI_BASE = 25;

// ── Sources ────────────────────────────────────────────────────────────────

function sourceDir(): string {
  const i = process.argv.indexOf('--source-dir');
  const dir = i > 0 ? process.argv[i + 1] : join(tmpdir(), 'eddy-national-map-sources');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureSource(dir: string, src: { archive: string; base: string }): string {
  const shp = join(dir, `${src.base}.shp`);
  if (existsSync(shp)) return join(dir, src.base);
  const archive = join(dir, src.archive);
  if (!existsSync(archive)) {
    console.log(`Downloading ${src.archive}…`);
    execFileSync('curl', ['-sSfL', `${TNM}/${src.archive}`, '-o', archive], { stdio: 'inherit' });
  }
  execFileSync('tar', ['-xzf', archive, '-C', dir], { stdio: 'inherit' });
  return join(dir, src.base);
}

// ── Minimal shapefile + dBASE readers ──────────────────────────────────────
// Enough for PolyLine/Polygon (and their Z variants, whose Z block is skipped).
// A dependency for this would be the only one in the repo that reads binary
// GIS formats, for a script that runs once per geometry release.

interface DbfField {
  name: string;
  type: string;
  offset: number;
  length: number;
}

function readDbf(path: string, wanted: string[]): Array<Record<string, string | number>> {
  const buf = readFileSync(path);
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields: DbfField[] = [];
  let offset = 1; // deletion flag
  for (let p = 32; buf[p] !== 0x0d; p += 32) {
    const name = buf.toString('latin1', p, p + 11).replace(/\0.*$/, '');
    const type = String.fromCharCode(buf[p + 11]);
    const length = buf[p + 16];
    fields.push({ name, type, offset, length });
    offset += length;
  }
  const pick = fields.filter((f) => wanted.includes(f.name));
  const out: Array<Record<string, string | number>> = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = headerLen + i * recordLen;
    const rec: Record<string, string | number> = {};
    for (const f of pick) {
      const raw = buf.toString('latin1', base + f.offset, base + f.offset + f.length).trim();
      rec[f.name] = f.type === 'N' || f.type === 'F' ? Number(raw) : raw;
    }
    out[i] = rec;
  }
  return out;
}

type Parts = Array<Array<[number, number]>>;

function readShapes(basePath: string, indices: number[]): Map<number, Parts> {
  const shx = readFileSync(`${basePath}.shx`);
  const fd = openSync(`${basePath}.shp`, 'r');
  const out = new Map<number, Parts>();
  try {
    for (const i of indices) {
      const offset = shx.readInt32BE(100 + i * 8) * 2;
      const length = shx.readInt32BE(100 + i * 8 + 4) * 2;
      const rec = Buffer.alloc(length);
      readSync(fd, rec, 0, length, offset + 8);
      const type = rec.readInt32LE(0);
      if (type === 0) continue;
      if (![3, 5, 13, 15, 23, 25].includes(type)) throw new Error(`shape type ${type} unsupported`);
      const numParts = rec.readInt32LE(36);
      const numPoints = rec.readInt32LE(40);
      const parts: number[] = [];
      for (let p = 0; p < numParts; p++) parts.push(rec.readInt32LE(44 + p * 4));
      const pts = 44 + numParts * 4;
      const result: Parts = [];
      for (let p = 0; p < numParts; p++) {
        const start = parts[p];
        const end = p + 1 < numParts ? parts[p + 1] : numPoints;
        const line: Array<[number, number]> = [];
        for (let k = start; k < end; k++) {
          line.push([rec.readDoubleLE(pts + k * 16), rec.readDoubleLE(pts + k * 16 + 8)]);
        }
        result.push(line);
      }
      out.set(i, result);
    }
  } finally {
    closeSync(fd);
  }
  return out;
}

// ── Geometry helpers ───────────────────────────────────────────────────────

function simplify(points: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = tol2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let d: number;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function encode(points: Array<[number, number]>, quant: number): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of points) {
    const qx = Math.round(x * quant);
    const qy = Math.round(y * quant);
    if (out.length && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  return out;
}

function extend(b: Bounds, x: number, y: number) {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

const emptyBounds = (): Bounds => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

// ── States ─────────────────────────────────────────────────────────────────

function buildStates(bounds: Record<MapComponent, Bounds>): GeoPolygon[] {
  const fc = feature(
    topology as unknown as Parameters<typeof feature>[0],
    (topology as unknown as { objects: { states: unknown } }).objects.states as never,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  const out: GeoPolygon[] = [];
  for (const f of fc.features) {
    const code = NATIONAL_STATE_FIPS[String(f.id).padStart(2, '0')];
    if (!code) continue; // territories
    const comp: MapComponent = code === 'AK' ? 'ak' : code === 'HI' ? 'hi' : 'l48';
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings: number[][] = [];
    for (const poly of polys) {
      for (const ring of poly) {
        const projected = ring.map(([lng, lat]) => projectComponent(comp, lng, lat));
        for (const [x, y] of projected) extend(bounds[comp], x, y);
        const simple = simplify(projected, TOL_STATES);
        if (simple.length >= 4) rings.push(encode(simple, QUANT_BASE));
      }
    }
    out.push({ c: code, k: comp, r: rings });
  }
  return out.sort((a, b) => a.c!.localeCompare(b.c!));
}

// ── Lakes ──────────────────────────────────────────────────────────────────

function buildLakes(dir: string): GeoPolygon[] {
  const base = ensureSource(dir, WATER);
  const recs = readDbf(`${base}.dbf`, ['Feature', 'Area_sq_mi', 'Name']);
  const idx: number[] = [];
  recs.forEach((r, i) => {
    if ((r.Feature === 'Lake' || r.Feature === 'Reservoir') && Number(r.Area_sq_mi) >= MIN_LAKE_SQMI_BASE) idx.push(i);
  });
  const shapes = readShapes(base, idx);
  const out: GeoPolygon[] = [];
  for (const i of idx) {
    const parts = shapes.get(i);
    if (!parts?.length) continue;
    const [lng0, lat0] = parts[0][0];
    const comp = componentOf(lng0, lat0);
    const rings = parts
      .map((ring) => simplify(ring.map(([lng, lat]) => projectComponent(comp, lng, lat)), TOL_STATES))
      .filter((r) => r.length >= 4)
      .map((r) => encode(r, QUANT_BASE));
    if (rings.length) out.push({ k: comp, r: rings });
  }
  return out;
}

// ── Rivers ─────────────────────────────────────────────────────────────────

interface Segment {
  i: number;
  order: number;
  from: number;
  to: number;
  name: string;
  comp: MapComponent;
  coords: Array<[number, number]>;
}

const RIVER_FEATURES = new Set(['Stream', 'Stream Intermittent', 'Artificial Path']);

/**
 * Chain segments into long downstream lines: a segment joins the next when it
 * is that segment's ONLY same-order upstream and the next is its only
 * same-order downstream. Fewer, longer lines mean fewer vertices duplicated at
 * joints and a downstream trace that travels a whole reach, not a fragment.
 */
function chain(segs: Segment[]): Segment[][] {
  const byFrom = new Map<number, Segment[]>();
  const byTo = new Map<number, Segment[]>();
  for (const s of segs) {
    (byFrom.get(s.from) ?? byFrom.set(s.from, []).get(s.from)!).push(s);
    (byTo.get(s.to) ?? byTo.set(s.to, []).get(s.to)!).push(s);
  }
  const next = new Map<Segment, Segment>();
  const hasPrev = new Set<Segment>();
  for (const s of segs) {
    const down = (byFrom.get(s.to) ?? []).filter((d) => d.order === s.order && d.comp === s.comp);
    if (down.length !== 1) continue;
    const ups = (byTo.get(down[0].from) ?? []).filter((u) => u.order === s.order);
    if (ups.length !== 1) continue;
    next.set(s, down[0]);
    hasPrev.add(down[0]);
  }
  const used = new Set<Segment>();
  const chains: Segment[][] = [];
  const walk = (start: Segment) => {
    const c: Segment[] = [];
    let cur: Segment | undefined = start;
    while (cur && !used.has(cur)) {
      used.add(cur);
      c.push(cur);
      cur = next.get(cur);
    }
    if (c.length) chains.push(c);
  };
  for (const s of segs) if (!hasPrev.has(s)) walk(s);
  for (const s of segs) if (!used.has(s)) walk(s); // loops (braids) start anywhere
  return chains;
}

function buildRivers(
  dir: string,
  names: string[],
): { base: GeoLine[]; detail: GeoLine[]; counts: Record<string, number> } {
  const src = ensureSource(dir, STREAMS);
  const recs = readDbf(`${src}.dbf`, ['Feature', 'Strahler', 'From_node', 'To_node', 'Name', 'State']);
  const idx: number[] = [];
  recs.forEach((r, i) => {
    const order = Number(r.Strahler);
    if (!RIVER_FEATURES.has(String(r.Feature))) return;
    const hi = String(r.State).startsWith('HI');
    if (order >= 3 || (hi && order >= 1)) idx.push(i);
  });
  console.log(`Reading ${idx.length} stream segments…`);
  const shapes = readShapes(src, idx);
  const nameIndex = new Map<string, number>(names.map((n, i) => [n, i]));
  const segs: Segment[] = [];
  for (const i of idx) {
    const parts = shapes.get(i);
    if (!parts?.length) continue;
    const coords = parts.flat();
    if (coords.length < 2) continue;
    const r = recs[i];
    segs.push({
      i,
      order: Number(r.Strahler),
      from: Number(r.From_node),
      to: Number(r.To_node),
      name: String(r.Name ?? ''),
      comp: componentOf(coords[0][0], coords[0][1]),
      coords,
    });
  }
  const isBase = (s: Segment) => (s.comp === 'hi' ? s.order >= 2 : s.order >= 5);
  const base: GeoLine[] = [];
  // Topology for base lines: where each segment starts along its line, and
  // the node each line ends at. Resolved to `d` once the lines are sorted.
  const baseEnd = new Map<GeoLine, number>();
  // A node can start several lines (a distributary such as Old River leaves
  // the Mississippi): every candidate is kept and chosen below.
  const nodeAt = new Map<number, Array<{ line: GeoLine; along: number; total: number; name: string }>>();
  const lineName = new Map<GeoLine, string>();
  const detail: GeoLine[] = [];
  const counts: Record<string, number> = {};
  for (const c of chain(segs)) {
    const first = c[0];
    const projected: Array<[number, number]> = [];
    const starts: Array<[number, number]> = []; // [node, length along the line where it starts]
    let run = 0;
    for (const s of c) {
      starts.push([s.from, run]);
      for (const [lng, lat] of s.coords) {
        const pt = projectComponent(first.comp, lng, lat);
        const prev = projected[projected.length - 1];
        if (prev) run += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
        projected.push(pt);
      }
    }
    const inBase = isBase(first);
    const simple = simplify(projected, inBase ? TOL_BASE : TOL_DETAIL);
    if (simple.length < 2) continue;
    const named = c.find((s) => s.name)?.name ?? '';
    let n = -1;
    if (named && inBase) {
      n = nameIndex.get(named) ?? -1;
      if (n < 0) {
        n = names.push(named) - 1;
        nameIndex.set(named, n);
      }
    }
    const line: GeoLine = { k: first.comp, o: first.order, n, p: encode(simple, inBase ? QUANT_BASE : QUANT_DETAIL) };
    (inBase ? base : detail).push(line);
    if (inBase) {
      baseEnd.set(line, c[c.length - 1].to);
      lineName.set(line, named);
      for (const [node, along] of starts) (nodeAt.get(node) ?? nodeAt.set(node, []).get(node)!).push({ line, along, total: run, name: named });
    }
    const key = `${first.comp}:${first.order}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  // Draw order: small first, so major rivers paint over their tributaries.
  base.sort((a, b) => a.o - b.o);
  detail.sort((a, b) => a.o - b.o);
  // Downstream links, by final index. A tributary's last node is where some
  // segment of the line it joins begins; the fraction is how far along.
  //
  // At 1:1M a few main stems are interrupted by segments the map does not
  // draw: the Missouri passes Garrison Dam as a "Canal", and the Yukon and
  // Tanana carry mis-coded Strahler orders for one braid. So when a line's
  // end node starts no base line, walk the RAW network (every feature, every
  // order) a few hops downstream until one does.
  const outs = new Map<number, Array<{ to: number; order: number; name: string }>>();
  for (const r of recs) {
    const from = Number(r.From_node);
    if (!Number.isFinite(from)) continue;
    (outs.get(from) ?? outs.set(from, []).get(from)!).push({ to: Number(r.To_node), order: Number(r.Strahler), name: String(r.Name ?? '') });
  }
  const indexOf = new Map(base.map((l, i) => [l, i]));
  let linked = 0;
  let bridged = 0;
  for (const line of base) {
    const name = lineName.get(line) ?? '';
    // Prefer the river continuing under the same name, then the larger
    // channel, then the longer line: the main stem, not the distributary.
    const pick = (node: number) =>
      (nodeAt.get(node) ?? [])
        .filter((c) => c.line !== line && c.line.k === line.k)
        .sort((a, b) => Number(!!name && b.name === name) - Number(!!name && a.name === name) || b.line.o - a.line.o || b.total - a.total)[0];
    let node = baseEnd.get(line)!;
    let at = pick(node);
    for (let hop = 0; !at && hop < 12; hop++) {
      const next = (outs.get(node) ?? []).sort(
        (a, b) => Number(!!name && b.name === name) - Number(!!name && a.name === name) || b.order - a.order,
      )[0];
      if (!next) break;
      node = next.to;
      at = pick(node);
      if (at) bridged++;
    }
    if (!at) {
      if (process.env.DEBUG_LINKS && line.o >= 6) console.log('unlinked', line.k, line.o, name, baseEnd.get(line));
      continue;
    }
    const frac = at.total > 0 ? Math.round((at.along / at.total) * 1000) / 1000 : 0;
    line.d = [indexOf.get(at.line)!, frac];
    linked++;
  }
  counts.linked = linked;
  counts.bridged = bridged;
  return { base, detail, counts };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const dir = sourceDir();
  const bounds: Record<MapComponent, Bounds> = { l48: emptyBounds(), ak: emptyBounds(), hi: emptyBounds() };
  const states = buildStates(bounds);
  const lakes = buildLakes(dir);
  const names: string[] = [];
  const rivers = buildRivers(dir, names);
  const round = (b: Bounds): Bounds => ({
    minX: Math.floor(b.minX),
    minY: Math.floor(b.minY),
    maxX: Math.ceil(b.maxX),
    maxY: Math.ceil(b.maxY),
  });
  const components = { l48: round(bounds.l48), ak: round(bounds.ak), hi: round(bounds.hi) };
  const source = {
    states: 'us-atlas states-10m (US Census cartographic boundary, 1:10M)',
    rivers: `USGS small-scale hydrography streaml010g (${STREAMS.product}), 1:1,000,000`,
    lakes: `USGS small-scale hydrography wtrbdyp010g (${WATER.product}), Lake/Reservoir ≥ ${MIN_LAKE_SQMI_BASE} sq mi`,
    builtAt: new Date().toISOString().slice(0, 10),
  };
  const baseFile: GeometryFile = {
    v: GEOMETRY_VERSION,
    quant: QUANT_BASE,
    source,
    components,
    states,
    lakes,
    rivers: rivers.base,
    names,
  };
  const detailFile: GeometryFile = {
    v: GEOMETRY_VERSION,
    quant: QUANT_DETAIL,
    source,
    components,
    states: [],
    lakes: [],
    rivers: rivers.detail,
    names: [],
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const baseJson = JSON.stringify(baseFile);
  const detailJson = JSON.stringify(detailFile);
  writeFileSync(join(OUT_DIR, `base.v${GEOMETRY_VERSION}.json`), baseJson);
  writeFileSync(join(OUT_DIR, `detail.v${GEOMETRY_VERSION}.json`), detailJson);
  console.log({
    states: states.length,
    lakes: lakes.length,
    baseRivers: rivers.base.length,
    detailRivers: rivers.detail.length,
    baseBytes: baseJson.length,
    detailBytes: detailJson.length,
    components,
    counts: rivers.counts,
  });
}

main();
