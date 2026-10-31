// eddy-ios/src/lib/floatHistoryDisplay.ts
// What the history card and the recap say about a saved float
// (docs/float-history-card-plan.md, phase 3). Pure, so the web suite can test
// every state the design must cover: untracked, partly tracked, no condition,
// a reading too old to rate, no put-in.
//
// The rules live in @eddy/conditions/float-recap; this only turns their
// answers into words. Nothing here claims more than the tracker measured:
// no "0.0 mi", no "under 10 minutes", no condition label on a stale reading.
//
// The figure a float leads with is the stretch it took: the river miles the
// tracker credited (river explored), never a distance "paddled". Distance is
// gross and includes credited gaps nobody observed; the stretch is what the
// paddler did. Only a float with no credited river at all (an older build)
// falls back to its tracked distance, named as such.

import type { CompletedFloat } from '@eddy/conditions/float-archive';
import {
  exploredCopy,
  exploredMiles,
  floatBadge,
  floatCondition,
  floatMoodLabel,
  floatTracking,
  floatWeather,
  pickFloatMood,
  riverExplored,
  riverLifetimeExplored,
  riverShortName,
  type FloatBadge,
  type FloatMood,
  type FloatTracking,
  type RiverExplored,
} from '@eddy/conditions/float-recap';
import { formatDuration } from './floatSession';
import { weatherDescription } from '../theme/weather';

export { riverShortName };

export function moodLine(mood: FloatMood | null, trip: CompletedFloat): string | null {
  return floatMoodLabel(mood, floatCondition(trip)?.code ?? null);
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

function routeTitle(trip: CompletedFloat): string {
  return trip.putInName ? `${trip.putInName} → ${trip.takeOutName}` : `To ${trip.takeOutName}`;
}

function sameYear(at: number, now: number): boolean {
  return new Date(at).getFullYear() === new Date(now).getFullYear();
}

/** "Oct 26", with the year once it is not this one. The card and the recap both use it. */
export function floatDate(at: number, now = Date.now()): string {
  return shortDate(at, now);
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

/** The stretch a float took, as the card and the recap lead with it. */
export interface FloatStretch {
  /** "9.6" (river miles explored) or "9.8" (an older float's tracked distance). */
  value: string;
  unit: 'river mi' | 'mi';
  /** "River explored", or "Tracked distance" for a float with no credited river. */
  label: string;
  /** "9.6 river miles" / "9.8 miles tracked", for VoiceOver. */
  spoken: string;
}

/**
 * River explored first. A float whose credited river cannot be placed (an
 * older build with no intervals, too many to keep, no span) keeps its tracked
 * distance, named as such. Null when nothing was measured, or when the
 * tracker placed the float but credited no river at all.
 */
export function floatStretch(trip: CompletedFloat): FloatStretch | null {
  if (floatTracking(trip) === 'none') return null;
  const explored = riverExplored(trip);
  if (explored) {
    const miles = exploredMiles(explored.miles);
    return { value: miles, unit: 'river mi', label: 'River explored', spoken: `${miles} river miles` };
  }
  if (Array.isArray(trip.coveredMiles) && trip.coveredMiles.length === 0) return null;
  const miles = trip.distanceMiles.toFixed(1);
  return { value: miles, unit: 'mi', label: 'Tracked distance', spoken: `${miles} miles tracked` };
}

export interface HistoryCardModel {
  river: string;
  route: string;
  /** "Started on the water": only when a river position was confirmed. */
  startedOnWater: boolean;
  date: string;
  /** "9.6 river mi · 4 hr 12 min", or "4 hr 12 min" with no stretch to give. */
  stats: string;
  /** "GPS tracking unavailable" or "Limited GPS tracking"; null when measured. */
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
  const stretch = floatStretch(trip);
  const trackingNote =
    tracking === 'none' ? 'GPS tracking unavailable' : tracking === 'partial' ? 'Limited GPS tracking' : null;
  const line = moodLine(mood, trip);
  const spoken = [
    `${trip.riverName}.`,
    `${trip.putInName ? `${trip.putInName} to ${trip.takeOutName}` : `To ${trip.takeOutName}`}.`,
    `${longDate(trip.startedAt, now)}.`,
    stretch ? `${stretch.spoken}, ${spokenDuration(trip.elapsedMs)}.` : `${spokenDuration(trip.elapsedMs)}.`,
    trackingNote ? `${trackingNote}.` : null,
    badge ? `${[badge.label, badge.cfsLabel ?? badge.ftLabel].filter(Boolean).join(', ')}.` : null,
    line ? `${line.replace(/!$/, '')}.` : null,
  ];
  return {
    river: trip.riverName,
    route: routeTitle(trip),
    startedOnWater: !trip.putInName && tracking !== 'none',
    date: shortDate(trip.startedAt, now),
    stats: stretch ? `${stretch.value} ${stretch.unit} · ${duration}` : duration,
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

/** Only the saved observation near Start, never today's weather or a forecast. */
export function recapWeatherModel(trip: CompletedFloat) {
  const weather = floatWeather(trip);
  if (!weather) return null;
  return {
    temperature: Math.round(weather.tempF) + '°F',
    icon: weather.conditionIcon ?? null,
    description: weather.conditionIcon ? weatherDescription(weather.conditionIcon) : null,
    tip: 'Weather near your start. Observed ' + new Date(weather.observedAt).toLocaleString('en-US') + '.',
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
  // Earlier means earlier: an old recap shades the floats before it, and its
  // lifetime line counts up to and including this float, as of that day.
  const others = history.filter((t) => t.id !== trip.id && t.riverSlug === trip.riverSlug && t.startedAt < trip.startedAt);
  // Shaded on this float's strip, so measured against this float's span: the
  // earlier floats' own spans can differ after access-point corrections, and
  // their fractions of those spans would land at the wrong miles here.
  const earlier = others.length ? riverLifetimeExplored(others, trip.riverSlug, span) : null;
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

/** The share sheet's title: the river and the route, as the card reads. */
export function floatShareTitle(trip: CompletedFloat): string {
  return `${trip.riverName}: ${routeTitle(trip)}`;
}

/**
 * The river page link the share route returns in X-Eddy-Share-Path, or null
 * for anything that is not a web river path: a missing header (an older
 * server) shares the image with its title alone, never an app route.
 */
export function floatShareLink(header: string | null): string | null {
  return header && /^\/rivers\/[a-z-]+\/[a-z0-9-]+$/.test(header) ? header : null;
}

/** Untracked time below this is not mentioned: it is the ordinary start-up and wind-down. */
export const UNTRACKED_NOTE_MS = 5 * 60_000;

/** The recap's "How you spent your time" tip: what each figure means, nothing about how. */
export const TIME_BREAKDOWN_TIP =
  'Moving: time spent making your way downriver. Short pauses count as moving.\n\n' +
  'Breaks: stops of 6 minutes or longer, like lunch, a swim or a gravel bar.\n\n' +
  'Moving speed: distance divided by moving time, so breaks don’t lower it.';

export interface TimeBreakdownModel {
  /** Tracked time only: what the bar compares. Empty when nothing was tracked. */
  parts: { label: 'Moving' | 'Breaks'; ms: number; text: string }[];
  /** "2.3 mph", or "—" with none to give. */
  speed: string;
  /**
   * Said only when it changes how the numbers read: why Moving and Breaks
   * fall short of Total time. Null below UNTRACKED_NOTE_MS.
   */
  untracked: string | null;
  /** The bar, for VoiceOver. */
  accessibilityLabel: string;
}

/**
 * Moving and Breaks over the time Eddy tracked, and moving speed. Time Eddy
 * could not place on the river (before it found the paddler, no signal, the
 * last moments) is not a third category on the paddler's float: it is left
 * out, and named in one line only when there is enough of it to matter.
 */
export function timeBreakdownModel(trip: CompletedFloat): TimeBreakdownModel {
  const parts = [
    { label: 'Moving' as const, ms: trip.movingMs, text: recordedDuration(trip.movingMs) },
    { label: 'Breaks' as const, ms: trip.stoppedMs, text: recordedDuration(trip.stoppedMs) },
  ];
  const tracked = trip.movingMs + trip.stoppedMs > 0;
  return {
    parts: tracked ? parts : [],
    speed: trip.movingMph == null ? '—' : `${trip.movingMph.toFixed(1)} mph`,
    untracked:
      trip.unknownMs >= UNTRACKED_NOTE_MS
        ? `Eddy couldn’t see you for ${recordedDuration(trip.unknownMs)}, so that time isn’t counted here.`
        : null,
    accessibilityLabel: parts.map((part) => `${part.label}: ${part.text}`).join(', '),
  };
}
