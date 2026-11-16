// src/lib/national-map/change.ts
// The Change view: what moved at each gauge over a recent window, measured
// against the recorded frame that far back (national_map_frames).
//
// Two kinds of change, never mixed:
//   * FLOOD CROSSINGS — NWS's own observed category in both frames: rose
//     into or within flooding, or fell within or out of it. Quoted, so no
//     threshold of ours is involved.
//   * FLOW CHANGE — USGS discharge now against discharge one window ago, as
//     a ratio (stage in feet for stage-only gauges). THESE THRESHOLDS ARE
//     PROVISIONAL: they are reasoned defaults until the calibration over
//     recorded frames (scripts/calibrate-change-thresholds.ts) has run on at
//     least a full day and the result is recorded in
//     docs/national-river-map.md. Regulated releases, snowmelt and ice are
//     not modelled yet; a reading the map cannot trust is never a "change".
//
// Guards, all before any comparison:
//   * both readings live and not flagged by USGS (suspect / ice qualifiers);
//   * the earlier reading must have been current when its frame was captured
//     — a stale value carried in an old frame is not "the flow then";
//   * an implausible jump (≥ 30× either way inside the window) is
//     "unverified", not "rising sharply": sensor spikes and datum changes
//     look exactly like that.
//
// Pure, no DOM.

import { classifyFlood, readingState, type ClassifiedSite, type FloodClass, type MarkStyle, type Site } from './marks';

export type ChangeWindow = '6h' | '24h';

export const WINDOW_MS: Record<ChangeWindow, number> = { '6h': 6 * 3_600_000, '24h': 24 * 3_600_000 };

/** A window is offered only when a recorded frame reaches at least this far back (share of the window). */
export const WINDOW_MIN_SHARE = 0.9;

export type ChangeClass =
  | 'flood_up'
  | 'flood_down'
  | 'rising_fast'
  | 'rising'
  | 'steady'
  | 'falling'
  | 'falling_fast'
  | 'unverified'
  | 'no_compare'
  | 'hidden';

/**
 * PROVISIONAL flow-change thresholds (see the header). Discharge ratios are
 * symmetric in log space: "rising" at ≥ r, "falling" at ≤ 1/r. A one-cfs
 * floor on both readings keeps a trickle going from 0.2 to 0.6 cfs from
 * reading as "tripled".
 */
export const CHANGE_THRESHOLDS: Record<ChangeWindow, { ratio: number; fastRatio: number; stageFt: number; fastStageFt: number }> = {
  '6h': { ratio: 1.25, fastRatio: 2, stageFt: 0.3, fastStageFt: 1 },
  '24h': { ratio: 1.5, fastRatio: 3, stageFt: 0.5, fastStageFt: 2 },
};
export const CHANGE_FLOOR_CFS = 1;
/** A ratio beyond this inside one window is a sensor event until a person says otherwise. */
export const IMPLAUSIBLE_RATIO = 30;
/** A stage move this large (ft) is a datum change or a bad value, not water: "unverified". */
export const IMPLAUSIBLE_STAGE_FT = 25;
/** The earlier reading must have been at most this old when its frame was captured. */
export const PRIOR_FRESH_MS = 2 * 3_600_000;

const FLOOD_RANK: Partial<Record<FloodClass, number>> = { major: 4, moderate: 3, minor: 2, action: 1, below: 0 };

export interface ChangeContext {
  /** Prior-frame sites by key. */
  prior: Map<string, Site>;
  /** When the prior frame was captured. */
  priorCapturedAt: number;
  /** Whether NOAA was readable in the prior frame. */
  priorNoaaOk: boolean;
  window: ChangeWindow;
}

export interface SiteChange {
  cls: ChangeClass;
  /** The NWS category now (flood crossings). */
  floodNow?: FloodClass;
  floodThen?: FloodClass;
  /** Discharge then and now (cfs), when compared by discharge. */
  q0?: number;
  q1?: number;
  /** Stage then and now (ft), when compared by stage. */
  h0?: number;
  h1?: number;
  /** Magnitude for ranking: |ln ratio| for discharge, ft / 2 for stage, 3+ for crossings. */
  magnitude: number;
}

/** Classify one site's change over the window (current reading vs the prior frame). */
export function classifyChange(site: Site, ctx: ChangeContext, clock: number, noaaOk: boolean): SiteChange {
  const prior = ctx.prior.get(site.key);
  // Flood crossings first: NWS's own categories in both frames.
  if (noaaOk && ctx.priorNoaaOk && site.nws && prior?.nws) {
    const now = classifyFlood(site, clock, true);
    const then = classifyFlood(prior, ctx.priorCapturedAt, true);
    const a = FLOOD_RANK[then];
    const b = FLOOD_RANK[now];
    if (a !== undefined && b !== undefined && a !== b && Math.max(a, b) >= 2) {
      return { cls: b > a ? 'flood_up' : 'flood_down', floodNow: now, floodThen: then, magnitude: 3 + Math.abs(b - a) };
    }
  }
  // An NWS-only point has no discharge record to compare; only crossings count.
  if (site.kind !== 'usgs') return { cls: 'hidden', magnitude: 0 };
  const r1 = site.reading;
  const r0 = prior?.reading ?? null;
  if (!r1 || readingState(r1, clock) !== 'live') return { cls: readingState(r1, clock) === 'dormant' || !r1 ? 'hidden' : 'no_compare', magnitude: 0 };
  if (!r0 || r0.suspect || r0.observedAt === null || ctx.priorCapturedAt - r0.observedAt > PRIOR_FRESH_MS) return { cls: 'no_compare', magnitude: 0 };
  const t = CHANGE_THRESHOLDS[ctx.window];
  if (r1.dischargeCfs !== null && r0.dischargeCfs !== null) {
    const q0 = r0.dischargeCfs;
    const q1 = r1.dischargeCfs;
    const ratio = (Math.max(q1, 0) + CHANGE_FLOOR_CFS) / (Math.max(q0, 0) + CHANGE_FLOOR_CFS);
    const magnitude = Math.abs(Math.log(ratio));
    const base = { q0, q1, magnitude };
    if (ratio >= IMPLAUSIBLE_RATIO || ratio <= 1 / IMPLAUSIBLE_RATIO) return { cls: 'unverified', ...base };
    if (ratio >= t.fastRatio) return { cls: 'rising_fast', ...base };
    if (ratio >= t.ratio) return { cls: 'rising', ...base };
    if (ratio <= 1 / t.fastRatio) return { cls: 'falling_fast', ...base };
    if (ratio <= 1 / t.ratio) return { cls: 'falling', ...base };
    return { cls: 'steady', ...base };
  }
  if (r1.gaugeHeightFt !== null && r0.gaugeHeightFt !== null) {
    const h0 = r0.gaugeHeightFt;
    const h1 = r1.gaugeHeightFt;
    const d = h1 - h0;
    const base = { h0, h1, magnitude: Math.abs(d) / 2 };
    if (Math.abs(d) >= IMPLAUSIBLE_STAGE_FT) return { cls: 'unverified', ...base };
    if (d >= t.fastStageFt) return { cls: 'rising_fast', ...base };
    if (d >= t.stageFt) return { cls: 'rising', ...base };
    if (d <= -t.fastStageFt) return { cls: 'falling_fast', ...base };
    if (d <= -t.stageFt) return { cls: 'falling', ...base };
    return { cls: 'steady', ...base };
  }
  return { cls: 'no_compare', magnitude: 0 };
}

// ── Draw style ──────────────────────────────────────────────────────────────
// Direction is the shape (▲ more water / a higher category, ▼ less / lower);
// colour says which kind: the flow ramp's wet teal and dry stone for flow,
// NWS's own colours for flood crossings (the category reached).

const mk = (shape: MarkStyle['shape'], radius: number, color: string, salience: number, extra: Partial<MarkStyle> = {}): MarkStyle => ({
  shape, radius, color, keyline: true, salience, ring: false, minZoom: 0, ...extra,
});

const FLOOD_COLOR: Partial<Record<FloodClass, string>> = {
  major: 'flood.major',
  moderate: 'flood.moderate',
  minor: 'flood.minor',
  action: 'flood.action',
  below: 'flood.below',
};

/**
 * A crossing is coloured by the HIGHEST flood category involved — the one
 * reached on the way up, the one left on the way down — so "fell from
 * moderate flooding" is a red ▼ and never looks like an ordinary falling river.
 */
function crossingColor(c: SiteChange): string {
  const a = FLOOD_RANK[c.floodNow ?? 'below'] ?? 0;
  const b = FLOOD_RANK[c.floodThen ?? 'below'] ?? 0;
  return FLOOD_COLOR[a >= b ? c.floodNow! : c.floodThen!] ?? 'flood.minor';
}

export function changeStyle(c: SiteChange, wall = false): MarkStyle | null {
  const k = wall ? 1.25 : 1;
  switch (c.cls) {
    case 'flood_up':
      return mk('triangle', 4.2 * k, crossingColor(c), 9, { ring: true, halo: wall });
    case 'flood_down':
      return mk('down', 3.8 * k, crossingColor(c), 8, { halo: wall });
    case 'rising_fast':
      return mk('triangle', 2.9 * k, 'change.upFast', 6, { halo: wall });
    case 'rising':
      return mk('triangle', 1.9 * k, 'change.up', 5, wall ? { keyline: false } : {});
    case 'falling_fast':
      return mk('down', 2.7 * k, 'change.downFast', 6, { halo: wall });
    case 'falling':
      return mk('down', 1.8 * k, 'change.down', 4, wall ? { keyline: false } : {});
    case 'steady':
      return mk('dot', wall ? 0.75 : 0.95, 'change.steady', 3, { keyline: false, alpha: wall ? 0.45 : 0.8 });
    case 'unverified':
      return wall ? null : mk('cross', 1.05, 'stale', 1, { keyline: false });
    case 'no_compare':
      return wall ? null : mk('ring', 0.95, 'noComparison', 0, { keyline: false });
    default:
      return null;
  }
}

/** Legend sample styles (the flood rows use a representative category colour). */
export const CHANGE_LEGEND: Array<{ cls: ChangeClass; label: string; sample: SiteChange }> = [
  { cls: 'flood_up', label: 'Flood category rose', sample: { cls: 'flood_up', floodNow: 'moderate', floodThen: 'below', magnitude: 0 } },
  { cls: 'flood_down', label: 'Flood category fell', sample: { cls: 'flood_down', floodNow: 'below', floodThen: 'moderate', magnitude: 0 } },
  { cls: 'rising_fast', label: 'Rising sharply', sample: { cls: 'rising_fast', magnitude: 0 } },
  { cls: 'rising', label: 'Rising', sample: { cls: 'rising', magnitude: 0 } },
  { cls: 'steady', label: 'About the same', sample: { cls: 'steady', magnitude: 0 } },
  { cls: 'falling', label: 'Falling', sample: { cls: 'falling', magnitude: 0 } },
  { cls: 'falling_fast', label: 'Falling sharply', sample: { cls: 'falling_fast', magnitude: 0 } },
];

/** The threshold wording for a window, for the legend's method note. */
export function thresholdNote(window: ChangeWindow): string {
  const t = CHANGE_THRESHOLDS[window];
  return `Flow: rising at ${t.ratio}× (sharply ${t.fastRatio}×), falling at the inverse; stage-only gauges ${t.stageFt} ft (${t.fastStageFt} ft). Provisional until calibrated.`;
}

// ── Summary and ranking ─────────────────────────────────────────────────────

export interface ChangeSummary {
  counts: Record<ChangeClass, number>;
  /** Gauges compared (a reading then and now). */
  compared: number;
}

export function summarizeChange(changes: SiteChange[]): ChangeSummary {
  const counts = { flood_up: 0, flood_down: 0, rising_fast: 0, rising: 0, steady: 0, falling: 0, falling_fast: 0, unverified: 0, no_compare: 0, hidden: 0 } as Record<ChangeClass, number>;
  for (const c of changes) counts[c.cls]++;
  const compared = counts.rising_fast + counts.rising + counts.steady + counts.falling + counts.falling_fast;
  return { counts, compared };
}

const RANKED: ChangeClass[] = ['flood_up', 'flood_down', 'rising_fast', 'falling_fast', 'rising', 'falling'];

/** The biggest changes, crossings first, then by magnitude. */
export function biggestChanges<T extends { change: SiteChange }>(items: T[], limit = 8): T[] {
  return items
    .filter((i) => RANKED.includes(i.change.cls))
    .sort((a, b) => b.change.magnitude - a.change.magnitude)
    .slice(0, limit);
}

/** One line for a site's change: "1,240 → 3,100 cfs (2.5×) since 24 h ago". */
export function changeSentence(c: SiteChange, window: ChangeWindow): string {
  const span = window === '24h' ? '24 h' : '6 h';
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  if (c.cls === 'flood_up' || c.cls === 'flood_down') {
    const word = (f?: FloodClass) => (f === 'below' ? 'below flood stage' : f === 'action' ? 'action stage' : `${f} flooding`);
    return `${c.cls === 'flood_up' ? 'Rose' : 'Fell'} from ${word(c.floodThen)} to ${word(c.floodNow)} in the last ${span}.`;
  }
  if (c.q0 !== undefined && c.q1 !== undefined) {
    const ratio = (Math.max(c.q1, 0) + CHANGE_FLOOR_CFS) / (Math.max(c.q0, 0) + CHANGE_FLOOR_CFS);
    return `${nf.format(c.q0)} → ${nf.format(c.q1)} cfs (${ratio >= 1 ? `${nf.format(ratio)}×` : `${nf.format(1 / ratio)}× less`}) since ${span} ago.`;
  }
  if (c.h0 !== undefined && c.h1 !== undefined) {
    const d = c.h1 - c.h0;
    return `${nf.format(c.h0)} → ${nf.format(c.h1)} ft (${d >= 0 ? '+' : '−'}${nf.format(Math.abs(d))} ft) since ${span} ago.`;
  }
  if (c.cls === 'unverified') return 'A change too large to trust without checking (possible sensor spike).';
  return 'No comparison: no trustworthy reading from the start of the window.';
}

/** Which windows the recorded history can support, given the oldest frame time. */
export function availableWindows(oldestCapturedAt: number | null, newestCapturedAt: number | null): ChangeWindow[] {
  if (oldestCapturedAt === null || newestCapturedAt === null) return [];
  const span = newestCapturedAt - oldestCapturedAt;
  return (['6h', '24h'] as ChangeWindow[]).filter((w) => span >= WINDOW_MS[w] * WINDOW_MIN_SHARE);
}

/**
 * Every drawable site for the Change view, most salient last (like
 * classifySites), with each site's change kept for the panel and details.
 */
export function classifyChangeSites(
  sites: Site[],
  ctx: ChangeContext,
  clock: number,
  noaaOk: boolean,
  wall = false,
): { classified: ClassifiedSite[]; changes: SiteChange[] } {
  const changes = sites.map((s) => classifyChange(s, ctx, clock, noaaOk));
  const classified: ClassifiedSite[] = [];
  changes.forEach((c, index) => {
    const style = changeStyle(c, wall);
    if (style) classified.push({ index, cls: c.cls, style });
  });
  classified.sort((a, b) => a.style.salience - b.style.salience);
  return { classified, changes };
}
