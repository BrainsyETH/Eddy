// shared/float-share.ts
// What a float share image may say, as one versioned query string
// (docs/float-history-card-plan.md, phase 5; ADR 0015, "Float share images").
//
// The phone builds it from a saved float; GET /api/share/float/image parses
// it strictly and draws it. Stateless: nothing is stored, and the query holds
// only what the image shows. Never the start or end time of day, the GPS
// track, the account, or the start note. Names are not in it either: the
// server resolves the river and access points from their ids, so the route
// cannot be used to render arbitrary text.

import { CONDITION_SYSTEM, type ConditionCode } from './condition-system';
import type { CompletedFloat } from './float-archive';
import {
  floatCondition,
  floatTracking,
  moodGate,
  pickFloatMood,
  riverExplored,
  type FloatMood,
  type FloatTracking,
} from './float-recap';

export const FLOAT_IMAGE_PATH = '/api/share/float/image';

export interface FloatShareState {
  version: 1;
  riverSlug: string;
  /** Null for a float started on the water. */
  putInId: string | null;
  takeOutId: string;
  /** The day, in the paddler's own calendar; never a time of day. */
  date: string;
  tracking: FloatTracking;
  reachedTakeOut: boolean;
  /** As the recap chose it; the server still applies moodGate. */
  mood: FloatMood | null;
  condition: { code: Exclude<ConditionCode, 'unknown'>; current: boolean; cfs: number | null } | null;
  /** Distance paddled to 0.1 mi; null when nothing was measured. */
  miles: number | null;
  minutes: number;
  /** River explored to 0.01 mi, and the span's float miles to 0.1. */
  explored: { miles: number; spanMiles: number } | null;
}

const MOODS: readonly FloatMood[] = [
  'big-water', 'quick-dip', 'rain', 'chilly', 'scrape', 'speed-run', 'lazy-river', 'made-it', 'good-float',
];
const TRACKING: readonly FloatTracking[] = ['none', 'partial', 'measured'];
const LOW_WATER = new Set(['low', 'too_low']);
const HIGH_WATER = new Set(['high', 'dangerous']);

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** The local calendar day of a moment, "2026-10-26". */
export function localDay(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Everything a saved float's share image shows, from the same rules as its recap. */
export function floatShareState(trip: CompletedFloat): FloatShareState {
  const tracking = floatTracking(trip);
  const condition = floatCondition(trip);
  const explored = riverExplored(trip);
  const spanMiles = explored ? round(explored.span.lastMile - explored.span.firstMile, 1) : 0;
  return {
    version: 1,
    riverSlug: trip.riverSlug,
    putInId: trip.putInId,
    takeOutId: trip.takeOutId,
    date: localDay(trip.startedAt),
    tracking,
    reachedTakeOut: trip.reachedTakeOut,
    mood: pickFloatMood(trip),
    condition:
      condition && condition.code !== 'unknown'
        ? {
            code: condition.code,
            current: condition.current,
            cfs: condition.dischargeCfs == null ? null : Math.round(condition.dischargeCfs),
          }
        : null,
    miles: tracking === 'none' ? null : round(trip.distanceMiles, 1),
    minutes: Math.max(0, Math.round(trip.elapsedMs / 60_000)),
    // Rounded so the parser's explored <= span check holds for a whole river.
    explored: explored && spanMiles > 0 ? { miles: Math.min(round(explored.miles, 2), spanMiles), spanMiles } : null,
  };
}

/** The one spelling of a share, in a fixed key order, so every variant shares one image cache key. */
export function floatImagePath(state: FloatShareState): string {
  const q = new URLSearchParams();
  q.set('v', '1');
  q.set('river', state.riverSlug);
  if (state.putInId) q.set('from', state.putInId);
  q.set('to', state.takeOutId);
  q.set('date', state.date);
  q.set('tracking', state.tracking);
  q.set('reached', state.reachedTakeOut ? '1' : '0');
  if (state.mood) q.set('mood', state.mood);
  if (state.condition) {
    q.set('cond', state.condition.code);
    q.set('cur', state.condition.current ? '1' : '0');
    if (state.condition.cfs != null) q.set('cfs', String(state.condition.cfs));
  }
  if (state.miles != null) q.set('mi', state.miles.toFixed(1));
  q.set('min', String(state.minutes));
  if (state.explored) {
    q.set('exp', state.explored.miles.toFixed(2));
    q.set('span', state.explored.spanMiles.toFixed(1));
  }
  return `${FLOAT_IMAGE_PATH}?${q.toString()}`;
}

const KEYS = new Set(['v', 'river', 'from', 'to', 'date', 'tracking', 'reached', 'mood', 'cond', 'cur', 'cfs', 'mi', 'min', 'exp', 'span']);
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SLUG = /^[a-z0-9-]{1,120}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const FLAG = /^[01]$/;

function day(value: string, now: number): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const at = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(at);
  // A real calendar day, from Eddy's first season to tomorrow (time zones).
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] &&
    +m[1] >= 2025 && at <= now + 86_400_000;
}

function decimal(value: string | null, places: number, max: number): number | null {
  if (value == null) return null;
  const pattern = places === 0 ? /^\d{1,7}$/ : new RegExp(`^\\d{1,7}(\\.\\d{1,${places}})?$`);
  if (!pattern.test(value)) return NaN;
  const n = Number(value);
  return Number.isFinite(n) && n <= max ? n : NaN;
}

/**
 * The share a query describes, or null for anything malformed or
 * inconsistent: an unknown or repeated key, an untracked float with a
 * distance, a Big water mood without current high water. Null is a 400, never
 * a fallback picture.
 */
export function parseFloatShare(params: URLSearchParams, now = Date.now()): FloatShareState | null {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!KEYS.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  const get = (key: string) => params.get(key);
  const river = get('river');
  const from = get('from');
  const to = get('to');
  const date = get('date');
  const tracking = get('tracking') as FloatTracking | null;
  const reached = get('reached');
  const mood = get('mood') as FloatMood | null;
  const cond = get('cond');
  const cur = get('cur');
  if (get('v') !== '1' || !river || !SLUG.test(river) || !to || !ID.test(to) || (from != null && !ID.test(from))) return null;
  if (!date || !day(date, now) || !tracking || !TRACKING.includes(tracking) || !reached || !FLAG.test(reached)) return null;
  if (mood != null && !MOODS.includes(mood)) return null;

  const cfs = decimal(get('cfs'), 0, 2_000_000);
  const miles = decimal(get('mi'), 1, 500);
  const minutes = decimal(get('min'), 0, 2_880);
  const exp = decimal(get('exp'), 2, 10_000);
  const span = decimal(get('span'), 1, 10_000);
  if ([cfs, miles, minutes, exp, span].some((n) => Number.isNaN(n)) || minutes == null) return null;

  let condition: FloatShareState['condition'] = null;
  if (cond != null) {
    if (cond === 'unknown' || !Object.prototype.hasOwnProperty.call(CONDITION_SYSTEM, cond) || !cur || !FLAG.test(cur)) return null;
    condition = { code: cond as Exclude<ConditionCode, 'unknown'>, current: cur === '1', cfs };
  } else if (cur != null || cfs != null) return null;

  // Nothing measured means no distance, no river explored and no mood.
  if (tracking === 'none' ? miles != null || exp != null || mood != null : miles == null) return null;
  if ((exp == null) !== (span == null) || (span != null && (!(span > 0) || exp! > span))) return null;

  // A mood that claims water the condition does not show is a forged share.
  const current = condition?.current ?? false;
  if (mood === 'big-water' && !(condition && current && HIGH_WATER.has(condition.code))) return null;
  if (mood === 'scrape' && !(condition && current && LOW_WATER.has(condition.code))) return null;

  return {
    version: 1,
    riverSlug: river,
    putInId: from,
    takeOutId: to,
    date,
    tracking,
    reachedTakeOut: reached === '1',
    mood,
    condition,
    miles,
    minutes,
    explored: exp != null && span != null ? { miles: exp, spanMiles: span } : null,
  };
}

/**
 * The otter the image draws: moodGate first, exactly as the recap, so an
 * untracked float gets the standard otter even at a current High or Flood,
 * whatever mood the query sent. Null is the standard otter.
 */
export function shareMood(state: FloatShareState): FloatMood | null {
  const gate = moodGate({
    tracking: state.tracking,
    code: state.condition?.code ?? null,
    current: state.condition?.current ?? false,
  });
  if (gate === 'standard') return null;
  if (gate === 'big-water') return 'big-water';
  return state.mood;
}

/** "4 hr 12 min", "<1 min": the app's duration format (floatSession.ts formatDuration). */
export function shareDuration(minutes: number): string {
  if (minutes < 1) return '<1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
