/**
 * Pure rules for the read-only missing-public-access finder (November 2026).
 * The CLI is propose-public-land-access.ts. Nothing here decides that a spot
 * is a legal or usable launch: a candidate is a place for a person to look,
 * where an open National Forest route reaches public riverbank that Eddy has
 * no access point near. Ownership is not permission (00209 header).
 */
import { nearestPointOnLine, point } from '@turf/turf';
import type { LineString, MultiLineString } from 'geojson';
import type { LngLat } from './access-enrichment-2026-11';

export type VehicleClass = 'passenger' | 'high_clearance' | 'atv' | 'motorcycle' | 'none';

/** The most capable vehicle an MVUM route is open to. Field values are 'open' or null. */
export function vehicleClass(attrs: Record<string, unknown>): VehicleClass {
  const open = (k: string) => String(attrs[k] ?? '').toLowerCase() === 'open';
  if (open('passengervehicle')) return 'passenger';
  if (open('highclearancevehicle')) return 'high_clearance';
  if (open('atv') || open('otherwheeled_ohv') || open('other_ohv_lt50inches')) return 'atv';
  if (open('motorcycle')) return 'motorcycle';
  return 'none';
}

export const VEHICLE_RANK: Record<VehicleClass, number> = { passenger: 4, high_clearance: 3, atv: 2, motorcycle: 1, none: 0 };

/** The two ends of every path of a (multi)polyline. Dead ends are where a route meets something. */
export function routeEnds(paths: number[][][]): LngLat[] {
  const ends: LngLat[] = [];
  for (const p of paths) {
    if (p.length < 2) continue;
    ends.push([p[0][0], p[0][1]], [p[p.length - 1][0], p[p.length - 1][1]]);
  }
  return ends;
}

/**
 * Position along the river line in km, in the geometry's own order. Used for
 * candidates and existing access points alike, so gaps compare like with like
 * even if a MultiLineString's parts are not strictly ordered.
 */
export function alongRiverKm(river: LineString | MultiLineString, pt: LngLat): { km: number; offsetM: number; onRiver: LngLat } {
  const near = nearestPointOnLine(river, point(pt), { units: 'kilometers' });
  const p = near.properties as Record<string, number>;
  // totalDistance (and the older `location`) already run across every part of a MultiLineString.
  const km = p.totalDistance ?? p.location ?? 0;
  const offsetKm = p.pointDistance ?? p.dist ?? 0;
  return { km, offsetM: offsetKm * 1000, onRiver: near.geometry.coordinates as LngLat };
}

/** The existing accesses either side of a river position, and the gap between them. */
export function gapAround(km: number, existingKm: number[], riverKm: number) {
  const sorted = [...existingKm].sort((a, b) => a - b);
  const up = [...sorted].reverse().find((k) => k <= km) ?? null;
  const down = sorted.find((k) => k > km) ?? null;
  const nearest = sorted.length ? Math.min(...sorted.map((k) => Math.abs(k - km))) : Infinity;
  return {
    upKm: up, downKm: down, nearestKm: nearest,
    gapKm: (down ?? riverKm) - (up ?? 0),
  };
}

export interface Candidate {
  km: number;
  vehicle: VehicleClass;
  [key: string]: unknown;
}

/** One candidate per stretch of river: within `withinKm`, keep the most capable route, then the closest to water. */
export function dedupeAlongRiver<T extends Candidate & { offsetM: number }>(cands: T[], withinKm = 0.3): T[] {
  const ranked = [...cands].sort((a, b) => VEHICLE_RANK[b.vehicle] - VEHICLE_RANK[a.vehicle] || a.offsetM - b.offsetM);
  const kept: T[] = [];
  for (const c of ranked) if (!kept.some((k) => Math.abs(k.km - c.km) < withinKm)) kept.push(c);
  return kept.sort((a, b) => a.km - b.km);
}

// ── v2: county roads, the real channel, trustworthy neighbours ─────────────────
//
// Lessons from Long Hollow (Eleven Point, 2026-11-01): the access floaters use
// is a COUNTY road end 48 m from the channel, which v1 never saw because it read
// only Forest Service roads; and v1's "strong" Boom Hole candidate was a 1.5-mile
// high-clearance Forest Service track to a river feature, not an access.

export type RoadSource = 'county' | 'usfs';

/** Census TIGER MTFCC → how drivable the road is. S1500 is a 4WD vehicular trail. */
export function tigerClass(mtfcc: unknown): { drivable: boolean; fourWd: boolean } {
  const c = String(mtfcc ?? '');
  if (c === 'S1500') return { drivable: true, fourWd: true };
  if (/^S1(100|200|400|640|740)$/.test(c)) return { drivable: true, fourWd: false };
  return { drivable: false, fourWd: false }; // walkways, alleys, ramps, private service drives
}

/**
 * A road END is a dead end only if no other road continues from it. TIGER and
 * MVUM split roads into segments at every junction, so most segment ends are
 * junctions, not places a road stops.
 */
export function deadEnds(paths: number[][][], toleranceM = 8, continuing: number[][][] = []): LngLat[] {
  // Grid of every vertex (cell ~ toleranceM), tagged with the path it belongs to,
  // so each end checks only its neighbourhood and never counts its own road:
  // Census draws short stubs densely (Long Hollow's last 49 m has 7 vertices),
  // so a road's own next vertex is often within the tolerance of its end.
  const cell = toleranceM / 111_000;
  const grid = new Map<string, { v: LngLat; path: number }[]>();
  const add = (v: number[], path: number) => {
    const k = `${Math.floor(v[0] / cell)},${Math.floor(v[1] / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push({ v: [v[0], v[1]], path });
  };
  paths.forEach((p, i) => p.forEach((v) => add(v, i)));
  // Roads from another source count only through their interior: a county road
  // that turns into a Forest Service road continues; one that merely shares an
  // end with a duplicate of itself does not.
  continuing.forEach((p, i) => p.slice(1, -1).forEach((v) => add(v, -1 - i)));
  const near = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 89_000, (a[1] - b[1]) * 111_000) <= toleranceM;
  const continues = (e: LngLat, own: number) => {
    const [cx, cy] = [Math.floor(e[0] / cell), Math.floor(e[1] / cell)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const g of grid.get(`${cx + dx},${cy + dy}`) ?? []) if (g.path !== own && near(g.v, e)) return true;
    }
    return false;
  };
  const out: LngLat[] = [];
  paths.forEach((p, i) => {
    if (p.length < 2) return;
    for (const e of [p[0], p[p.length - 1]] as LngLat[]) if (!continues(e, i)) out.push(e);
  });
  return out;
}

export interface RoadEnd {
  source: RoadSource;
  /** Metres from the end to the actual channel (high-resolution flowline). */
  toWaterM: number;
  fourWd: boolean;
  /** USFS maintenance level 1 to 5 when known; 2 means high-clearance only. */
  maintLevel: number | null;
  publicEnd: boolean;
  publicBank: boolean;
}

/**
 * Tier and score. A: a drivable road ends at public riverbank. B: a road ends
 * at the water but the land is not shown public (often a county right-of-way;
 * check legality). A high-clearance-only Forest Service track is never tier A
 * on its own (Boom Hole). Higher score first.
 */
export function rankRoadEnd(e: RoadEnd): { tier: 'A' | 'B'; score: number; notes: string[] } {
  const notes: string[] = [];
  const hcvTrack = e.source === 'usfs' && e.maintLevel !== null && e.maintLevel <= 2;
  if (e.fourWd) notes.push('4WD trail');
  if (hcvTrack) notes.push('high-clearance Forest Service track');
  const publicLand = e.publicEnd && e.publicBank;
  const tier = publicLand && !hcvTrack ? 'A' : 'B';
  if (!publicLand) notes.push('land at the end or bank not shown public: check legality');
  let score = 100 - Math.min(e.toWaterM, 300) / 3;
  if (e.source === 'county') score += 10;
  if (hcvTrack) score -= 25;
  if (e.fourWd) score -= 5;
  if (publicLand) score += 20;
  return { tier, score: Math.round(score), notes };
}

/** "Long Hollow Creek mouth" from the nearest named tributary confluence, for naming and searching. */
export function nearestMouth(end: LngLat, mouths: { name: string; at: LngLat }[], withinM = 400): string | null {
  let best: { name: string; m: number } | null = null;
  for (const m of mouths) {
    const d = Math.hypot((m.at[0] - end[0]) * 89_000, (m.at[1] - end[1]) * 111_000);
    if (d <= withinM && (!best || d < best.m)) best = { name: m.name, m: d };
  }
  return best ? `${best.name} mouth` : null;
}

/**
 * Fast distance to the channel: a grid index of channel segments (~500 m
 * cells), planar metres. Points farther than the cell neighbourhood return
 * Infinity, which is all a road-to-river test needs.
 */
export function channelIndex(channel: number[][][], cellDeg = 0.005): (p: LngLat) => number {
  const grid = new Map<string, [number[], number[]][]>();
  for (const line of channel) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const cells = new Set([a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]].map((v) => `${Math.floor(v[0] / cellDeg)},${Math.floor(v[1] / cellDeg)}`));
      for (const k of cells) (grid.get(k) ?? grid.set(k, []).get(k)!).push([a, b]);
    }
  }
  return (p) => {
    const kx = 89_000, ky = 111_000;
    const [cx, cy] = [Math.floor(p[0] / cellDeg), Math.floor(p[1] / cellDeg)];
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [a, b] of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
        const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2)) : 0;
        best = Math.min(best, Math.hypot(ax + t * vx, ay + t * vy));
      }
    }
    return best;
  };
}

/**
 * Where a road comes down to the water and goes back: a vertex that is the
 * road's closest approach (<= reachM), with the road at least `departM` farther
 * from the water `spanM` along the road on BOTH sides (or the road ending on
 * that side). Long Hollow is this shape: County Road 416 loops to the river and
 * turns back, so its nearest point is mid-road, not a dead end. A road running
 * alongside the river stays level and never qualifies.
 */
export function approachPoints(path: number[][], dist: (p: LngLat) => number, reachM = 200, departM = 60, spanM = 250): LngLat[] {
  const d = path.map((v) => dist([v[0], v[1]]));
  const along: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    along.push(along[i - 1] + Math.hypot((path[i][0] - path[i - 1][0]) * 89_000, (path[i][1] - path[i - 1][1]) * 111_000));
  }
  const out: LngLat[] = [];
  for (let i = 0; i < path.length; i++) {
    if (!(d[i] <= reachM)) continue;
    // Local minimum within the span on both sides.
    let isMin = true;
    for (let j = 0; j < path.length && isMin; j++) if (j !== i && Math.abs(along[j] - along[i]) <= spanM && d[j] < d[i]) isMin = false;
    if (!isMin) continue;
    const departs = (dir: 1 | -1) => {
      for (let j = i + dir; j >= 0 && j < path.length; j += dir) {
        if (Math.abs(along[j] - along[i]) > spanM) return d[j] >= d[i] + departM;
        if (d[j] >= d[i] + departM) return true;
      }
      return true; // the road ends on this side: that is a spur, which counts
    };
    if (i > 0 && i < path.length - 1 && departs(1) && departs(-1)) out.push([path[i][0], path[i][1]]);
  }
  return out;
}
