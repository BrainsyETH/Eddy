// eddy-ios/src/lib/floatHistoryDisplay.ts
// What the history card and the recap say about a saved float
// (docs/float-history-card-plan.md, phase 3). Pure, so the web suite can test
// every state the design must cover: untracked, partly tracked, no condition,
// a reading too old to rate, no put-in.
//
// The rules live in @eddy/conditions/float-recap; this only turns their
// answers into words. Nothing here claims more than the tracker measured:
// no "0.0 mi", no "under 10 minutes", no condition label on a stale reading.

import type { CompletedFloat } from '@eddy/conditions/float-archive';
import {
  exploredCopy,
  exploredMiles,
  floatBadge,
  floatCondition,
  floatTracking,
  pickFloatMood,
  riverExplored,
  riverLifetimeExplored,
  type FloatBadge,
  type FloatMood,
  type FloatTracking,
  type RiverExplored,
} from '@eddy/conditions/float-recap';
import { formatDuration } from './floatSession';

/** The design's mood names. Big water at Flood says so plainly instead. */
const MOOD_LINES: Record<FloatMood, string> = {
  'made-it': 'Made it!',
  'good-float': 'Good float',
  'quick-dip': 'Quick dip',
  'lazy-river': 'Lazy river',
  'big-water': 'Big water',
  rain: 'Rain on the river',
  chilly: 'Chilly one',
  scrape: 'Scrape & drag',
  'speed-run': 'Speed run',
};

export function moodLine(mood: FloatMood | null, trip: CompletedFloat): string | null {
  if (!mood) return null;
  if (mood === 'big-water' && floatCondition(trip)?.code === 'dangerous') return 'Flood stage';
  return MOOD_LINES[mood];
}

/** Recorded time as it is: "<1 min" below a minute, never a band. */
export function recordedDuration(ms: number): string {
  return ms > 0 && ms < 60_000 ? '<1 min' : formatDuration(Math.round(ms / 60_000));
}

function spokenDuration(ms: number): string {
  if (ms > 0 && ms < 60_000) return 'under a minute';
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '';
  const m = rest || !hours ? `${rest} ${rest === 1 ? 'minute' : 'minutes'}` : '';
  return [h, m].filter(Boolean).join(' ');
}

/** "the Current" for "Current River"; other names as they are. */
export function riverShortName(riverName: string): string {
  const short = riverName.replace(/\s+River$/i, '');
  return short === riverName ? riverName : `the ${short}`;
}

function routeTitle(trip: CompletedFloat): string {
  return trip.putInName ? `${trip.putInName} → ${trip.takeOutName}` : `To ${trip.takeOutName}`;
}

function sameYear(at: number, now: number): boolean {
  return new Date(at).getFullYear() === new Date(now).getFullYear();
}

function shortDate(at: number, now: number): string {
  return new Date(at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(sameYear(at, now) ? {} : { year: 'numeric' }),
  });
}

function longDate(at: number, now: number): string {
  return new Date(at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', ...(sameYear(at, now) ? {} : { year: 'numeric' }),
  });
}

/** "Flowing · 412 cfs": the condition and the reading it was rated on. */
function badgeText(badge: FloatBadge): string {
  return [badge.label, badge.cfsLabel ?? badge.ftLabel].filter(Boolean).join(' · ');
}

export interface HistoryCardModel {
  river: string;
  route: string;
  /** "Started on the water": only when a river position was confirmed. */
  startedOnWater: boolean;
  date: string;
  /** "9.8 mi · 4 hr 12 min", or "4 hr 12 min" with no distance to give. */
  stats: string;
  /** "GPS distance unavailable" or "Limited GPS tracking"; null when measured. */
  trackingNote: string | null;
  /** Only a current reading earns a badge on the card. */
  badge: (FloatBadge & { text: string }) | null;
  mood: FloatMood | null;
  moodLine: string | null;
  tracking: FloatTracking;
  accessibilityLabel: string;
}

export function historyCardModel(trip: CompletedFloat, now = Date.now()): HistoryCardModel {
  const tracking = floatTracking(trip);
  const mood = pickFloatMood(trip);
  const rated = floatBadge(trip);
  const badge = rated?.current ? { ...rated, text: badgeText(rated) } : null;
  const duration = recordedDuration(trip.elapsedMs);
  const distance = tracking === 'none' ? null : `${trip.distanceMiles.toFixed(1)} mi`;
  const trackingNote =
    tracking === 'none' ? 'GPS distance unavailable' : tracking === 'partial' ? 'Limited GPS tracking' : null;
  const line = moodLine(mood, trip);
  const spoken = [
    `${trip.riverName}.`,
    `${trip.putInName ? `${trip.putInName} to ${trip.takeOutName}` : `To ${trip.takeOutName}`}.`,
    `${longDate(trip.startedAt, now)}.`,
    distance
      ? `${trip.distanceMiles.toFixed(1)} miles, ${spokenDuration(trip.elapsedMs)}.`
      : `${spokenDuration(trip.elapsedMs)}.`,
    trackingNote ? `${trackingNote}.` : null,
    badge ? `${[badge.label, badge.cfsLabel ?? badge.ftLabel].filter(Boolean).join(', ')}.` : null,
    line ? `${line.replace(/!$/, '')}.` : null,
  ];
  return {
    river: trip.riverName,
    route: routeTitle(trip),
    startedOnWater: !trip.putInName && tracking !== 'none',
    date: shortDate(trip.startedAt, now),
    stats: distance ? `${distance} · ${duration}` : duration,
    trackingNote,
    badge,
    mood,
    moodLine: line,
    tracking,
    accessibilityLabel: spoken.filter(Boolean).join(' '),
  };
}

export interface RecapConditionModel {
  title: string;
  /** Present only for a current reading. */
  badge: (FloatBadge & { text: string }) | null;
  /** The readings, always shown: "412 cfs · 2.10 ft". */
  reading: string;
  gaugeName: string;
  /** "Reading 6 min before you started", or "…too old to rate" when not current. */
  age: string;
  /** The info tip: the station and what this reading is (and is not). */
  tip: string;
}

function relative(observedAt: string, startedAt: number): string {
  const minutes = Math.round((startedAt - Date.parse(observedAt)) / 60_000);
  if (Math.abs(minutes) < 1) return 'Reading taken as you started';
  const span = recordedDuration(Math.abs(minutes) * 60_000);
  return minutes > 0 ? `Reading ${span} before you started` : `Reading ${span} after you started`;
}

/** The one reading the recap shows (plan 2a): the Start snapshot, the server's fallback, or an unrated reading. */
export function recapConditionModel(trip: CompletedFloat): RecapConditionModel | null {
  const condition = floatCondition(trip);
  if (condition) {
    const rated = floatBadge(trip);
    const reading = [rated?.cfsLabel, rated?.ftLabel].filter(Boolean).join(' · ');
    return {
      title: 'Conditions at start',
      badge: rated?.current ? { ...rated, text: badgeText(rated) } : null,
      reading,
      gaugeName: condition.gaugeName,
      age: condition.current
        ? relative(condition.observedAt, trip.startedAt)
        : `${relative(condition.observedAt, trip.startedAt)}, too old to rate`,
      tip: [
        condition.usgsSiteId ? `USGS ${condition.usgsSiteId}.` : null,
        condition.source === 'start'
          ? 'The gauge that set Eddy’s condition when you started. It can sit below your put-in: Eddy rates a float by the worst gauge on the stretch.'
          : 'The nearest upstream gauge near your start time, not a measurement along the whole route.',
        `Observed ${new Date(condition.observedAt).toLocaleString('en-US')}.`,
      ].filter(Boolean).join(' '),
    };
  }
  const water = trip.water;
  if (!water) return null;
  const reading = [
    water.dischargeCfs == null ? null : `${Math.round(water.dischargeCfs).toLocaleString('en-US')} cfs`,
    water.heightFt == null ? null : `${water.heightFt.toFixed(2)} ft`,
  ].filter(Boolean).join(' · ');
  return {
    title: 'Water at the start',
    badge: null,
    reading,
    gaugeName: water.gaugeName,
    age: relative(water.observedAt, trip.startedAt),
    tip: `An upstream gauge reading near your start time, not a measurement along the whole route. Observed ${new Date(water.observedAt).toLocaleString('en-US')}.`,
  };
}

export interface RecapExploredModel {
  explored: RiverExplored;
  miles: string;
  share: string;
  /** "mi 52.1–61.9": the stretch this float covered. */
  range: string;
  /** Earlier floats on this river, for the strip's shading. Null with none. */
  earlier: RiverExplored | null;
  lifetime: string | null;
}

/** River explored for one float, with its river's lifetime line when there were earlier floats. */
export function recapExploredModel(trip: CompletedFloat, history: readonly CompletedFloat[]): RecapExploredModel | null {
  const explored = riverExplored(trip);
  if (!explored) return null;
  const name = riverShortName(trip.riverName);
  const copy = exploredCopy(explored, name);
  const span = explored.span;
  const length = span.lastMile - span.firstMile;
  const first = explored.segments[0].start * length + span.firstMile;
  const last = explored.segments[explored.segments.length - 1].end * length + span.firstMile;
  const others = history.filter((t) => t.id !== trip.id && t.riverSlug === trip.riverSlug);
  const earlier = others.length ? riverLifetimeExplored(others, trip.riverSlug) : null;
  const lifetime = earlier ? riverLifetimeExplored([...others, trip], trip.riverSlug) : null;
  return {
    explored,
    miles: copy.miles,
    share: copy.share,
    range: `mi ${first.toFixed(1)}–${last.toFixed(1)}`,
    earlier,
    lifetime: lifetime
      ? `${exploredMiles(lifetime.miles)} of ${name}’s ${(lifetime.span.lastMile - lifetime.span.firstMile).toFixed(0)} float miles explored`
      : null,
  };
}

/** What was confirmed, never implied by the mood. */
export function arrivalLine(trip: CompletedFloat): string {
  return trip.reachedTakeOut ? `Reached ${trip.takeOutName}` : `Arrival at ${trip.takeOutName} not confirmed`;
}
