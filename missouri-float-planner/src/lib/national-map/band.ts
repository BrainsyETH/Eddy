// src/lib/national-map/band.ts
// What the vertical wall's stats band says changed since an earlier recorded
// snapshot (the same ~6 h-older frame the stories use).
//
// A count can move for two different reasons, and the band keeps them apart:
//   * a real change — a gauge that was reporting both times ENTERED or LEFT
//     flooding (or an unusual flow band);
//   * a reporting change — a gauge that was not reporting a usable reading
//     then and is now (or the reverse). "Three more gauges reporting
//     flooding" is not "three rivers newly in flood".
// Each severity keeps its own change, so a falling total cannot hide a rise
// in major flooding.
//
// Pure, no DOM.

import { classifyFlood, classifyFlow, type FloodClass, type FlowClass, type Site } from './marks';

const FLOODING: ReadonlySet<FloodClass> = new Set(['major', 'moderate', 'minor']);
/** A usable NWS observation either time: flooding, action, or below flood stage. */
const ASSESSED: ReadonlySet<FloodClass> = new Set(['major', 'moderate', 'minor', 'action', 'below']);
const UNUSUAL: ReadonlySet<FlowClass> = new Set(['much_higher', 'much_lower']);
const COMPARED: ReadonlySet<FlowClass> = new Set(['much_higher', 'higher', 'normal', 'lower', 'much_lower']);

export interface Transitions {
  /** Reporting both times: became flooding / unusual. */
  entered: number;
  /** Reporting both times: no longer flooding / unusual. */
  left: number;
  /** Flooding / unusual now, but not reporting a usable reading then. */
  newlyReporting: number;
  /** Flooding / unusual then, but not reporting a usable reading now. */
  stoppedReporting: number;
  /** Per class, count now minus count then (severity kept apart). */
  delta: Record<string, number>;
  /** Hours between the two snapshots. */
  hours: number;
}

function tally<K extends string>(classes: K[], keys: readonly K[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = 0;
  for (const c of classes) if (c in out) out[c]++;
  return out;
}

/**
 * Flooding transitions for the sites on show. `prior` null, or a NOAA read
 * that failed either time, means no comparison (null) — never a guess.
 */
export function floodTransitions(
  sites: Site[],
  prior: { sites: Map<string, Site>; capturedAt: number; noaaOk: boolean } | null,
  clock: number,
  noaaOk: boolean,
): Transitions | null {
  if (!prior || !noaaOk || !prior.noaaOk) return null;
  const t: Transitions = { entered: 0, left: 0, newlyReporting: 0, stoppedReporting: 0, delta: {}, hours: Math.max(1, Math.round((clock - prior.capturedAt) / 3_600_000)) };
  const nowClasses: FloodClass[] = [];
  const thenClasses: FloodClass[] = [];
  for (const site of sites) {
    if (!site.nws) continue;
    const now = classifyFlood(site, clock, true);
    const before = prior.sites.get(site.key);
    const then: FloodClass = before?.nws ? classifyFlood(before, prior.capturedAt, true) : 'not_current';
    nowClasses.push(now);
    thenClasses.push(then);
    const fNow = FLOODING.has(now);
    const fThen = FLOODING.has(then);
    if (fNow === fThen) continue;
    const bothReporting = ASSESSED.has(now) && ASSESSED.has(then);
    if (fNow) {
      if (bothReporting) t.entered++;
      else t.newlyReporting++;
    } else if (bothReporting) t.left++;
    else t.stoppedReporting++;
  }
  const keys = ['major', 'moderate', 'minor', 'action'] as const;
  const n = tally(nowClasses, keys);
  const p = tally(thenClasses, keys);
  for (const k of keys) t.delta[k] = n[k] - p[k];
  t.delta.flooding = n.major + n.moderate + n.minor - (p.major + p.moderate + p.minor);
  return t;
}

/** Flow transitions: into / out of the unusual bands (much higher or much lower). */
export function flowTransitions(sites: Site[], prior: { sites: Map<string, Site>; capturedAt: number } | null, clock: number): Transitions | null {
  if (!prior) return null;
  const t: Transitions = { entered: 0, left: 0, newlyReporting: 0, stoppedReporting: 0, delta: {}, hours: Math.max(1, Math.round((clock - prior.capturedAt) / 3_600_000)) };
  const nowClasses: FlowClass[] = [];
  const thenClasses: FlowClass[] = [];
  for (const site of sites) {
    if (site.kind !== 'usgs') continue;
    const now = classifyFlow(site, clock);
    const before = prior.sites.get(site.key);
    const then: FlowClass = before ? classifyFlow(before, prior.capturedAt) : 'dormant';
    nowClasses.push(now);
    thenClasses.push(then);
    const uNow = UNUSUAL.has(now);
    const uThen = UNUSUAL.has(then);
    if (uNow === uThen) continue;
    const bothCompared = COMPARED.has(now) && COMPARED.has(then);
    if (uNow) {
      if (bothCompared) t.entered++;
      else t.newlyReporting++;
    } else if (bothCompared) t.left++;
    else t.stoppedReporting++;
  }
  const keys = ['much_higher', 'higher', 'normal', 'lower', 'much_lower'] as const;
  const n = tally(nowClasses, keys);
  const p = tally(thenClasses, keys);
  for (const k of keys) t.delta[k] = n[k] - p[k];
  const comparedNow = keys.reduce((s, k) => s + n[k], 0);
  const comparedThen = keys.reduce((s, k) => s + p[k], 0);
  t.delta.compared = comparedNow - comparedThen;
  return t;
}

/** "+3", "−2", "±0" — a signed count with a real minus sign. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0';
}

/**
 * The comparison in words: what really changed first, then reporting
 * changes, each only when non-zero. `noun` names the state ("flood",
 * "an unusual flow band").
 */
export function transitionSentence(t: Transitions, noun: string): string {
  const real = [t.entered && `${t.entered} entered ${noun}`, t.left && `${t.left} left ${noun}`].filter(Boolean);
  const coverage = [
    t.newlyReporting && `${t.newlyReporting} newly reporting`,
    t.stoppedReporting && `${t.stoppedReporting} stopped reporting`,
  ].filter(Boolean);
  if (!real.length && !coverage.length) return `No change since ${t.hours} h ago`;
  return `Since ${t.hours} h ago: ${[...real, ...coverage].join(' · ')}`;
}
