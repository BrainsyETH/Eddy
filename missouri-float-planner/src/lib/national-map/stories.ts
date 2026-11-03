// src/lib/national-map/stories.ts
// The wall's featured event: which current development deserves attention
// next, and what can honestly be said about it.
//
// Selection weighs severity, RECENT CHANGE (against a recorded frame a few
// hours older), freshness, geographic variety and whether it has just been
// shown — so a new flood-category crossing wins attention, and an unchanged
// gauge does not win forever just because its reading is the most extreme.
// Nearby gauges describing the same development become ONE story.
//
// Every sentence is earned by data:
//   * "Now in", "Rose to" (above the category), "Back below flood stage" —
//     NWS's own observed category in both frames (quoted, never computed);
//   * "Still rising", "Crest passed" — the gauge's own 24-hour series, with
//     minimum-size rules so sensor noise never becomes a story;
//   * otherwise the category or flow band alone. No forecast is implied.
//
// Pure, no DOM.

import type { FloodStages } from './catalog';
import { CHANGE_LEGEND, changeSentence, changeStyle, type ChangeClass, type ChangeSummary, type ChangeWindow, type SiteChange } from './change';
import {
  classifyFlood,
  classifyFlow,
  HIGHLIGHT_SEPARATION,
  isExtreme,
  wallStyle,
  type FloodClass,
  type FloodSummary,
  type FlowSummary,
  type MarkStyle,
  type FlowClass,
  type MapView,
  type Site,
} from './marks';

const FLOOD_RANK: Partial<Record<FloodClass, number>> = { major: 4, moderate: 3, minor: 2, action: 1, below: 0 };

export type ChangeKind = 'new_flooding' | 'category_up' | 'back_below' | 'stage_rising' | 'stage_falling' | 'flow_shift';

export interface Change {
  kind: ChangeKind;
  /** The category now (flooding view). */
  to?: FloodClass;
  /** Stage change (ft) or percentile change, signed. */
  delta?: number;
  /** Hours between the two frames compared. */
  hours: number;
}

/** A stage change smaller than this between frames is not a development. */
export const STAGE_CHANGE_FT = 0.5;
/** A seasonal-percentile shift this large between frames is a development. */
export const FLOW_SHIFT_PCT = 15;

/** What changed at a site since the prior frame (null: nothing, or no prior). */
export function changeFor(site: Site, prior: Site | undefined, view: MapView, clock: number, priorClock: number, noaaOk: boolean): Change | null {
  if (!prior) return null;
  const hours = Math.max(1, Math.round((clock - priorClock) / 3_600_000));
  if (view === 'flooding') {
    const now = classifyFlood(site, clock, noaaOk);
    const then = classifyFlood(prior, priorClock, noaaOk);
    const a = FLOOD_RANK[then];
    const b = FLOOD_RANK[now];
    if (a !== undefined && b !== undefined) {
      if (a < 2 && b >= 2) return { kind: 'new_flooding', to: now, hours };
      if (b > a && b >= 2) return { kind: 'category_up', to: now, hours };
      if (a >= 2 && b < 2) return { kind: 'back_below', to: now, hours };
    }
    const h1 = site.reading?.gaugeHeightFt ?? null;
    const h0 = prior.reading?.gaugeHeightFt ?? null;
    if (h1 !== null && h0 !== null && b !== undefined && b >= 1) {
      const d = h1 - h0;
      if (d >= STAGE_CHANGE_FT) return { kind: 'stage_rising', delta: d, hours };
      if (d <= -STAGE_CHANGE_FT) return { kind: 'stage_falling', delta: d, hours };
    }
    return null;
  }
  const p1 = site.reading?.flowPercentile ?? null;
  const p0 = prior.reading?.flowPercentile ?? null;
  if (p1 !== null && p0 !== null && Math.abs(p1 - p0) >= FLOW_SHIFT_PCT) return { kind: 'flow_shift', delta: p1 - p0, hours };
  return null;
}

export interface Story {
  site: Site;
  cls: FlowClass | FloodClass | ChangeClass;
  change: Change | null;
  /** Change view: the measured change over the window, and that window. */
  windowChange?: { change: SiteChange; window: ChangeWindow };
  /** Other gauges nearby describing the same development. */
  nearby: number;
  score: number;
}

const CHANGE_BONUS: Record<ChangeKind, number> = {
  new_flooding: 3.5,
  category_up: 3,
  back_below: 2.5,
  stage_rising: 1,
  stage_falling: 0.3,
  flow_shift: 1.2,
};

export interface StoryInputs {
  sites: Site[];
  /** Prior-frame sites by key, and that frame's capture time; null when none is recorded. */
  prior: { sites: Map<string, Site>; capturedAt: number } | null;
  view: MapView;
  clock: number;
  noaaOk: boolean;
  /** Keys featured recently, oldest first. */
  recent: string[];
  /** Spacing in frame px (scaled for a regional view). */
  separation?: number;
}

/** Candidate stories, best first, nearby same-development gauges folded in. */
export function rankStories({ sites, prior, view, clock, noaaOk, recent, separation = HIGHLIGHT_SEPARATION }: StoryInputs): Story[] {
  const raw: Story[] = [];
  for (const site of sites) {
    const cls = view === 'flooding' ? classifyFlood(site, clock, noaaOk) : classifyFlow(site, clock);
    const change = prior ? changeFor(site, prior.sites.get(site.key), view, clock, prior.capturedAt, noaaOk) : null;
    let sev: number;
    if (view === 'flooding') {
      const rank = FLOOD_RANK[cls as FloodClass];
      if (rank === undefined) continue;
      if (rank === 0 && change?.kind !== 'back_below') continue;
      sev = cls === 'major' ? 4 : cls === 'moderate' ? 3 : cls === 'minor' ? 2 : cls === 'action' ? 0.8 : 1;
    } else {
      if (cls !== 'much_higher' && cls !== 'much_lower' && change?.kind !== 'flow_shift') continue;
      if (cls !== 'much_higher' && cls !== 'much_lower' && cls !== 'higher' && cls !== 'lower') continue;
      sev = isExtreme(site) ? 2.2 : cls === 'much_higher' || cls === 'much_lower' ? 1.4 : 0.6;
    }
    let score = sev + (change ? CHANGE_BONUS[change.kind] : 0);
    // A named USGS gauge can be told fully (river and place, a 24-hour
    // series); an unnamed one ("USGS 0916…") or an NWS-only point cannot.
    // A small nudge, never enough to beat a change.
    if (site.kind === 'usgs' && !/^USGS \d/.test(site.name)) score += 0.6;
    const observedAt = view === 'flooding' ? site.nws?.observedAt ?? site.reading?.observedAt : site.reading?.observedAt;
    if (observedAt != null && clock - observedAt > 3 * 3_600_000) score -= 1.5;
    const seen = recent.lastIndexOf(site.key);
    if (seen >= 0) score -= seen >= recent.length - 4 ? 5 : 2;
    raw.push({ site, cls, change, nearby: 0, score });
  }
  raw.sort((a, b) => b.score - a.score || a.site.key.localeCompare(b.site.key));
  // Fold nearby gauges telling the same story into their leader.
  const development = (s: Story) => s.change?.kind ?? `steady:${s.cls}`;
  const leaders: Story[] = [];
  const near = separation * 0.4;
  for (const s of raw) {
    const leader = leaders.find(
      (l) => l.site.component === s.site.component && development(l) === development(s) && Math.hypot(l.site.x - s.site.x, l.site.y - s.site.y) < near,
    );
    if (leader) leader.nearby++;
    else leaders.push(s);
  }
  for (const l of leaders) l.score += Math.min(1, 0.25 * l.nearby);
  // Variety: a story right beside the last featured one waits its turn.
  const last = recent.length ? sites.find((s) => s.key === recent[recent.length - 1]) : undefined;
  if (last) {
    for (const l of leaders) {
      if (l.site.key !== last.key && l.site.component === last.component && Math.hypot(l.site.x - last.x, l.site.y - last.y) < separation) l.score -= 2;
    }
  }
  return leaders.sort((a, b) => b.score - a.score || a.site.key.localeCompare(b.site.key));
}

// ── The 24-hour series ──────────────────────────────────────────────────────

export interface SeriesPoint {
  t: number;
  v: number;
}

export type SeriesDevelopment = 'rising' | 'crest_passed' | null;

/**
 * What a gauge's last 24 hours support saying, or null. Minimum sizes keep
 * noise out: a rise must be at least `tol` over three hours with the latest
 * reading at the day's high; a crest must be at least two hours old, with the
 * reading at least max(tol, 10% of the day's range) below it after a real rise.
 */
export function seriesDevelopment(points: SeriesPoint[], unit: 'ft' | 'cfs'): SeriesDevelopment {
  if (points.length < 6) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (last.t - first.t < 6 * 3_600_000) return null;
  let max = first;
  let min = first;
  for (const p of points) {
    if (p.v > max.v) max = p;
    if (p.v < min.v) min = p;
  }
  const range = max.v - min.v;
  const tol = unit === 'ft' ? 0.15 : Math.max(1, Math.abs(max.v) * 0.03);
  const before = [...points].reverse().find((p) => p.t <= last.t - 3 * 3_600_000);
  if (before && last.v - before.v >= tol && last.v >= max.v - tol / 2) return 'rising';
  if (last.t - max.t >= 2 * 3_600_000 && max.v - last.v >= Math.max(tol, range * 0.1) && max.v - first.v >= tol * 2) return 'crest_passed';
  return null;
}

// ── Words ───────────────────────────────────────────────────────────────────

const FLOOD_LABEL: Partial<Record<FloodClass, string>> = {
  major: 'Major flooding',
  moderate: 'Moderate flooding',
  minor: 'Minor flooding',
  action: 'Action stage',
  below: 'Below flood stage',
};
const FLOW_LABEL: Partial<Record<FlowClass, string>> = {
  much_higher: 'Much higher than usual',
  higher: 'Higher than usual',
  lower: 'Lower than usual',
  much_lower: 'Much lower than usual',
};

/**
 * Change view stories: the biggest trustworthy changes over the window —
 * flood crossings first, then by size — with the same recency, clustering and
 * variety rules as the other views.
 */
export function rankChangeStories({
  entries,
  window,
  recent,
  separation = HIGHLIGHT_SEPARATION,
}: {
  entries: Array<{ site: Site; change: SiteChange }>;
  window: ChangeWindow;
  recent: string[];
  separation?: number;
}): Story[] {
  const WORTH: Partial<Record<ChangeClass, number>> = { flood_up: 4, flood_down: 3, rising_fast: 2, falling_fast: 1.5, rising: 0.8, falling: 0.5 };
  const raw: Story[] = [];
  for (const { site, change } of entries) {
    const worth = WORTH[change.cls];
    if (worth === undefined) continue;
    let score = worth + Math.min(2, change.magnitude);
    if (site.kind === 'usgs' && !/^USGS \d/.test(site.name)) score += 0.6;
    const seen = recent.lastIndexOf(site.key);
    if (seen >= 0) score -= seen >= recent.length - 4 ? 5 : 2;
    raw.push({ site, cls: change.cls, change: null, nearby: 0, score, windowChange: { change, window } });
  }
  raw.sort((a, b) => b.score - a.score || a.site.key.localeCompare(b.site.key));
  const leaders: Story[] = [];
  for (const s of raw) {
    const leader = leaders.find(
      (l) => l.site.component === s.site.component && l.cls === s.cls && Math.hypot(l.site.x - s.site.x, l.site.y - s.site.y) < separation * 0.4,
    );
    if (leader) leader.nearby++;
    else leaders.push(s);
  }
  for (const l of leaders) l.score += Math.min(1, 0.25 * l.nearby);
  return leaders.sort((a, b) => b.score - a.score || a.site.key.localeCompare(b.site.key));
}

// ── NWS flood stages on the story chart ─────────────────────────────────────

/** How closely NWS stage and USGS gauge height must agree to share one chart. */
export const STAGE_DATUM_TOLERANCE_FT = 0.5;

/**
 * NWS's flood-category stages, but only when they can be drawn honestly on
 * the USGS gauge-height chart: the gauge's current NWS stage and USGS height
 * must agree within STAGE_DATUM_TOLERANCE_FT, in feet, observed within two
 * hours of each other. Some gauges report NWS stage on a different datum
 * (2026-11-02: 134 of 6,613 matched pairs differed by more than 2 ft, while
 * 6,367 agreed within 0.5 ft); for those, NWS's flood lines would be drawn at
 * the wrong height, so none are drawn.
 */
export function chartStages(site: Site): FloodStages | null {
  const stages = site.stages ?? null;
  const r = site.reading;
  const n = site.nws;
  if (!stages || !r || !n || r.gaugeHeightFt === null || n.observedValue === null) return null;
  if ((n.units ?? 'ft').toLowerCase() !== 'ft') return null;
  if (r.observedAt === null || n.observedAt === null || Math.abs(r.observedAt - n.observedAt) > 2 * 3_600_000) return null;
  return Math.abs(n.observedValue - r.gaugeHeightFt) <= STAGE_DATUM_TOLERANCE_FT ? stages : null;
}

// ── The card's lead ─────────────────────────────────────────────────────────

export interface StoryLead {
  /** The development, set apart above the status ("Now in", "Still rising"); null when none is supported. */
  kicker: string | null;
  /** The gauge's state in the map's own words ("Moderate flooding"). */
  status: string;
  /** The map's own mark for that state, so card, legend and map read alike. */
  style: MarkStyle | null;
}

/**
 * The card leads with what the map shows — the same symbol, colour and words
 * as the legend — and puts the development above it. The old single phrase
 * ("Now in moderate flooding") sat in a teal pill that looked the same for
 * every severity; the category now carries its own mark at title size.
 */
export function storyLead(story: Story, series: SeriesDevelopment, view: MapView): StoryLead {
  if (story.windowChange) {
    const c = story.windowChange.change;
    const label = CHANGE_LEGEND.find((e) => e.cls === c.cls)?.label ?? '';
    return { kicker: `Last ${story.windowChange.window === '6h' ? '6' : '24'} hours`, status: label, style: changeStyle(c) };
  }
  const c = story.change;
  let kicker: string | null = null;
  if (c?.kind === 'back_below') kicker = 'Back below flood stage';
  else if (c?.kind === 'new_flooding') kicker = 'Now in';
  else if (c?.kind === 'category_up') kicker = 'Rose to';
  else if (series === 'rising') kicker = 'Still rising';
  else if (series === 'crest_passed') kicker = 'Crest passed';
  const status = (view === 'flooding' ? FLOOD_LABEL[story.cls as FloodClass] : FLOW_LABEL[story.cls as FlowClass]) ?? '';
  const extreme = view === 'flow' && isExtreme(story.site);
  const style = view === 'flooding' ? wallStyle('flooding', story.cls as FloodClass) : wallStyle('flow', story.cls as FlowClass, extreme);
  return { kicker, status, style };
}

/** The observation without the status (the lead carries it): recent change, neighbours. */
export function storyDetails(story: Story): string[] {
  const parts: string[] = [];
  if (story.windowChange) {
    parts.push(changeSentence(story.windowChange.change, story.windowChange.window));
  }
  const c = story.change;
  if (c && (c.kind === 'stage_rising' || c.kind === 'stage_falling') && c.delta !== undefined) {
    parts.push(`${c.delta > 0 ? 'Up' : 'Down'} ${Math.abs(c.delta).toFixed(1)} ft in ${c.hours} h`);
  }
  if (story.nearby > 0) parts.push(`${story.nearby} nearby gauge${story.nearby === 1 ? '' : 's'} too`);
  return parts;
}

const ftFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const cfsFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * The reading as a number, and where it stands — against NWS flood stage
 * only where the datums agree (chartStages), against the published
 * percentile tails only at or beyond them. Otherwise just the number.
 */
export function storyStanding(site: Site, view: MapView, cls?: FlowClass | FloodClass | ChangeClass): { value: string; relation: string | null } | null {
  const r = site.reading;
  if (view !== 'flow') {
    const h = r?.gaugeHeightFt ?? null;
    if (h !== null) {
      const stages = chartStages(site);
      const flood = stages?.flood ?? null;
      // The stored thresholds can lag NWS's own: a relation that contradicts
      // the category NWS reports right now is not stated at all.
      const flooding = cls === 'minor' || cls === 'moderate' || cls === 'major';
      const agrees = flood === null || cls === undefined || (flooding ? h >= flood - 0.05 : cls === 'action' || cls === 'below' ? h < flood + 0.05 : true);
      if (flood !== null && agrees) {
        const d = h - flood;
        const rel =
          Math.abs(d) < 0.05
            ? `at flood stage (${ftFmt.format(flood)} ft)`
            : `${ftFmt.format(Math.abs(d))} ft ${d > 0 ? 'above' : 'below'} flood stage (${ftFmt.format(flood)} ft)`;
        return { value: `${ftFmt.format(h)} ft`, relation: rel };
      }
      return { value: `${ftFmt.format(h)} ft`, relation: null };
    }
    const n = site.nws;
    if (n?.observedValue != null && n.units) return { value: `${ftFmt.format(n.observedValue)} ${n.units}`, relation: null };
    return null;
  }
  const q = r?.dischargeCfs ?? null;
  if (q === null) return null;
  const p = r?.flowPercentile ?? null;
  const relation = p !== null && isExtreme(site) ? (p >= 50 ? 'at or above the 95th percentile for the date' : 'at or below the 5th percentile for the date') : null;
  return { value: `${cfsFmt.format(q)} cfs`, relation };
}

// ── A calm place ────────────────────────────────────────────────────────────

export interface CalmSummary {
  title: string;
  lines: string[];
  /** Flow: the five bands as shares of compared gauges, for a small bar. */
  bands?: Array<{ key: 'much_lower' | 'lower' | 'normal' | 'higher' | 'much_higher'; share: number; count: number }>;
}

const pct = (n: number, d: number) => `${Math.round((n / Math.max(1, d)) * 100)}%`;
const nf0 = new Intl.NumberFormat('en-US');

/**
 * Story mode when nothing in view deserves a story: say so, with the counts
 * that show it — never a forced event. Many states on most days have no
 * flooding and few unusual readings; "All quiet" is a true story too.
 */
export function calmSummary(
  view: MapView,
  { flow, flood, change, window, place }: { flow: FlowSummary | null; flood: FloodSummary | null; change: ChangeSummary | null; window: ChangeWindow | null; place: string | null },
): CalmSummary | null {
  const where = place ? ` in ${place}` : '';
  if (view === 'flooding') {
    if (!flood || !flood.assessed) return null;
    const flooding = flood.major + flood.moderate + flood.minor;
    if (flooding > 0 || flood.action > 0) return null;
    return {
      title: `No flooding${where}`,
      lines: [
        `All ${nf0.format(flood.assessed)} NWS forecast point${flood.assessed === 1 ? '' : 's'} with a current reading are below action stage.`,
      ],
    };
  }
  if (view === 'flow') {
    if (!flow || !flow.compared) return null;
    const b = flow.bands;
    const high = b.higher + b.much_higher;
    const low = b.lower + b.much_lower;
    const title =
      b.normal >= flow.compared / 2
        ? `Rivers near usual for the date${where}`
        : low > high
          ? `Rivers mostly lower than usual${where}`
          : `Rivers mostly higher than usual${where}`;
    return {
      title,
      lines: [
        `${nf0.format(flow.compared)} gauges compared: ${pct(b.normal, flow.compared)} normal for the date, ${pct(high, flow.compared)} higher, ${pct(low, flow.compared)} lower. None far outside the usual range.`,
      ],
      bands: (['much_lower', 'lower', 'normal', 'higher', 'much_higher'] as const).map((key) => ({ key, count: b[key], share: b[key] / flow.compared })),
    };
  }
  if (!change || !window || !change.compared) return null;
  const c = change.counts;
  return {
    title: `Little change in the last ${window === '6h' ? '6' : '24'} hours${where}`,
    lines: [
      `${pct(c.steady, change.compared)} of ${nf0.format(change.compared)} compared gauges about the same; ${nf0.format(c.rising + c.rising_fast)} rising, ${nf0.format(c.falling + c.falling_fast)} falling.`,
    ],
  };
}
