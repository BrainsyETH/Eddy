// src/lib/national-map/marks.ts
// What every point on the national map IS, per view — the rules that keep a
// text-free display honest.
//
// The plan's data-integrity contract, as code:
//   * Stale or suspect readings become neutral hollow marks and never pulse.
//   * A live reading with no seasonal comparison is NOT normal — it gets its
//     own hollow mark.
//   * "No defined flood threshold" is never "no flooding"; action stage is
//     never flooding; observed status only (forecast is detail-panel text).
//   * A USGS gauge and its matched NWS forecast point are one site, drawn once.
//
// Pure: no DOM, no canvas. The renderer draws what this decides.

import { flowBand, type FlowBand } from '@shared/flow-band';
import { gaugeFreshness } from '@shared/gauge-freshness';
import type { CatalogStation } from './catalog';
import type { DecodedFrame, DecodedGaugeReading, DecodedNwsPoint } from './frame';
import { floodSeverity, type FloodStatus } from './flood-status';
import { componentOf, projectComponent, type MapComponent } from './projection';

export type MapView = 'flow' | 'flooding';

export interface Site {
  key: string;
  kind: 'usgs' | 'nws';
  siteId: string | null;
  lid: string | null;
  name: string;
  stateCode: string | null;
  waterbody: string | null;
  curated: boolean;
  lng: number;
  lat: number;
  component: MapComponent;
  /** Landscape-frame position. */
  x: number;
  y: number;
  reading: DecodedGaugeReading | null;
  nws: DecodedNwsPoint | null;
}

/** USGS stations from the catalog, plus NWS points no USGS station claims. */
export function buildSites(catalog: CatalogStation[], frame: DecodedFrame | null): Site[] {
  const sites: Site[] = [];
  const claimed = new Set<string>();
  for (const s of catalog) {
    const component = componentOf(s.lng, s.lat);
    const [x, y] = projectComponent(component, s.lng, s.lat);
    const nws = frame?.nwsBySite.get(s.siteId) ?? null;
    if (nws) claimed.add(nws.lid);
    sites.push({
      key: `usgs:${s.siteId}`,
      kind: 'usgs',
      siteId: s.siteId,
      lid: nws?.lid ?? null,
      name: s.name,
      stateCode: s.stateCode,
      waterbody: s.waterbody,
      curated: s.curated,
      lng: s.lng,
      lat: s.lat,
      component,
      x,
      y,
      reading: frame?.gauges.get(s.siteId) ?? null,
      nws,
    });
  }
  for (const p of frame?.nws ?? []) {
    if (claimed.has(p.lid)) continue;
    // A crosswalked point whose USGS station is missing from the catalog is
    // still a real forecast point; draw it as NWS rather than lose it.
    const component = componentOf(p.lng, p.lat);
    const [x, y] = projectComponent(component, p.lng, p.lat);
    sites.push({
      key: `nws:${p.lid}`,
      kind: 'nws',
      siteId: p.usgsSiteId,
      lid: p.lid,
      name: p.name || p.lid,
      stateCode: null,
      waterbody: null,
      curated: false,
      lng: p.lng,
      lat: p.lat,
      component,
      x,
      y,
      reading: null,
      nws: p,
    });
  }
  return sites;
}

// ── Freshness ───────────────────────────────────────────────────────────────

/** A station silent this long is dormant: kept in search and totals, not drawn nationally. */
export const DORMANT_AFTER_MS = 30 * 86_400_000;

export type ReadingState = 'live' | 'stale' | 'suspect' | 'dormant' | 'none';

export function readingState(r: DecodedGaugeReading | null, clock: number): ReadingState {
  if (!r || r.observedAt === null) return 'none';
  if (clock - r.observedAt > DORMANT_AFTER_MS) return 'dormant';
  const fresh = gaugeFreshness(new Date(r.observedAt).toISOString(), clock);
  if (fresh !== 'live') return 'stale';
  if (r.suspect) return 'suspect';
  return 'live';
}

// ── Flow view ───────────────────────────────────────────────────────────────

export type FlowClass = FlowBand | 'no_comparison' | 'stale' | 'dormant' | 'hidden';

export function classifyFlow(site: Site, clock: number): FlowClass {
  if (site.kind === 'nws') return 'hidden'; // no discharge, no seasonal record
  const state = readingState(site.reading, clock);
  if (state === 'none' || state === 'dormant') return 'dormant';
  if (state === 'stale' || state === 'suspect') return 'stale';
  // Live and trustworthy. The percentile was gated for record length when it
  // was computed (sync-gauge-latest: seasonalBandEligible), so a null here is
  // "no comparison", never "normal".
  return flowBand(site.reading!.flowPercentile) ?? 'no_comparison';
}

// ── Flooding view ───────────────────────────────────────────────────────────

export type FloodClass =
  | 'major'
  | 'moderate'
  | 'minor'
  | 'action'
  | 'below'
  | 'no_threshold'
  | 'not_current'
  | 'no_nws'
  | 'hidden';

/** NWS observations older than this are not current, whatever the layer said at capture. */
export const NWS_STALE_MS = 6 * 3_600_000;

export function classifyFlood(site: Site, clock: number, noaaOk: boolean): FloodClass {
  if (!noaaOk) return site.kind === 'usgs' ? 'no_nws' : 'hidden';
  const p = site.nws;
  if (!p) {
    // A USGS gauge with no NWS forecast point: drawn as quiet network context,
    // never as "no flooding". Dormant ones stay off the national picture.
    return readingState(site.reading, clock) === 'dormant' || site.reading === null ? 'hidden' : 'no_nws';
  }
  const status: FloodStatus = p.observed;
  if (status === 'out_of_service' || status === 'not_current' || status === 'unknown') return 'not_current';
  if (status === 'not_defined') return 'no_threshold';
  if (p.observedAt !== null && clock - p.observedAt > NWS_STALE_MS) return 'not_current';
  if (status === 'major' || status === 'moderate' || status === 'minor' || status === 'action') return status;
  return 'below'; // no_flooding, low_threshold
}

// ── Draw style ──────────────────────────────────────────────────────────────

/**
 * `cross` is unavailable data (USGS not current or flagged; NWS not current):
 * a small ×, so "we have no current reading" never looks like "live reading,
 * no seasonal comparison" (a ring).
 */
export type MarkShape = 'dot' | 'ring' | 'diamond' | 'triangle' | 'cross';

export interface MarkStyle {
  shape: MarkShape;
  /** Radius in CSS px at the national fit; the renderer scales it with zoom. */
  radius: number;
  /** Palette key (theme.ts) resolved by the renderer. */
  color: string;
  keyline: boolean;
  /** Higher draws later (on top). A flood gauge is never under a normal one. */
  salience: number;
  /** Event ring eligible (flooding only). */
  ring: boolean;
  /** Drawn only once zoomed past the national fit by this factor. */
  minZoom: number;
  /** Opacity of the whole mark (default 1). Wall mode quiets routine gauges with it. */
  alpha?: number;
  /** A knockout disc in the background colour, so neighbouring events stay separate. */
  halo?: boolean;
}

/**
 * The rarest readings are drawn larger and above the other bands, so a
 * handful of exceptional gauges interrupt the field across a room.
 *
 * The cut is the outermost PUBLISHED threshold, not a finer percentile: USGS
 * daily statistics publish p05 and p95 and nothing beyond, and
 * calculateDischargePercentile (src/lib/usgs/gauges.ts) returns ≥ 95 only for
 * a reading at or above the published p95 (≤ 5 only at or below p05). So an
 * extreme mark claims exactly "at or above the 95th-percentile flow for this
 * date" — never a position past it. In the Eddy colours size is the only cue;
 * the vivid prototype also gives the rarest highs their own colour (theme.ts).
 */
export const EXTREME_HIGH = 95;
export const EXTREME_LOW = 5;

const FLOW_EXTREME: Record<'much_higher' | 'much_lower', MarkStyle> = {
  much_higher: { shape: 'dot', radius: 2.9, color: 'flowExtremeHigh', keyline: true, salience: 6, ring: false, minZoom: 0 },
  much_lower: { shape: 'dot', radius: 2.9, color: 'flow.much_lower', keyline: true, salience: 6, ring: false, minZoom: 0 },
};

export function isExtreme(site: Site): boolean {
  const p = site.reading?.flowPercentile;
  return p !== null && p !== undefined && (p >= EXTREME_HIGH || p <= EXTREME_LOW);
}

const FLOW_STYLE: Record<FlowClass, MarkStyle | null> = {
  normal: { shape: 'dot', radius: 1.05, color: 'flow.normal', keyline: true, salience: 3, ring: false, minZoom: 0 },
  lower: { shape: 'dot', radius: 1.45, color: 'flow.lower', keyline: true, salience: 4, ring: false, minZoom: 0 },
  higher: { shape: 'dot', radius: 1.45, color: 'flow.higher', keyline: true, salience: 4, ring: false, minZoom: 0 },
  much_lower: { shape: 'dot', radius: 2.1, color: 'flow.much_lower', keyline: true, salience: 5, ring: false, minZoom: 0 },
  much_higher: { shape: 'dot', radius: 2.1, color: 'flow.much_higher', keyline: true, salience: 5, ring: false, minZoom: 0 },
  no_comparison: { shape: 'ring', radius: 1.05, color: 'noComparison', keyline: false, salience: 2, ring: false, minZoom: 0 },
  stale: { shape: 'cross', radius: 1.05, color: 'stale', keyline: false, salience: 1, ring: false, minZoom: 0 },
  dormant: { shape: 'cross', radius: 1, color: 'stale', keyline: false, salience: 0, ring: false, minZoom: 3 },
  hidden: null,
};

const FLOOD_STYLE: Record<FloodClass, MarkStyle | null> = {
  major: { shape: 'triangle', radius: 4.4, color: 'flood.major', keyline: true, salience: 9, ring: true, minZoom: 0 },
  moderate: { shape: 'diamond', radius: 3.7, color: 'flood.moderate', keyline: true, salience: 8, ring: true, minZoom: 0 },
  minor: { shape: 'dot', radius: 3.1, color: 'flood.minor', keyline: true, salience: 7, ring: true, minZoom: 0 },
  action: { shape: 'ring', radius: 2.6, color: 'flood.action', keyline: true, salience: 6, ring: false, minZoom: 0 },
  below: { shape: 'dot', radius: 0.85, color: 'flood.below', keyline: false, salience: 3, ring: false, minZoom: 0 },
  no_threshold: { shape: 'ring', radius: 0.95, color: 'flood.noThreshold', keyline: false, salience: 2, ring: false, minZoom: 0 },
  not_current: { shape: 'cross', radius: 1.05, color: 'flood.notCurrent', keyline: false, salience: 1, ring: false, minZoom: 0 },
  no_nws: { shape: 'dot', radius: 0.75, color: 'flood.noThreshold', keyline: false, salience: 0, ring: false, minZoom: 0 },
  hidden: null,
};

// ── Wall (fullscreen) styles ────────────────────────────────────────────────
// Same classes, same colours, same shapes — so the legend still reads — but a
// different hierarchy for a screen seen across a room:
//   * Unavailable and unknown data leave the wall entirely (no comparison,
//     not current, no threshold, no NWS point). Explore keeps all of them.
//   * Routine readings (normal, below flood stage) become small, translucent
//     texture under the river network instead of a carpet over it.
//   * Events grow, sit on a knockout halo so a cluster stays countable, and
//     carry the expanding rings. Action stage — not flooding — becomes a slim
//     ring with no keyline, deliberately below minor flooding.
// Thresholds are untouched: classification is identical, only drawing differs.

const WALL_FLOW_STYLE: Record<FlowClass, MarkStyle | null> = {
  normal: { shape: 'dot', radius: 0.8, color: 'flow.normal', keyline: false, salience: 3, ring: false, minZoom: 0, alpha: 0.5 },
  lower: { shape: 'dot', radius: 1.25, color: 'flow.lower', keyline: false, salience: 4, ring: false, minZoom: 0, alpha: 0.85 },
  higher: { shape: 'dot', radius: 1.25, color: 'flow.higher', keyline: false, salience: 4, ring: false, minZoom: 0, alpha: 0.85 },
  much_lower: { shape: 'dot', radius: 2.2, color: 'flow.much_lower', keyline: true, salience: 5, ring: false, minZoom: 0 },
  much_higher: { shape: 'dot', radius: 2.2, color: 'flow.much_higher', keyline: true, salience: 5, ring: false, minZoom: 0 },
  no_comparison: null,
  stale: null,
  dormant: null,
  hidden: null,
};

const WALL_FLOW_EXTREME: Record<'much_higher' | 'much_lower', MarkStyle> = {
  much_higher: { shape: 'dot', radius: 3.4, color: 'flowExtremeHigh', keyline: true, salience: 6, ring: false, minZoom: 0, halo: true },
  much_lower: { shape: 'dot', radius: 3.4, color: 'flow.much_lower', keyline: true, salience: 6, ring: false, minZoom: 0, halo: true },
};

const WALL_FLOOD_STYLE: Record<FloodClass, MarkStyle | null> = {
  major: { shape: 'triangle', radius: 6.2, color: 'flood.major', keyline: true, salience: 9, ring: true, minZoom: 0, halo: true },
  moderate: { shape: 'diamond', radius: 5.2, color: 'flood.moderate', keyline: true, salience: 8, ring: true, minZoom: 0, halo: true },
  minor: { shape: 'dot', radius: 4.3, color: 'flood.minor', keyline: true, salience: 7, ring: true, minZoom: 0, halo: true },
  action: { shape: 'ring', radius: 2.1, color: 'flood.action', keyline: false, salience: 6, ring: false, minZoom: 0, alpha: 0.8 },
  below: { shape: 'dot', radius: 0.75, color: 'flood.below', keyline: false, salience: 3, ring: false, minZoom: 0, alpha: 0.45 },
  no_threshold: null,
  not_current: null,
  no_nws: null,
  hidden: null,
};

/** The wall's style for a class (null: not drawn on the wall). */
export function wallStyle(view: MapView, c: FlowClass | FloodClass, extreme = false): MarkStyle | null {
  if (view === 'flow') {
    if (extreme && (c === 'much_higher' || c === 'much_lower')) return WALL_FLOW_EXTREME[c];
    return WALL_FLOW_STYLE[c as FlowClass];
  }
  return WALL_FLOOD_STYLE[c as FloodClass];
}

/** The rarest-high mark (Explore), for the legend. */
export function flowExtremeHighStyle(): MarkStyle {
  return FLOW_EXTREME.much_higher;
}

export function flowStyle(c: FlowClass): MarkStyle | null {
  return FLOW_STYLE[c];
}

export function floodStyle(c: FloodClass): MarkStyle | null {
  return FLOOD_STYLE[c];
}

export interface ClassifiedSite {
  index: number;
  cls: FlowClass | FloodClass;
  style: MarkStyle;
}

/**
 * Every drawable site for a view, sorted so the most salient draw last. Sorting
 * (not clustering) is how a major flood gauge survives a dense neighborhood:
 * nothing is averaged away, and nothing is drawn over it.
 *
 * `wall` (fullscreen) draws the same classes with the wall hierarchy and
 * leaves unknown / unavailable data out (see WALL_FLOW_STYLE).
 */
export function classifySites(sites: Site[], view: MapView, clock: number, noaaOk: boolean, wall = false): ClassifiedSite[] {
  const out: ClassifiedSite[] = [];
  sites.forEach((site, index) => {
    const cls = view === 'flow' ? classifyFlow(site, clock) : classifyFlood(site, clock, noaaOk);
    const extreme = view === 'flow' && (cls === 'much_higher' || cls === 'much_lower') && isExtreme(site);
    const style = wall
      ? wallStyle(view, cls, extreme)
      : view === 'flow'
        ? extreme
          ? FLOW_EXTREME[cls as 'much_higher' | 'much_lower']
          : flowStyle(cls as FlowClass)
        : floodStyle(cls as FloodClass);
    if (style) out.push({ index, cls, style });
  });
  return out.sort((a, b) => a.style.salience - b.style.salience);
}

// ── Explore summaries (the denominators the plan requires) ──────────────────

export interface FlowSummary {
  stations: number;
  live: number;
  compared: number;
  bands: Record<FlowBand, number>;
  noComparison: number;
  stale: number;
  dormant: number;
  /** Of `bands.much_higher`: the rarest highs (≥ EXTREME_HIGH), drawn larger. */
  extremeHigh: number;
}

export function summarizeFlow(sites: Site[], clock: number): FlowSummary {
  const s: FlowSummary = {
    stations: 0,
    live: 0,
    compared: 0,
    bands: { much_lower: 0, lower: 0, normal: 0, higher: 0, much_higher: 0 },
    noComparison: 0,
    stale: 0,
    dormant: 0,
    extremeHigh: 0,
  };
  for (const site of sites) {
    if (site.kind !== 'usgs') continue;
    s.stations++;
    const c = classifyFlow(site, clock);
    if (c === 'dormant') s.dormant++;
    else if (c === 'stale') s.stale++;
    else if (c === 'no_comparison') {
      s.live++;
      s.noComparison++;
    } else if (c !== 'hidden') {
      s.live++;
      s.compared++;
      s.bands[c]++;
      if (c === 'much_higher' && isExtreme(site)) s.extremeHigh++;
    }
  }
  return s;
}

export interface FloodSummary {
  nwsPoints: number;
  /** Points with a defined threshold and a current observation — the denominator. */
  assessed: number;
  major: number;
  moderate: number;
  minor: number;
  action: number;
  noThreshold: number;
  notCurrent: number;
}

export function summarizeFlood(sites: Site[], clock: number, noaaOk: boolean): FloodSummary {
  const s: FloodSummary = { nwsPoints: 0, assessed: 0, major: 0, moderate: 0, minor: 0, action: 0, noThreshold: 0, notCurrent: 0 };
  if (!noaaOk) return s;
  for (const site of sites) {
    if (!site.nws) continue;
    s.nwsPoints++;
    const c = classifyFlood(site, clock, noaaOk);
    if (c === 'no_threshold') s.noThreshold++;
    else if (c === 'not_current') s.notCurrent++;
    else {
      s.assessed++;
      if (c === 'major') s.major++;
      else if (c === 'moderate') s.moderate++;
      else if (c === 'minor') s.minor++;
      else if (c === 'action') s.action++;
    }
  }
  return s;
}

// ── Highlights: a few meaningful events, spread across the country ─────────
// The wall display moves its emphasis between these. Ranking by extremity
// alone repeatedly picked neighbouring gauges telling one story (a single
// basin's flood, one state's dry spell), so selection is greedy by score with
// a minimum separation in the composite frame — different places, different
// stories — and, in Flow, both ends of the scale when both exist.

/** Minimum distance between highlights, in landscape-frame px (~8% of the lower 48's width). */
export const HIGHLIGHT_SEPARATION = 70;

function highlightScore(site: Site, view: MapView, clock: number, noaaOk: boolean): number {
  if (view === 'flooding') {
    const c = classifyFlood(site, clock, noaaOk);
    if (c !== 'major' && c !== 'moderate' && c !== 'minor') return -1;
    return floodSeverity(site.nws!.observed) * 1000 + (site.reading?.flowPercentile ?? 50);
  }
  const c = classifyFlow(site, clock);
  if (c !== 'much_higher' && c !== 'much_lower') return -1;
  return Math.abs((site.reading?.flowPercentile ?? 50) - 50);
}

export function curateHighlights(
  sites: Site[],
  view: MapView,
  clock: number,
  noaaOk: boolean,
  limit = 6,
  separation = HIGHLIGHT_SEPARATION,
): Site[] {
  const scored = sites
    .map((site) => ({ site, score: highlightScore(site, view, clock, noaaOk) }))
    .filter((c) => c.score >= 0)
    .sort((a, b) => b.score - a.score || a.site.key.localeCompare(b.site.key));
  const picked: Site[] = [];
  const far = (s: Site) => picked.every((p) => p.component !== s.component || Math.hypot(p.x - s.x, p.y - s.y) >= separation);
  // Flow: lead with the strongest wet and the strongest dry event, so a quiet
  // day still shows contrast rather than six variations of one end.
  if (view === 'flow') {
    for (const wet of [true, false]) {
      const best = scored.find((c) => ((c.site.reading?.flowPercentile ?? 50) >= 50) === wet);
      if (best && picked.length < limit) picked.push(best.site);
    }
  }
  for (const c of scored) {
    if (picked.length >= limit) break;
    if (!picked.includes(c.site) && far(c.site)) picked.push(c.site);
  }
  return picked;
}

// ── Liveness per view ───────────────────────────────────────────────────────
// Motion means "this is current". It must be judged for the view on screen:
// fresh USGS readings say nothing about a Flooding view whose NOAA capture
// failed, and the text-free display has no words to say so — it has to look
// unavailable (static, subdued) instead.

export type LiveReason =
  | 'live'
  | 'no_frame'
  | 'snapshot_old'
  | 'refresh_failed'
  | 'no_current_readings'
  | 'flood_unavailable'
  | 'flood_not_current';

export const LIVE_SNAPSHOT_MS = 2 * 3_600_000;

export function viewLiveState(args: {
  view: MapView;
  capturedAt: number | null;
  clock: number;
  refreshFailed: boolean;
  noaaOk: boolean;
  flowLive: number;
  floodAssessed: number;
}): LiveReason {
  if (args.capturedAt === null) return 'no_frame';
  if (args.clock - args.capturedAt >= LIVE_SNAPSHOT_MS) return 'snapshot_old';
  if (args.refreshFailed) return 'refresh_failed';
  if (args.view === 'flooding') {
    if (!args.noaaOk) return 'flood_unavailable';
    if (args.floodAssessed === 0) return 'flood_not_current';
    return 'live';
  }
  return args.flowLive > 0 ? 'live' : 'no_current_readings';
}

/** Short, plain status for the fullscreen tray and the details line when not live. */
export const LIVE_REASON_TEXT: Record<Exclude<LiveReason, 'live'>, string> = {
  no_frame: 'Live readings have not loaded yet',
  snapshot_old: 'Readings are older than expected',
  refresh_failed: 'Refresh failed — showing the last snapshot',
  no_current_readings: 'No gauges are reporting current readings',
  flood_unavailable: 'NWS flood status is unavailable right now',
  flood_not_current: 'NWS flood observations are not current',
};

