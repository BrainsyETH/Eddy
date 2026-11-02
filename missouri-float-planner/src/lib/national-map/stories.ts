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
//   * "Now flooding", "Rose to … flooding", "Back below flood stage" — NWS's
//     own observed category in both frames (quoted, never computed);
//   * "Still rising", "Crest passed" — the gauge's own 24-hour series, with
//     minimum-size rules so sensor noise never becomes a story;
//   * otherwise the category or flow band alone. No forecast is implied.
//
// Pure, no DOM.

import { changeSentence, type ChangeClass, type ChangeWindow, type SiteChange } from './change';
import {
  classifyFlood,
  classifyFlow,
  HIGHLIGHT_SEPARATION,
  isExtreme,
  type FloodClass,
  type FlowClass,
  type MapView,
  type Site,
} from './marks';

const FLOOD_RANK: Partial<Record<FloodClass, number>> = { major: 4, moderate: 3, minor: 2, action: 1, below: 0 };
const FLOOD_WORD: Record<'major' | 'moderate' | 'minor', string> = { major: 'major', moderate: 'moderate', minor: 'minor' };

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

/** The story's headline: the development when one is supported, else null. */
export function storyHeadline(story: Story, series: SeriesDevelopment): string | null {
  const c = story.change;
  if (c?.kind === 'back_below') return 'Back below flood stage';
  if (c?.kind === 'new_flooding' && c.to && c.to in FLOOD_WORD) return `Now in ${FLOOD_WORD[c.to as 'major']} flooding`;
  if (c?.kind === 'category_up' && c.to && c.to in FLOOD_WORD) return `Rose to ${FLOOD_WORD[c.to as 'major']} flooding`;
  if (series === 'rising') return 'Still rising';
  if (series === 'crest_passed') return 'Crest passed';
  return null;
}

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

/**
 * The one short observation under the name: the category or band, a measured
 * change between frames when there is one, and how many nearby gauges show
 * the same development.
 */
export function storyObservation(story: Story, view: MapView): string {
  if (story.windowChange) {
    const sentence = changeSentence(story.windowChange.change, story.windowChange.window);
    return story.nearby > 0 ? `${sentence} ${story.nearby} nearby gauge${story.nearby === 1 ? '' : 's'} too.` : sentence;
  }
  const label = (view === 'flooding' ? FLOOD_LABEL[story.cls as FloodClass] : FLOW_LABEL[story.cls as FlowClass]) ?? '';
  const parts = [label];
  const c = story.change;
  if (c && (c.kind === 'stage_rising' || c.kind === 'stage_falling') && c.delta !== undefined) {
    parts.push(`${c.delta > 0 ? 'up' : 'down'} ${Math.abs(c.delta).toFixed(1)} ft in ${c.hours} h`);
  }
  if (story.nearby > 0) parts.push(`${story.nearby} nearby gauge${story.nearby === 1 ? '' : 's'} too`);
  return parts.filter(Boolean).join(' · ');
}
