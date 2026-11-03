// src/lib/national-map/rated.ts
// Eddy's RATED rivers on the national map: in a state view, each curated
// river is drawn in sections, one per rated gauge, coloured by Eddy's float
// condition at that gauge — the same condition the planner and the Ozarks map
// show (shared/condition-ladder.ts classifyReading, shared/condition-system.ts
// colours).
//
// What it claims, and what it does not:
//   * Only rivers Eddy rates, with Eddy's own per-gauge thresholds — a float
//     verdict, never computed for an unrated gauge or river (ADR 0018).
//   * A section is the stretch of river nearer to its gauge than to the next
//     rated gauge (boundaries halfway between gauges along the line). Its
//     colour is THAT gauge's condition: what the gauge says about the river
//     around it, as the Ozarks map's gradient already implies — not a
//     measurement anywhere else along the section.
//   * A gauge without a current reading colours its section "no current
//     reading" (Eddy's unknown), never a guess.
//
// Readings come from the national frame (the same snapshot as the gauge
// marks), so a section and its gauge can never disagree on screen.
//
// Pure, no DOM.

import { classifyReading } from '@shared/condition-ladder';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import type { DecodedGaugeReading } from './frame';
import type { DecodedLine } from './geometry';
import { readingState } from './marks';
import { componentOf, projectComponent, type MapComponent } from './projection';

export interface RatedGauge {
  siteId: string;
  lng: number;
  lat: number;
  isPrimary: boolean;
  unit: 'ft' | 'cfs';
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  floodStageFt: number | null;
}

export interface RatedRiver {
  id: string;
  slug: string;
  name: string;
  /** [lng, lat] along the river, as Eddy stores it. */
  coords: Array<[number, number]>;
  gauges: RatedGauge[];
  /** Set by orientRivers: the line now runs downstream (true) or its direction is unknown (false). */
  downstream?: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Rated rivers from /api/usgs/mo-dataset?slim=1 (rivers with a line geometry). */
export function parseRatedRivers(body: unknown): RatedRiver[] {
  const rivers = (body as { rivers?: unknown })?.rivers;
  if (!Array.isArray(rivers)) return [];
  const out: RatedRiver[] = [];
  for (const r of rivers as Array<Record<string, unknown>>) {
    const geom = r.geometry as { type?: string; coordinates?: unknown } | null;
    if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) continue;
    const coords = (geom.coordinates as unknown[]).filter(
      (c): c is [number, number] => Array.isArray(c) && num(c[0]) !== null && num(c[1]) !== null,
    );
    if (coords.length < 2 || typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    const gauges: RatedGauge[] = [];
    for (const g of (Array.isArray(r.gauges) ? r.gauges : []) as Array<Record<string, unknown>>) {
      const lng = num(g.lon);
      const lat = num(g.lat);
      if (typeof g.site_id !== 'string' || lng === null || lat === null) continue;
      gauges.push({
        siteId: g.site_id,
        lng,
        lat,
        isPrimary: g.is_primary === true,
        unit: g.threshold_unit === 'cfs' ? 'cfs' : 'ft',
        levelTooLow: num(g.level_too_low),
        levelLow: num(g.level_low),
        levelOptimalMin: num(g.level_optimal_min),
        levelOptimalMax: num(g.level_optimal_max),
        levelHigh: num(g.level_high),
        levelDangerous: num(g.level_dangerous),
        floodStageFt: num(g.flood_stage_ft),
      });
    }
    out.push({ id: r.id, slug: typeof r.slug === 'string' ? r.slug : r.id, name: r.name, coords, gauges });
  }
  return out;
}

/**
 * Eddy's condition at a gauge from a frame reading — as the planner grades it
 * (classifyReading, the gauge's own unit, flood stage overriding). Not a
 * current reading (stale, flagged, missing): unknown.
 */
export function gaugeCondition(g: RatedGauge, reading: DecodedGaugeReading | null, clock: number): ConditionCode {
  if (!reading || readingState(reading, clock) !== 'live') return 'unknown';
  return classifyReading(
    reading.gaugeHeightFt,
    {
      levelTooLow: g.levelTooLow,
      levelLow: g.levelLow,
      levelOptimalMin: g.levelOptimalMin,
      levelOptimalMax: g.levelOptimalMax,
      levelHigh: g.levelHigh,
      levelDangerous: g.levelDangerous,
      thresholdUnit: g.unit,
      floodStageFt: g.floodStageFt,
    },
    reading.dischargeCfs,
    { strictUnit: true },
  );
}

export interface RatedSection {
  riverId: string;
  river: string;
  /** The rated gauge this section is coloured by (null: the river has none). */
  siteId: string | null;
  code: ConditionCode;
  component: MapComponent;
  /** Projected (landscape-frame) polyline, upstream → downstream when `downstream` is known. */
  xy: Float32Array;
  /**
   * Whether the line runs downstream, confirmed against the national network
   * (true; reversed to make it so where needed) or not determinable (false).
   * Trails — which claim mapped downstream direction — run only when true.
   */
  downstream: boolean;
}

/** Where along a polyline (distance from its start) a point is nearest. */
function alongLine(xy: Float32Array, cum: Float32Array, x: number, y: number): number {
  let best = Infinity;
  let at = 0;
  for (let i = 0; i + 3 < xy.length; i += 2) {
    const ax = xy[i];
    const ay = xy[i + 1];
    const bx = xy[i + 2];
    const by = xy[i + 3];
    const seg = Math.hypot(bx - ax, by - ay);
    const u = seg > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (seg * seg))) : 0;
    const d = Math.hypot(ax + (bx - ax) * u - x, ay + (by - ay) * u - y);
    if (d < best) {
      best = d;
      at = cum[i / 2] + seg * u;
    }
  }
  return at;
}

/** The polyline between distances a and b (projected coordinates). */
function slice(xy: Float32Array, cum: Float32Array, a: number, b: number): Float32Array {
  const out: number[] = [];
  for (let i = 0; i + 3 < xy.length; i += 2) {
    const s0 = cum[i / 2];
    const s1 = cum[i / 2 + 1];
    if (s1 < a || s0 > b || s1 === s0) continue;
    const u0 = Math.max(0, (a - s0) / (s1 - s0));
    const u1 = Math.min(1, (b - s0) / (s1 - s0));
    const p = (u: number) => [xy[i] + (xy[i + 2] - xy[i]) * u, xy[i + 1] + (xy[i + 3] - xy[i + 1]) * u];
    if (!out.length) out.push(...p(u0));
    out.push(...p(u1));
  }
  return new Float32Array(out);
}

/**
 * Split each rated river into one section per rated gauge (boundaries halfway
 * between neighbouring gauges along the river) and colour each by its
 * gauge's condition. A river with no rated gauge is one "unknown" section.
 */
/**
 * Rated rivers with their lines turned to run downstream where the national
 * network confirms the direction (flowDirection); done once per dataset and
 * network, not on every reading.
 */
export function orientRivers(rivers: RatedRiver[], network: DecodedLine[]): RatedRiver[] {
  return rivers.map((river) => {
    const component = componentOf(river.coords[0][0], river.coords[0][1]);
    const pts = river.coords.map(([lng, lat]) => projectComponent(component, lng, lat));
    const pad = 3;
    const minX = Math.min(...pts.map((p) => p[0])) - pad;
    const maxX = Math.max(...pts.map((p) => p[0])) + pad;
    const minY = Math.min(...pts.map((p) => p[1])) - pad;
    const maxY = Math.max(...pts.map((p) => p[1])) + pad;
    // Only network lines near this river take part.
    const nearby = network.filter((l) => {
      if (l.component !== component) return false;
      for (let i = 0; i + 1 < l.xy.length; i += 2) {
        if (l.xy[i] >= minX && l.xy[i] <= maxX && l.xy[i + 1] >= minY && l.xy[i + 1] <= maxY) return true;
      }
      return false;
    });
    const dir = flowDirection(river, component, nearby);
    return { ...river, coords: dir === -1 ? [...river.coords].reverse() : river.coords, downstream: dir !== 0 };
  });
}

export function ratedSections(rivers: RatedRiver[], readings: Map<string, DecodedGaugeReading>, clock: number): RatedSection[] {
  const out: RatedSection[] = [];
  for (const r of rivers) {
    const component = componentOf(r.coords[0][0], r.coords[0][1]);
    const downstream = r.downstream ?? false;
    const xy = new Float32Array(r.coords.length * 2);
    const cum = new Float32Array(r.coords.length);
    r.coords.forEach(([lng, lat], i) => {
      const [x, y] = projectComponent(component, lng, lat);
      xy[i * 2] = x;
      xy[i * 2 + 1] = y;
      if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - xy[i * 2 - 2], y - xy[i * 2 - 1]);
    });
    const length = cum[cum.length - 1];
    if (!(length > 0)) continue;
    // One position per gauge site (a site listed twice keeps its first entry).
    const seen = new Set<string>();
    const placed = r.gauges
      .filter((g) => !seen.has(g.siteId) && seen.add(g.siteId))
      .map((g) => {
        const [gx, gy] = projectComponent(component, g.lng, g.lat);
        return { g, at: alongLine(xy, cum, gx, gy) };
      })
      .sort((a, b) => a.at - b.at);
    if (!placed.length) {
      out.push({ riverId: r.id, river: r.name, siteId: null, code: 'unknown', component, xy, downstream });
      continue;
    }
    placed.forEach((p, k) => {
      const a = k === 0 ? 0 : (placed[k - 1].at + p.at) / 2;
      const b = k === placed.length - 1 ? length : (p.at + placed[k + 1].at) / 2;
      const part = slice(xy, cum, a, b);
      if (part.length < 4) return;
      out.push({
        riverId: r.id,
        river: r.name,
        siteId: p.g.siteId,
        code: gaugeCondition(p.g, readings.get(p.g.siteId) ?? null, clock),
        component,
        xy: part,
        downstream,
      });
    });
  }
  return out;
}

/**
 * Which way a rated river's stored line runs, judged against the national
 * network (digitized downstream, scripts/build-national-map-geometry.ts):
 * points along the rated line vote with the direction of the nearest national
 * line within `near` frame px. 1 = stored downstream, -1 = stored upstream,
 * 0 = cannot tell (too few votes, or a split vote) — then no trail runs on it.
 */
export function flowDirection(river: RatedRiver, component: MapComponent, network: DecodedLine[], near = 1.5): 1 | -1 | 0 {
  const pts = river.coords.map(([lng, lat]) => projectComponent(component, lng, lat));
  if (pts.length < 2 || !network.length) return 0;
  let agree = 0;
  let disagree = 0;
  const samples = Math.min(9, pts.length - 1);
  for (let k = 0; k < samples; k++) {
    const i = Math.floor(((k + 0.5) / samples) * (pts.length - 1));
    const [ax, ay] = pts[i];
    const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = bx - ax;
    const dy = by - ay;
    if (!dx && !dy) continue;
    let best = near;
    let dot = 0;
    for (const l of network) {
      if (l.component !== component) continue;
      for (let j = 0; j + 3 < l.xy.length; j += 2) {
        const sx = l.xy[j];
        const sy = l.xy[j + 1];
        const ex = l.xy[j + 2] - sx;
        const ey = l.xy[j + 3] - sy;
        const len2 = ex * ex + ey * ey;
        if (!len2) continue;
        const u = Math.max(0, Math.min(1, ((ax - sx) * ex + (ay - sy) * ey) / len2));
        const d = Math.hypot(sx + ex * u - ax, sy + ey * u - ay);
        if (d < best) {
          best = d;
          dot = dx * ex + dy * ey;
        }
      }
    }
    if (dot > 0) agree++;
    else if (dot < 0) disagree++;
  }
  if (agree + disagree < 2) return 0;
  if (agree >= 2 * disagree) return 1;
  if (disagree >= 2 * agree) return -1;
  return 0;
}

/** Rated gauges by condition (one per gauge), for the calm card and the legend. */
export function ratedCounts(sections: RatedSection[]): Partial<Record<ConditionCode, number>> {
  const out: Partial<Record<ConditionCode, number>> = {};
  const seen = new Set<string>();
  for (const s of sections) {
    if (!s.siteId || seen.has(s.siteId)) continue;
    seen.add(s.siteId);
    out[s.code] = (out[s.code] ?? 0) + 1;
  }
  return out;
}

/** The legend's rows: Eddy's own order and colours, with "no current reading" last. */
export const RATED_LEGEND: Array<{ code: ConditionCode; label: string; color: string }> = (
  ['dangerous', 'high', 'flowing', 'good', 'low', 'too_low', 'unknown'] as ConditionCode[]
).map((code) => ({
  code,
  label: code === 'unknown' ? 'No current reading' : CONDITION_SYSTEM[code].label,
  color: CONDITION_SYSTEM[code].solid,
}));
