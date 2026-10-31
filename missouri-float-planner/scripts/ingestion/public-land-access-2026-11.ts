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
