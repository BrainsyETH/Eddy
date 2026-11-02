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
import { COMPONENT_SCALE } from './projection';

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
  /** Total travelled length, landscape-frame px. */
  length: number;
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
  return { steps, tributaries, length: travelled, names, outlet: from };
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
  const travelMs = Math.round(Math.max(7000, Math.min(17000, 3000 + j.length * 16)));
  return { travelMs, totalMs: travelMs + JOURNEY_HOLD_MS + JOURNEY_FADE_MS };
}

/**
 * Where the head is after `elapsed` ms: distance along the journey (frame px).
 * Eased in and out, so the highlight leaves the headwater gently and settles
 * at the outlet rather than stopping dead.
 */
export function journeyHead(j: Journey, elapsed: number): number {
  const { travelMs } = journeyTiming(j);
  const u = Math.max(0, Math.min(1, elapsed / travelMs));
  const eased = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  return eased * j.length;
}
