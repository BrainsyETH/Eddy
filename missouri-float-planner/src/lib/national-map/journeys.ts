// src/lib/national-map/journeys.ts
// "Follow the river": the wall's signature sequence. A highlight travels a
// real river network from a headwater line to its outlet, and each tributary
// lights as it joins.
//
// Geometry only. The route comes from the 1:1M network's own From/To node
// topology (the `d` links written by scripts/build-national-map-geometry.ts);
// nothing here is measured flow, travel time or velocity — the highlight's
// pace is a presentation choice, and the caption names rivers, not readings.
//
// Pure, no DOM: picked once per geometry load, drawn by the renderer.

import type { DecodedLine } from './geometry';
import { COMPONENT_SCALE, inRegion, regionSpan, type MapComponent, type Region } from './projection';

export interface JourneyStep {
  /** Index into the decoded `rivers`. */
  line: number;
  /** Portion of that line travelled, 0–1 along its digitized (downstream) direction. */
  t0: number;
  t1: number;
}

export interface JourneyTributary {
  line: number;
  /** Distance along the journey where it joins, in landscape-frame px. */
  at: number;
}

export interface Journey {
  steps: JourneyStep[];
  tributaries: JourneyTributary[];
  /** Total route length, landscape-frame px. */
  length: number;
  /**
   * The stretch the head travels, as distances along the route. The national
   * wall runs the whole route (0 → length); a regional display runs only the
   * stretch inside its view (see visibleJourneys).
   */
  start: number;
  end: number;
  /** River names in travel order, consecutive repeats removed. */
  names: string[];
  /** The last line: where the journey reaches its outlet. */
  outlet: number;
}

/** Walk downstream from `start` until an outlet (or a loop, defensively). */
export function traceDownstream(rivers: DecodedLine[], start: number, maxSteps = 400): Journey {
  const upstreamOf = new Map<number, number[]>();
  rivers.forEach((l, i) => {
    if (l.down >= 0) (upstreamOf.get(l.down) ?? upstreamOf.set(l.down, []).get(l.down)!).push(i);
  });
  const steps: JourneyStep[] = [];
  const tributaries: JourneyTributary[] = [];
  const names: string[] = [];
  const seen = new Set<number>();
  let cur = start;
  let t0 = 0;
  let from = -1;
  let travelled = 0;
  while (cur >= 0 && cur < rivers.length && !seen.has(cur) && steps.length < maxSteps) {
    seen.add(cur);
    const line = rivers[cur];
    steps.push({ line: cur, t0, t1: 1 });
    if (line.name && names[names.length - 1] !== line.name) names.push(line.name);
    // Tributaries joining within the travelled part of this line, in order.
    const joins = (upstreamOf.get(cur) ?? [])
      .filter((u) => u !== from && rivers[u].downAt >= t0)
      .map((u) => ({ line: u, at: travelled + (rivers[u].downAt - t0) * line.length }))
      .sort((a, b) => a.at - b.at);
    tributaries.push(...joins);
    travelled += (1 - t0) * line.length;
    from = cur;
    t0 = line.downAt;
    cur = line.down;
  }
  return { steps, tributaries, length: travelled, start: 0, end: travelled, names, outlet: from };
}

/**
 * The part of a decoded line between fractions t0 and t1 of its length, as
 * [x, y, distanceFromT0] triples in frame units. Shared with the renderer.
 */
export function sliceLine(line: DecodedLine, t0: number, t1: number): number[] {
  const out: number[] = [];
  const a = t0 * line.length;
  const b = t1 * line.length;
  let run = 0;
  const xy = line.xy;
  for (let i = 0; i + 3 < xy.length; i += 2) {
    const seg = Math.hypot(xy[i + 2] - xy[i], xy[i + 3] - xy[i + 1]);
    const s0 = run;
    const s1 = run + seg;
    run = s1;
    if (s1 < a || s0 > b || seg === 0) continue;
    const u0 = Math.max(0, (a - s0) / seg);
    const u1 = Math.min(1, (b - s0) / seg);
    if (!out.length) out.push(xy[i] + (xy[i + 2] - xy[i]) * u0, xy[i + 1] + (xy[i + 3] - xy[i + 1]) * u0, s0 + seg * u0 - a);
    out.push(xy[i] + (xy[i + 2] - xy[i]) * u1, xy[i + 1] + (xy[i + 3] - xy[i + 1]) * u1, s0 + seg * u1 - a);
  }
  return out;
}

/** Every vertex of a journey's route: frame position, distance along it, and its step. */
export function routePoints(j: Journey, rivers: DecodedLine[]): Array<{ x: number; y: number; d: number; step: number; component: MapComponent }> {
  const out: Array<{ x: number; y: number; d: number; step: number; component: MapComponent }> = [];
  let base = 0;
  j.steps.forEach((step, k) => {
    const line = rivers[step.line];
    const part = sliceLine(line, step.t0, step.t1);
    for (let i = 0; i + 2 < part.length; i += 3) out.push({ x: part[i], y: part[i + 1], d: base + part[i + 2], step: k, component: line.component });
    base += (step.t1 - step.t0) * line.length;
  });
  return out;
}

/**
 * Journeys for a REGIONAL display: every walk from a headwater, clipped to
 * its longest stretch inside the view. The head enters where the river
 * enters the screen and stops where it leaves, so nothing is spent on
 * travel nobody can see. Stretches shorter than `minShare` of the view are
 * dropped; overlapping ones only count where most of the stretch is new.
 */
export function visibleJourneys(
  rivers: DecodedLine[],
  region: Region,
  { count = 6, minShare = 0.35, newShare = 0.5 }: { count?: number; minShare?: number; newShare?: number } = {},
): Journey[] {
  const span = regionSpan(region);
  if (span <= 0) return [];
  const hasUpstream = new Set(rivers.filter((l) => l.down >= 0).map((l) => l.down));
  const clipped: Array<{ j: Journey; lines: number[] }> = [];
  rivers.forEach((_, i) => {
    if (hasUpstream.has(i)) return;
    const full = traceDownstream(rivers, i);
    const pts = routePoints(full, rivers);
    // Longest contiguous run of vertices inside the region.
    let best: [number, number] | null = null;
    let runStart = -1;
    for (let k = 0; k <= pts.length; k++) {
      const inside = k < pts.length && inRegion(region, pts[k].component, pts[k].x, pts[k].y);
      if (inside && runStart < 0) runStart = k;
      if (!inside && runStart >= 0) {
        const a = pts[runStart].d;
        const b = pts[k - 1].d;
        if (!best || b - a > best[1] - best[0]) best = [a, b];
        runStart = -1;
      }
    }
    if (!best || best[1] - best[0] < span * minShare) return;
    const [start, end] = best;
    const steps = new Set(pts.filter((p) => p.d >= start && p.d <= end).map((p) => p.step));
    const names: string[] = [];
    for (const k of [...steps].sort((a, b) => a - b)) {
      const n = rivers[full.steps[k].line].name;
      if (n && names[names.length - 1] !== n) names.push(n);
    }
    if (!names.length) return;
    clipped.push({
      j: { ...full, start, end, names, tributaries: full.tributaries.filter((t) => t.at >= start && t.at <= end) },
      lines: [...steps].map((k) => full.steps[k].line),
    });
  });
  clipped.sort((a, b) => b.j.end - b.j.start - (a.j.end - a.j.start));
  // The same visible stretch reached from different headwaters is one
  // journey: keep a stretch only where most of its lines are not shown yet.
  const used = new Set<number>();
  const out: Journey[] = [];
  for (const { j, lines } of clipped) {
    if (out.length >= count) break;
    const fresh = lines.filter((l) => !used.has(l)).length;
    if (fresh < lines.length * newShare) continue;
    out.push(j);
    for (const l of lines) used.add(l);
  }
  return out;
}

/**
 * The journeys worth showing: the longest walk from a headwater to each
 * outlet first, then further walks only where most of their route is new
 * (Arkansas and Tennessee into the Mississippi, not the Missouri twice).
 * Ordered so consecutive journeys end at different outlets. Lengths are
 * compared at true scale: Alaska is drawn at 0.35, so the Yukon would
 * otherwise lose to every short river in the lower 48.
 */
export function pickJourneys(
  rivers: DecodedLine[],
  { count = 8, minLength = 150, newShare = 0.45 }: { count?: number; minLength?: number; newShare?: number } = {},
): Journey[] {
  const hasUpstream = new Set(rivers.filter((l) => l.down >= 0).map((l) => l.down));
  const candidates = rivers
    .map((_, i) => i)
    .filter((i) => !hasUpstream.has(i))
    .map((i) => traceDownstream(rivers, i))
    .map((j) => ({ j, real: j.length / COMPONENT_SCALE[rivers[j.outlet].component] }))
    .filter(({ j, real }) => real >= minLength && j.names.length > 0)
    .sort((a, b) => b.real - a.real)
    .map(({ j }) => j);
  const used = new Set<number>();
  const picked: Journey[] = [];
  for (const j of candidates) {
    if (picked.length >= count) break;
    const fresh = j.steps.reduce((sum, s) => sum + (used.has(s.line) ? 0 : (s.t1 - s.t0) * rivers[s.line].length), 0);
    if (fresh < j.length * newShare) continue;
    // Never two journeys that open on the same river.
    if (picked.some((p) => p.names[0] === j.names[0])) continue;
    picked.push(j);
    for (const s of j.steps) used.add(s.line);
  }
  // Interleave by outlet so the wall does not finish at the Gulf twice running.
  const out: Journey[] = [];
  const pool = [...picked];
  while (pool.length) {
    const last = out[out.length - 1]?.outlet;
    const k = pool.findIndex((j) => j.outlet !== last);
    out.push(pool.splice(k >= 0 ? k : 0, 1)[0]);
  }
  return out;
}

/** "Yellowstone → Missouri → Mississippi" — the story display's one caption. */
export function journeyCaption(j: Journey): string {
  return j.names.map((n) => n.replace(/ River$/, '')).join(' → ');
}

/** Travel scales with route length, inside bounds a room can follow. */
export const JOURNEY_HOLD_MS = 3500;
export const JOURNEY_FADE_MS = 1500;

export function journeyTiming(j: Journey): { travelMs: number; totalMs: number } {
  // Pace follows the stretch as drawn on screen: a regional stretch is short
  // in frame units but fills the view, so it is timed by its share of the
  // national scale only through the bounds below.
  const travelMs = Math.round(Math.max(7000, Math.min(17000, 3000 + (j.end - j.start) * 16)));
  return { travelMs, totalMs: travelMs + JOURNEY_HOLD_MS + JOURNEY_FADE_MS };
}

/**
 * Where the head is after `elapsed` ms: distance along the route (frame px),
 * from `start` to `end`.
 * Eased in and out, so the highlight leaves the headwater gently and settles
 * at the outlet rather than stopping dead.
 */
export function journeyHead(j: Journey, elapsed: number): number {
  const { travelMs } = journeyTiming(j);
  const u = Math.max(0, Math.min(1, elapsed / travelMs));
  const eased = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  return j.start + eased * (j.end - j.start);
}
