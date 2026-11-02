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

export type MarkShape = 'dot' | 'ring' | 'diamond' | 'triangle';

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
}

const FLOW_STYLE: Record<FlowClass, MarkStyle | null> = {
  normal: { shape: 'dot', radius: 1.05, color: 'flow.normal', keyline: false, salience: 3, ring: false, minZoom: 0 },
  lower: { shape: 'dot', radius: 1.45, color: 'flow.lower', keyline: true, salience: 4, ring: false, minZoom: 0 },
  higher: { shape: 'dot', radius: 1.45, color: 'flow.higher', keyline: true, salience: 4, ring: false, minZoom: 0 },
  much_lower: { shape: 'dot', radius: 1.9, color: 'flow.much_lower', keyline: true, salience: 5, ring: false, minZoom: 0 },
  much_higher: { shape: 'dot', radius: 1.9, color: 'flow.much_higher', keyline: true, salience: 5, ring: false, minZoom: 0 },
  no_comparison: { shape: 'ring', radius: 1.05, color: 'noComparison', keyline: false, salience: 2, ring: false, minZoom: 0 },
  stale: { shape: 'ring', radius: 0.95, color: 'stale', keyline: false, salience: 1, ring: false, minZoom: 0 },
  dormant: { shape: 'ring', radius: 0.9, color: 'stale', keyline: false, salience: 0, ring: false, minZoom: 3 },
  hidden: null,
};

const FLOOD_STYLE: Record<FloodClass, MarkStyle | null> = {
  major: { shape: 'triangle', radius: 4.4, color: 'flood.major', keyline: true, salience: 9, ring: true, minZoom: 0 },
  moderate: { shape: 'diamond', radius: 3.7, color: 'flood.moderate', keyline: true, salience: 8, ring: true, minZoom: 0 },
  minor: { shape: 'dot', radius: 3.1, color: 'flood.minor', keyline: true, salience: 7, ring: true, minZoom: 0 },
  action: { shape: 'ring', radius: 2.6, color: 'flood.action', keyline: false, salience: 6, ring: false, minZoom: 0 },
  below: { shape: 'dot', radius: 1.0, color: 'flood.below', keyline: false, salience: 3, ring: false, minZoom: 0 },
  no_threshold: { shape: 'ring', radius: 0.95, color: 'flood.noThreshold', keyline: false, salience: 2, ring: false, minZoom: 0 },
  not_current: { shape: 'ring', radius: 0.95, color: 'flood.notCurrent', keyline: false, salience: 1, ring: false, minZoom: 0 },
  no_nws: { shape: 'dot', radius: 0.75, color: 'flood.noThreshold', keyline: false, salience: 0, ring: false, minZoom: 0 },
  hidden: null,
};

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
 */
export function classifySites(sites: Site[], view: MapView, clock: number, noaaOk: boolean): ClassifiedSite[] {
  const out: ClassifiedSite[] = [];
  sites.forEach((site, index) => {
    const cls = view === 'flow' ? classifyFlow(site, clock) : classifyFlood(site, clock, noaaOk);
    const style = view === 'flow' ? flowStyle(cls as FlowClass) : floodStyle(cls as FloodClass);
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

/** Sites flooding now, most severe first — the Display-with-details rotation in Flooding. */
export function notableFlood(sites: Site[], clock: number, noaaOk: boolean, limit = 12): Site[] {
  return sites
    .filter((s) => {
      const c = classifyFlood(s, clock, noaaOk);
      return c === 'major' || c === 'moderate' || c === 'minor';
    })
    .sort((a, b) => floodSeverity(b.nws!.observed) - floodSeverity(a.nws!.observed) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** The most unusual live comparisons, both ends — the rotation in Flow. */
export function notableFlow(sites: Site[], clock: number, limit = 12): Site[] {
  const extremes = sites.filter((s) => {
    const c = classifyFlow(s, clock);
    return c === 'much_higher' || c === 'much_lower';
  });
  const dist = (s: Site) => Math.abs((s.reading?.flowPercentile ?? 50) - 50);
  return extremes.sort((a, b) => dist(b) - dist(a) || a.name.localeCompare(b.name)).slice(0, limit);
}

