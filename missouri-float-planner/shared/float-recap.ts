// shared/float-recap.ts
// What a saved float says about itself: how much of it was measured, the
// conditions it started in, its otter mood, and the river it explored.
// docs/float-history-card-plan.md is the design; this is phase 1b.
//
// Pure, and React- and native-free: the web suite tests it, and the iOS app
// reads it as @eddy/conditions/float-recap. It must not import packages/
// either, because Vercel builds only this tree, so the interval arithmetic
// below is its own rather than @eddy/geo's.
//
// Every reader here treats a malformed field as absent and never throws.
// Rows on the phone are not checked this deeply (floatArchiveCore.ts
// readableRow), and must not be: one row that fails that check makes the
// whole float history unreadable at launch.

import { CONDITION_SYSTEM, type ConditionCode } from './condition-system';
import type { CompletedFloat, RiverSpan } from './float-archive';
import { isReadingStale } from './reading-staleness';

export type FloatTracking = 'none' | 'partial' | 'measured';

export type FloatMood =
  | 'big-water'
  | 'quick-dip'
  | 'rain'
  | 'chilly'
  | 'scrape'
  | 'speed-run'
  | 'lazy-river'
  | 'made-it'
  | 'good-float';

/** Starting guesses, tuned against real archive rows before release (plan, open question). */
export const MOOD_THRESHOLDS = {
  /** More of the session unobserved than this, and the float is `partial`. */
  partialUnknownShare: 0.5,
  quickDipMs: 10 * 60_000,
  rainIn: 0.05,
  chillyF: 50,
  /** A weather observation older than this at Start is not the day's weather. */
  weatherMaxAgeMs: 2 * 60 * 60_000,
  speedRunRatio: 1.3,
  lazyRatio: 0.7,
  lazyStoppedShare: 0.4,
  /** Speed moods need this much measured moving time; one brief segment is noise. */
  minMovingMs: 20 * 60_000,
} as const;

const HIGH_WATER: ReadonlySet<string> = new Set(['high', 'dangerous']);
const LOW_WATER: ReadonlySet<string> = new Set(['low', 'too_low']);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const nullableFinite = (v: unknown): v is number | null => v === null || finite(v);
/** A timestamp that parses. Checked before a source is chosen, so a malformed snapshot cannot mask a valid fallback. */
const date = (v: unknown): v is string => text(v) && Number.isFinite(Date.parse(v));
const isCode = (v: unknown): v is ConditionCode => typeof v === 'string' && Object.prototype.hasOwnProperty.call(CONDITION_SYSTEM, v);

// ── Tracking ──────────────────────────────────────────────────────────────

/**
 * How much of the float the tracker measured, decided before and apart from
 * mood. `none`: never placed on the river (floatEnding.ts `unplaced`), so
 * there is no distance, speed or position. `partial`: placed, but most of the
 * session was unobserved.
 */
export function floatTracking(trip: CompletedFloat): FloatTracking {
  if (!finite(trip.firstMile)) return 'none';
  return trip.unknownMs > MOOD_THRESHOLDS.partialUnknownShare * trip.elapsedMs ? 'partial' : 'measured';
}

// ── Conditions at start ───────────────────────────────────────────────────

export interface FloatConditionReading {
  code: ConditionCode;
  gaugeName: string;
  usgsSiteId: string | null;
  heightFt: number | null;
  dischargeCfs: number | null;
  observedAt: string;
  /** Fresh at Start (the shared 6 h line) and not flagged stale or suspect. */
  current: boolean;
  source: 'start' | 'water';
}

/** A reading taken this long after Start is not the starting reading. */
const READING_AFTER_START_MS = 60 * 60_000;

function currentAt(observedAt: string, startedAt: number, accuracyWarning: boolean): boolean {
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at) || at - startedAt > READING_AFTER_START_MS) return false;
  return !accuracyWarning && !isReadingStale(Math.max(0, startedAt - at) / 3_600_000);
}

/**
 * The one condition this float is described by. The planner's snapshot at
 * Start wins; the server's historical reading stands in only when there is no
 * snapshot and it carries a condition. The badge and the mood rules both read
 * this, so they never disagree.
 */
export function floatCondition(trip: CompletedFloat): FloatConditionReading | null {
  const start: unknown = trip.startCondition;
  if (
    record(start) &&
    isCode(start.code) && start.code !== 'unknown' &&
    text(start.gaugeName) && (start.usgsSiteId === null || text(start.usgsSiteId)) && date(start.observedAt) &&
    nullableFinite(start.heightFt) && nullableFinite(start.dischargeCfs) &&
    typeof start.accuracyWarning === 'boolean'
  ) {
    return {
      code: start.code,
      gaugeName: start.gaugeName,
      usgsSiteId: start.usgsSiteId,
      heightFt: start.heightFt,
      dischargeCfs: start.dischargeCfs,
      observedAt: start.observedAt,
      current: currentAt(start.observedAt, trip.startedAt, start.accuracyWarning),
      source: 'start',
    };
  }
  const water: unknown = trip.water;
  if (
    record(water) &&
    isCode(water.conditionCode) && water.conditionCode !== 'unknown' &&
    text(water.gaugeName) && date(water.observedAt) &&
    nullableFinite(water.heightFt) && nullableFinite(water.dischargeCfs)
  ) {
    return {
      code: water.conditionCode,
      gaugeName: water.gaugeName,
      usgsSiteId: text(water.usgsSiteId) ? water.usgsSiteId : null,
      heightFt: water.heightFt,
      dischargeCfs: water.dischargeCfs,
      observedAt: water.observedAt,
      // waterAtStart skips suspect readings and keeps one within 30 minutes.
      current: currentAt(water.observedAt, trip.startedAt, false),
      source: 'water',
    };
  }
  return null;
}

export interface FloatBadge {
  code: ConditionCode;
  label: string;
  cfsLabel: string | null;
  ftLabel: string | null;
  /** False: show the value and its age, never a condition label or colour. */
  current: boolean;
}

/** Stage to two decimals, discharge whole: the precision each is reported at (readingCopy.ts). */
export function floatBadge(trip: CompletedFloat): FloatBadge | null {
  const condition = floatCondition(trip);
  if (!condition) return null;
  return {
    code: condition.code,
    label: CONDITION_SYSTEM[condition.code].label,
    cfsLabel: condition.dischargeCfs == null ? null : `${Math.round(condition.dischargeCfs).toLocaleString('en-US')} cfs`,
    ftLabel: condition.heightFt == null ? null : `${condition.heightFt.toFixed(2)} ft`,
    current: condition.current,
  };
}

// ── Weather at start ──────────────────────────────────────────────────────

export function floatWeather(trip: CompletedFloat): { tempF: number; precipIn1h: number; observedAt: string; conditionIcon?: string } | null {
  const weather: unknown = trip.startWeather;
  if (!record(weather) || !finite(weather.tempF) || !finite(weather.precipIn1h) || !text(weather.observedAt)) return null;
  const at = Date.parse(weather.observedAt);
  if (!Number.isFinite(at)) return null;
  const before = trip.startedAt - at;
  if (before > MOOD_THRESHOLDS.weatherMaxAgeMs || -before > READING_AFTER_START_MS) return null;
  return {
    tempF: weather.tempF, precipIn1h: weather.precipIn1h, observedAt: weather.observedAt,
    ...(typeof weather.conditionIcon === 'string' && /^(01|02|03|04|09|10|11|13|50)[dn]$/.test(weather.conditionIcon)
      ? { conditionIcon: weather.conditionIcon } : {}),
  };
}

// ── Moods ─────────────────────────────────────────────────────────────────

/** The design's mood names, shared so the recap and its share image say the same thing. */
const MOOD_LABELS: Record<FloatMood, string> = {
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

/** A mood's name; Big water at Flood states the condition plainly instead. Null for no mood. */
export function floatMoodLabel(mood: FloatMood | null, code: ConditionCode | null): string | null {
  if (!mood) return null;
  return mood === 'big-water' && code === 'dangerous' ? 'Flood stage' : MOOD_LABELS[mood];
}

export type MoodGate = 'standard' | 'big-water' | 'open';

/**
 * Rules 1 to 3, shared by the recap and the share image so the two can never
 * disagree about the otter. Nothing measured: the standard otter, even at
 * high water. High water never celebrates: Big water on a current reading,
 * the standard otter on a stale or suspect one. Otherwise the other rules
 * decide (`open`).
 */
export function moodGate(input: { tracking: FloatTracking; code: ConditionCode | null; current: boolean }): MoodGate {
  if (input.tracking === 'none') return 'standard';
  if (input.code != null && HIGH_WATER.has(input.code)) return input.current ? 'big-water' : 'standard';
  return 'open';
}

/**
 * One mood per float, first matching rule wins; null is the standard otter
 * with no mood line. A rule whose data is missing does not match, so older
 * floats fall through rather than being guessed at.
 */
export function pickFloatMood(trip: CompletedFloat): FloatMood | null {
  const T = MOOD_THRESHOLDS;
  const tracking = floatTracking(trip);
  const condition = floatCondition(trip);
  const gate = moodGate({ tracking, code: condition?.code ?? null, current: condition?.current ?? false });
  if (gate === 'standard') return null;
  if (gate === 'big-water') return 'big-water';
  if (trip.elapsedMs < T.quickDipMs) return 'quick-dip';
  const weather = floatWeather(trip);
  if (weather && weather.precipIn1h >= T.rainIn) return 'rain';
  if (weather && weather.tempF < T.chillyF) return 'chilly';
  if (condition?.current && LOW_WATER.has(condition.code)) return 'scrape';
  const measured = tracking === 'measured';
  // Pace ratio, only on a measured float with enough moving time to mean it.
  const ratio =
    measured && trip.movingMs >= T.minMovingMs && finite(trip.movingMph) && finite(trip.plannerMph) && trip.plannerMph > 0
      ? trip.movingMph / trip.plannerMph
      : null;
  if (ratio != null && ratio >= T.speedRunRatio) return 'speed-run';
  if (measured && (trip.stoppedMs >= T.lazyStoppedShare * trip.elapsedMs || (ratio != null && ratio <= T.lazyRatio))) {
    return 'lazy-river';
  }
  if (trip.reachedTakeOut) return 'made-it';
  return 'good-float';
}

// ── River explored ────────────────────────────────────────────────────────

type Interval = [number, number];

/**
 * The mile system a route's access points define, as a short stable hash of
 * their ids and miles. Snapshotted into RiverSpan at Start so two floats can
 * be told to share a strip, or not, after a recalibration. Order-free: the
 * same points in any order give the same value. FNV-1a, 32 bits, hex.
 */
export function spanCalibration(anchors: readonly { id: string; riverMile: number }[]): string {
  const keys = anchors
    .filter((a) => text(a.id) && finite(a.riverMile))
    .map((a) => `${a.id}@${a.riverMile}`)
    .sort();
  let hash = 0x811c9dc5;
  for (const key of keys) {
    for (let i = 0; i < key.length; i += 1) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const CALIBRATION = /^[0-9a-f]{8}$/;

function readSpan(value: unknown): RiverSpan | null {
  if (!record(value) || !finite(value.firstMile) || !finite(value.lastMile) ||
    !(value.lastMile > value.firstMile) || !text(value.firstName) || !text(value.lastName) ||
    !text(value.calibration) || !CALIBRATION.test(value.calibration)) return null;
  return {
    firstMile: value.firstMile, lastMile: value.lastMile,
    firstName: value.firstName, lastName: value.lastName, calibration: value.calibration,
  };
}

/** Null for missing, null (too many to keep) or malformed: never a partial figure. */
function readCovered(value: unknown): Interval[] | null {
  if (!Array.isArray(value)) return null;
  const out: Interval[] = [];
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || !finite(pair[0]) || !finite(pair[1]) || !(pair[1] > pair[0])) return null;
    out.push([pair[0], pair[1]]);
  }
  return out;
}

/** Merge only what overlaps or touches: a gap between intervals is river nobody was credited for. */
function merge(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

function clamp(intervals: readonly Interval[], span: RiverSpan): Interval[] {
  return intervals
    .map(([a, b]): Interval => [Math.max(a, span.firstMile), Math.min(b, span.lastMile)])
    .filter(([a, b]) => b > a);
}

export interface RiverExplored {
  /** Unique river miles credited, inside the span. Not distance paddled. */
  miles: number;
  /** Share of the span's float miles, 0 to 1. */
  fraction: number;
  /** Each credited stretch on the strip, as fractions of the span. */
  segments: { start: number; end: number }[];
  span: RiverSpan;
}

function explored(intervals: Interval[], span: RiverSpan): RiverExplored | null {
  if (intervals.length === 0) return null;
  const length = span.lastMile - span.firstMile;
  const miles = intervals.reduce((sum, [a, b]) => sum + (b - a), 0);
  return {
    miles,
    fraction: Math.min(1, miles / length),
    segments: intervals.map(([a, b]) => ({ start: (a - span.firstMile) / length, end: (b - span.firstMile) / length })),
    span,
  };
}

/**
 * The river this float explored, from the tracker's credited intervals
 * clamped to the calibrated span snapshotted at Start. Null hides the strip
 * and the figures: no intervals (an older build, or too many), no span.
 */
export function riverExplored(trip: CompletedFloat): RiverExplored | null {
  const span = readSpan(trip.riverSpan);
  const covered = readCovered(trip.coveredMiles);
  if (!span || !covered) return null;
  return explored(clamp(merge(covered), span), span);
}

/**
 * Every float on one river, against one common boundary: the span of the
 * latest float that has one. Each float's own clamp is to its own span, which
 * can be wider, so the merged list is clamped again before it is summed:
 * otherwise an older span of 0–100 and a newer one of 10–90 could report 100
 * miles explored out of 80.
 *
 * Only floats in the boundary's mile system (RiverSpan.calibration) are
 * merged. After the river's access-point miles are recalibrated, an older
 * float's intervals name a different stretch of the new strip; they are left
 * out of the sum rather than drawn in the wrong place, and `excluded` says
 * how many.
 */
export function riverLifetimeExplored(
  trips: readonly CompletedFloat[],
  riverSlug: string,
  /**
   * The span to measure and place against instead of the latest float's.
   * Pass the strip's own span when drawing on it: segments are fractions of
   * the boundary, so a different boundary puts them at the wrong miles. Its
   * calibration decides which floats are merged, as the latest float's would.
   */
  span?: RiverSpan,
): (RiverExplored & { floats: number; excluded: number }) | null {
  const eligible = trips
    .filter((trip) => trip.riverSlug === riverSlug)
    .map((trip) => ({ trip, span: readSpan(trip.riverSpan), covered: readCovered(trip.coveredMiles) }))
    .filter((e): e is { trip: CompletedFloat; span: RiverSpan; covered: Interval[] } => e.span != null && e.covered != null);
  if (eligible.length === 0) return null;
  const boundary = span ?? eligible.reduce((a, b) => (b.trip.startedAt > a.trip.startedAt ? b : a)).span;
  const same = eligible.filter((e) => e.span.calibration === boundary.calibration);
  const all = merge(same.flatMap((e) => clamp(merge(e.covered), e.span)));
  const result = explored(clamp(all, boundary), boundary);
  return result ? { ...result, floats: same.length, excluded: eligible.length - same.length } : null;
}

/** Miles to one decimal, except that a positive distance never reads as zero. */
export function exploredMiles(miles: number): string {
  return miles > 0 && miles < 0.05 ? 'Under 0.1' : miles.toFixed(1);
}

/**
 * Whole percent, never rounded up to a claim the float did not make: "100%"
 * only for complete coverage (99.6% reads 99%), "Under 1%" for a sliver.
 */
export function exploredPercent(fraction: number): string {
  return exploredPercentLabel(exploredPercentValue(fraction));
}

/**
 * The whole percent the label states, decided once from unrounded miles:
 * 100 only for complete coverage, 99 just below it, 0 for "under 1%". The
 * share image carries this number rather than recomputing it from rounded
 * miles, so the image always says what the recap says.
 */
export function exploredPercentValue(fraction: number): number {
  if (fraction >= 1) return 100;
  if (fraction < 0.01) return 0;
  return Math.min(99, Math.round(fraction * 100));
}

/** "7%"; 0 is "Under 1%", a sliver that is not nothing. */
export function exploredPercentLabel(percent: number): string {
  return percent === 0 ? 'Under 1%' : `${percent}%`;
}

/** "the Current" for "Current River"; other names as they are. */
export function riverShortName(riverName: string): string {
  const short = riverName.replace(/\s+River$/i, '');
  return short === riverName ? riverName : `the ${short}`;
}

/** "9.6 river miles explored" first; the share of the river's float miles second. */
export function exploredCopy(result: RiverExplored, riverName: string): { miles: string; share: string } {
  const miles = exploredMiles(result.miles);
  return {
    miles: `${miles} river ${miles === '1.0' ? 'mile' : 'miles'} explored`,
    share: `${exploredPercent(result.fraction)} of ${riverName}’s float miles`,
  };
}
