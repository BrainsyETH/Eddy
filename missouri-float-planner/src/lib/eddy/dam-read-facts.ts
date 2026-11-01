// src/lib/eddy/dam-read-facts.ts
// The facts behind a dam's Eddy's Read, computed before any model sees them.
//
// Pure: no SDK, no database, no network. The generator fetches the inputs and
// hands them here; everything a reader could be misled by is decided in this
// file, where a test can replay it. The same split report-facts.ts makes for
// river and gauge reads.
//
// ── What a dam Read is allowed to say ──────────────────────────────────────
// Four things, each from its own source and each labelled by kind:
//
//   1. What SWPA has POSTED for today and tomorrow. A plan. It always outranks
//      the pattern: when a schedule is posted, the pattern is background.
//   2. What the units USUALLY did lately: the first start of each recent day,
//      weekdays and weekends apart. An observation summarised, never a promise.
//   3. How closely recent posted schedules matched what the turbines then did.
//   4. Water temperature and dissolved oxygen below the dam, when measured.
//
// ── Why 14 days and not 90 ─────────────────────────────────────────────────
// Because these powerhouses change regime with the season. Measured
// 2026-08-07..2026-11-01: Table Rock's first start was 6 AM on 20 of 24 August
// days and 3-5 PM through October; Bull Shoals moved from 5 AM in September to
// 3-4 PM in October. A 90-day median put Bull Shoals' weekday start at 11 AM,
// an hour it almost never started at lately. A short window follows the regime.
//
// ── Why "no consistent pattern" is an answer ───────────────────────────────
// A median always exists. When recent starts are spread wide, a median is a
// confident number describing nothing, so the pattern is only stated when the
// middle half of recent starts sits inside CONSISTENT_SPREAD_HOURS. Backtested
// against the same data, "today starts within an hour of the last fortnight's
// median" held on 67% of days at Table Rock, 61% at Norfork and 53% at Bull
// Shoals, and Bull Shoals started more than an hour EARLIER than that median on
// 20% of days. That last number is why the earliest recent start is always
// carried alongside the typical one: early is the direction that puts someone
// in rising water.
//
// ── Everything is at the dam ───────────────────────────────────────────────
// Both the schedule and the observations describe the powerhouse. Nothing here
// models how long a rise takes to reach an access downstream, so every time is
// "at the dam", in Central time, and the generated prose must say so.

import {
  centralClock,
  hourEndingLabel,
  hourEndingNow,
  nextDayKey,
  oldestRetrievedAt,
  scheduleIsStale,
  scheduledGeneration,
  windowLabel,
} from '@shared/dam-schedule-copy';
import type { DamScheduleDay } from '@shared/dam-types';
import { centralDayHours, centralDayStart, patternDayKeys } from '@/lib/data/dam-history';
import { parseEddyResponse, type ParsedEddyResponse } from './parse-response';

export { DAM_READ_DAM_IDS, damHasRead } from './dam-read-dams';

/** Complete Central days behind today that the pattern reads. */
export const PATTERN_WINDOW_DAYS = 14;
/** A day with fewer stored hours than this is a feed gap, not a pattern day. */
export const MIN_DAY_COVERAGE_HOURS = 20;
/** Fewer recent starts than this is not a pattern in either group. */
export const MIN_STARTS_FOR_PATTERN = 3;
/** Widest middle-half spread of recent first starts still called a pattern. */
export const CONSISTENT_SPREAD_HOURS = 3;
/** Fewer scored days than this and schedule reliability is not stated at all. */
export const MIN_RELIABILITY_DAYS = 10;
/**
 * The plan a day is scored against is the one Eddy held by this hour of that
 * morning (Central). Not midnight: SWPA's sheet for a day often lands just
 * after it, and scoring "the plan before the day began" left half of recent
 * days unscored. 5 AM is what someone checking before dawn would have read,
 * and a revision after it is not credited to the plan.
 */
export const PLAN_CUTOFF_HOUR = 5;
/** Water-quality readings older than this are left out of the Read. */
export const WATER_QUALITY_MAX_AGE_HOURS = 24;

const HOUR_MS = 3_600_000;

/** One stored hour, as dam_metric_readings holds it. */
export interface ObservedHourRow {
  /** Hour-truncated UTC ISO: the hour the mean BEGINS. */
  observedHour: string;
  valueCfs: number;
}

/** One complete-or-not Central day of turbine observations. */
export interface ObservedDay {
  dayKey: string;
  weekend: boolean;
  /** Stored hours that day. */
  coverage: number;
  /** True when coverage reaches MIN_DAY_COVERAGE_HOURS. */
  complete: boolean;
  generatingHours: number;
  /**
   * Central hour-of-day (0-23) of the first off-to-on transition WITHIN the
   * day, or null when there was none. A run carried over from the night before
   * is not a start: it began yesterday.
   */
  firstStartHour: number | null;
  /** Generating by Central hour-of-day; null where no observation is stored. */
  byHour: Array<boolean | null>;
}

function isWeekendDay(dayKey: string): boolean {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Fold stored turbine hours into the last `days` COMPLETE Central days.
 *
 * Today is excluded: a day that has not finished has not had its first start
 * for certain, and counting a half day as "no generation" would bias the
 * pattern towards idle every morning.
 *
 * `floorCfs` is the registry's generationOnCfs, the same line the dam page's
 * "generating" uses. At Bull Shoals that line sits above the minimum flow the
 * Corps passes through a turbine, so minimum flow is not generation here either.
 */
export function observedDays(
  rows: readonly ObservedHourRow[],
  floorCfs: number,
  options: { days?: number; now?: number } = {},
): ObservedDay[] {
  const days = options.days ?? PATTERN_WINDOW_DAYS;
  const now = options.now ?? Date.now();

  const values = new Map<number, number>();
  for (const row of rows) {
    const ms = Date.parse(row.observedHour);
    if (!Number.isFinite(ms) || !Number.isFinite(row.valueCfs)) continue;
    values.set(ms, row.valueCfs);
  }

  // patternDayKeys ends with today; drop it.
  return patternDayKeys(days, now).slice(0, -1).map((dayKey) => {
    const start = centralDayStart(dayKey);
    const length = centralDayHours(dayKey);
    const byHour: Array<boolean | null> = new Array(24).fill(null);
    let coverage = 0;
    let generatingHours = 0;
    let firstStartHour: number | null = null;

    for (let i = 0; i < length; i += 1) {
      const ms = start + i * HOUR_MS;
      const value = values.get(ms);
      if (value === undefined) continue;
      const on = value >= floorCfs;
      coverage += 1;
      if (on) generatingHours += 1;
      const hour = Math.floor(centralClock(ms).hoursElapsed);
      // The repeated hour each November keeps its first occurrence.
      if (byHour[hour] === null) byHour[hour] = on;
      if (firstStartHour === null && on && i > 0) {
        const previous = values.get(ms - HOUR_MS);
        if (previous !== undefined && previous < floorCfs) firstStartHour = hour;
      }
    }

    return {
      dayKey,
      weekend: isWeekendDay(dayKey),
      coverage,
      complete: coverage >= MIN_DAY_COVERAGE_HOURS,
      generatingHours,
      firstStartHour,
      byHour,
    };
  });
}

/** Nearest-rank percentile of an ascending list. */
function rank(sorted: readonly number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export type DayGroup = 'weekday' | 'weekend';

export interface StartPattern {
  group: DayGroup;
  /** Complete days in the group. */
  days: number;
  daysWithoutGeneration: number;
  daysWithStart: number;
  /** Median first start, Central hour-of-day. Null with no starts. */
  typicalStartHour: number | null;
  /** The middle half of first starts, Central hour-of-day. */
  rangeFromHour: number | null;
  rangeToHour: number | null;
  /** Earliest first start in the window. */
  earliestStartHour: number | null;
  /** Starts more than CONSISTENT_SPREAD_HOURS before the typical one. */
  earlyDays: number;
  /** True when the middle half is tight enough, and numerous enough, to state. */
  consistent: boolean;
  /** Median generating hours per complete day. */
  typicalGeneratingHours: number | null;
}

export function startPattern(days: readonly ObservedDay[], group: DayGroup): StartPattern | null {
  const pool = days.filter((d) => d.complete && d.weekend === (group === 'weekend'));
  if (pool.length === 0) return null;

  const starts = pool
    .map((d) => d.firstStartHour)
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);
  const hours = pool.map((d) => d.generatingHours).sort((a, b) => a - b);

  const typical = starts.length ? rank(starts, 0.5) : null;
  const from = starts.length ? rank(starts, 0.25) : null;
  const to = starts.length ? rank(starts, 0.75) : null;
  const consistent =
    starts.length >= MIN_STARTS_FOR_PATTERN &&
    from !== null &&
    to !== null &&
    to - from <= CONSISTENT_SPREAD_HOURS;

  return {
    group,
    days: pool.length,
    daysWithoutGeneration: pool.filter((d) => d.generatingHours === 0).length,
    daysWithStart: starts.length,
    typicalStartHour: typical,
    rangeFromHour: from,
    rangeToHour: to,
    earliestStartHour: starts.length ? starts[0] : null,
    earlyDays: typical === null ? 0 : starts.filter((h) => h < typical - CONSISTENT_SPREAD_HOURS).length,
    consistent,
    typicalGeneratingHours: rank(hours, 0.5),
  };
}

/** One stored SWPA schedule version, as dam_forecast_history holds it. */
export interface ScheduleVersion {
  firstSeenAt: string;
  days: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours'>>;
}

export interface ScheduleReliability {
  daysCompared: number;
  /** First start within an hour of the posted one, or both idle. */
  matched: number;
  /** Units came on more than an hour before the posted start. */
  startedEarly: number;
  /** Units came on more than an hour after the posted start. */
  startedLate: number;
  /** Generation on a day the posted schedule had none, or none on a day it had some. */
  onOffMismatch: number;
}

function scheduledFirstStart(hours: Pick<DamScheduleDay, 'hours'>['hours']): { any: boolean; start: number | null } {
  const on = new Map(hours.map((h) => [h.hourEnding, scheduledGeneration(h)]));
  let start: number | null = null;
  // Hour ending 1 has no earlier hour in the same day: the same rule the
  // observed side keeps, so the two definitions of "first start" match.
  for (let he = 2; he <= 24; he += 1) {
    if (on.get(he) && on.get(he - 1) === false) {
      start = he - 1;
      break;
    }
  }
  return { any: Array.from(on.values()).some(Boolean), start };
}

/**
 * How the plan a reader saw that morning compared with what then ran.
 *
 * For each complete observed day, the schedule scored is the latest version
 * Eddy had stored by PLAN_CUTOFF_HOUR that morning: the one somebody planning
 * the day would have read. A later same-day revision is not credited to it.
 *
 * Versions must come with minimum-flow hours marked (markMinimumFlowHours):
 * Bull Shoals' stored schedules from before that flag existed post its 7 MW
 * minimum flow in every hour, which unmarked reads as generating all day.
 */
export function scheduleReliability(
  versions: readonly ScheduleVersion[],
  days: readonly ObservedDay[],
): ScheduleReliability | null {
  const ordered = [...versions]
    .map((v) => ({ ...v, seen: Date.parse(v.firstSeenAt) }))
    .filter((v) => Number.isFinite(v.seen))
    .sort((a, b) => a.seen - b.seen);

  const result: ScheduleReliability = { daysCompared: 0, matched: 0, startedEarly: 0, startedLate: 0, onOffMismatch: 0 };

  for (const day of days) {
    if (!day.complete) continue;
    const cutoff = centralDayStart(day.dayKey) + PLAN_CUTOFF_HOUR * HOUR_MS;
    let plan: Pick<DamScheduleDay, 'hours'> | undefined;
    for (const version of ordered) {
      if (version.seen >= cutoff) break;
      const match = version.days.find((d) => d.scheduleDate === day.dayKey);
      if (match && match.hours.length === 24) plan = match;
    }
    if (!plan) continue;

    const scheduled = scheduledFirstStart(plan.hours);
    const observedAny = day.generatingHours > 0;
    result.daysCompared += 1;

    if (!scheduled.any && !observedAny) result.matched += 1;
    else if (scheduled.any !== observedAny) result.onOffMismatch += 1;
    else if (scheduled.start === null && day.firstStartHour === null) result.matched += 1;
    else if (scheduled.start === null || day.firstStartHour === null) result.onOffMismatch += 1;
    else {
      const diff = day.firstStartHour - scheduled.start;
      if (Math.abs(diff) <= 1) result.matched += 1;
      else if (diff < 0) result.startedEarly += 1;
      else result.startedLate += 1;
    }
  }

  return result.daysCompared >= MIN_RELIABILITY_DAYS ? result : null;
}

/** A posted generation stretch, in Central hours-of-day (end exclusive, 24 = midnight). */
export interface PostedWindow {
  fromHour: number;
  toHour: number;
  label: string;
}

export interface PostedDay {
  scheduleDate: string;
  dayOffset: 0 | 1;
  windows: PostedWindow[];
  /** Nothing but minimum flow posted (Bull Shoals' idle day). */
  minimumFlowOnly: boolean;
}

export interface PostedSchedule {
  days: PostedDay[];
  /** True when Eddy's copy is old enough that it may have been revised. */
  mayBeOutdated: boolean;
}

/**
 * Today's and tomorrow's posted generation, as windows.
 *
 * Today keeps only windows that have not ended: a stretch that finished at
 * 9 AM is not news to someone reading at noon. Tomorrow is only read when it
 * is the next calendar day, the same consecutive-days rule scheduleStateNow
 * keeps.
 */
export function postedSchedule(
  schedule: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>>,
  now = Date.now(),
): PostedSchedule | null {
  const clock = centralClock(now);
  const todayIndex = schedule.findIndex((d) => d.scheduleDate === clock.dayKey);
  if (todayIndex === -1) return null;

  const currentHour = hourEndingNow(clock.hoursElapsed) - 1;
  const picked = [schedule[todayIndex]];
  const next = schedule[todayIndex + 1];
  if (next && next.scheduleDate === nextDayKey(clock.dayKey)) picked.push(next);

  const days = picked.map((day, offset): PostedDay => {
    const on = new Map(day.hours.map((h) => [h.hourEnding, scheduledGeneration(h)]));
    const windows: PostedWindow[] = [];
    let runStart: number | null = null;
    for (let he = 1; he <= 25; he += 1) {
      const generating = he <= 24 && on.get(he) === true;
      if (generating && runStart === null) runStart = he;
      if (!generating && runStart !== null) {
        const to = he - 1;
        windows.push({ fromHour: runStart - 1, toHour: to, label: windowLabel(runStart, to) });
        runStart = null;
      }
    }
    return {
      scheduleDate: day.scheduleDate,
      dayOffset: offset as 0 | 1,
      windows: offset === 0 ? windows.filter((w) => w.toHour > currentHour) : windows,
      minimumFlowOnly: windows.length === 0 && day.hours.some((h) => h.minimumFlow === true),
    };
  });

  return {
    days,
    mayBeOutdated: scheduleIsStale(oldestRetrievedAt(picked.map((d) => ({ retrievedAt: d.retrievedAt }))), now),
  };
}

export interface WaterQualityFact {
  value: number;
  observedAt: string;
  /** The station that measured it. It is not the dam. */
  where: string;
}

export interface DamReadInputs {
  damId: string;
  damName: string;
  /** The tailwater river's display name, when Eddy carries it. */
  riverName: string | null;
  tailwaterFishery: 'trout' | 'warmwater' | null;
  floorCfs: number;
  schedule: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>>;
  observed: readonly ObservedHourRow[];
  scheduleVersions: readonly ScheduleVersion[];
  waterTempF: WaterQualityFact | null;
  dissolvedOxygenMgL: WaterQualityFact | null;
  /** Measured turbine state now, or null when unknown. */
  generatingNow: boolean | null;
  now?: number;
}

export interface DamReadFacts {
  damId: string;
  damName: string;
  riverName: string | null;
  tailwaterFishery: 'trout' | 'warmwater' | null;
  /** The group today belongs to, so the Read leads with the relevant pattern. */
  todayGroup: DayGroup;
  todayWeekday: string;
  generatingNow: boolean | null;
  posted: PostedSchedule | null;
  weekday: StartPattern | null;
  weekend: StartPattern | null;
  reliability: ScheduleReliability | null;
  waterTempF: WaterQualityFact | null;
  dissolvedOxygenMgL: WaterQualityFact | null;
  now: number;
}

function freshEnough(fact: WaterQualityFact | null, now: number): WaterQualityFact | null {
  if (!fact || !Number.isFinite(fact.value)) return null;
  const at = Date.parse(fact.observedAt);
  if (!Number.isFinite(at) || now - at > WATER_QUALITY_MAX_AGE_HOURS * HOUR_MS) return null;
  return fact;
}

export function buildDamReadFacts(input: DamReadInputs): DamReadFacts {
  const now = input.now ?? Date.now();
  const days = observedDays(input.observed, input.floorCfs, { now });
  const today = centralClock(now).dayKey;
  const [y, m, d] = today.split('-').map(Number);
  return {
    damId: input.damId,
    damName: input.damName,
    riverName: input.riverName,
    tailwaterFishery: input.tailwaterFishery,
    todayGroup: isWeekendDay(today) ? 'weekend' : 'weekday',
    todayWeekday: new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    generatingNow: input.generatingNow,
    posted: postedSchedule(input.schedule, now),
    weekday: startPattern(days, 'weekday'),
    weekend: startPattern(days, 'weekend'),
    reliability: scheduleReliability(input.scheduleVersions, days),
    waterTempF: freshEnough(input.waterTempF, now),
    dissolvedOxygenMgL: freshEnough(input.dissolvedOxygenMgL, now),
    now,
  };
}

/** Whether there is anything worth writing a Read about. */
export function damReadHasSubstance(f: DamReadFacts): boolean {
  return Boolean(f.posted || f.weekday || f.weekend);
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Central hour-of-day -> "3 PM", "noon", "midnight". The schedule's own labels. */
export function clockLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return 'midnight';
  if (normalized === 12) return 'noon';
  return hourEndingLabel(normalized + 1);
}

function groupPlural(group: DayGroup): string {
  return group === 'weekday' ? 'weekdays' : 'weekends';
}

/** The pattern for one group, as a sentence, or null when there is none to state. */
/** "6 AM – 8 AM, 9 AM – 11 AM and 4 PM – 7 PM". */
function listWindows(windows: readonly PostedWindow[]): string {
  const labels = windows.map((w) => w.label);
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/** "around 4 PM" or "between 2 PM and 3 PM". */
function rangePhrase(from: number, to: number): string {
  return from === to ? `around ${clockLabel(from)}` : `between ${clockLabel(from)} and ${clockLabel(to)}`;
}

/**
 * The pattern for one group, as a sentence, or null when there is none to state.
 *
 * `follow` phrases it as the second of two, so the full Read does not open two
 * sentences in a row with the same clause.
 */
export function patternSentence(p: StartPattern | null, options: { follow?: boolean } = {}): string | null {
  if (!p) return null;
  const plural = groupPlural(p.group);
  if (p.daysWithStart === 0) {
    return p.daysWithoutGeneration === p.days
      ? `On recent ${plural} the units at the dam have mostly stayed off.`
      : null;
  }
  if (!p.consistent || p.rangeFromHour === null || p.rangeToHour === null) {
    return `Recent ${p.group} start times at the dam have varied too much to call a pattern.`;
  }
  const when = rangePhrase(p.rangeFromHour, p.rangeToHour);
  let sentence = options.follow
    ? `On ${plural} the usual first start has been ${when}`
    : `Over the last two weeks the units at the dam have usually come on ${when} on ${plural}`;
  if (p.earlyDays > 0 && p.earliestStartHour !== null) {
    sentence += p.earlyDays === 1
      ? `, though once as early as ${clockLabel(p.earliestStartHour)}`
      : `, though ${p.earlyDays} times as early as ${clockLabel(p.earliestStartHour)}`;
  }
  return `${sentence}.`;
}

export function postedSentence(f: DamReadFacts): string | null {
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  if (!today) return null;
  const outdated = f.posted?.mayBeOutdated ? ' Eddy\'s copy may be out of date.' : '';
  if (today.windows.length > 0) {
    return `Generation is scheduled ${listWindows(today.windows)} today at the dam.${outdated}`;
  }
  return today.minimumFlowOnly
    ? `Only minimum flow is scheduled at the dam for the rest of today.${outdated}`
    : `No generation is scheduled at the dam for the rest of today.${outdated}`;
}

export function tomorrowSentence(f: DamReadFacts): string | null {
  const tomorrow = f.posted?.days.find((d) => d.dayOffset === 1);
  if (!tomorrow) return null;
  if (tomorrow.windows.length > 0) {
    return `Tomorrow's posted schedule has generation ${listWindows(tomorrow.windows)}.`;
  }
  return tomorrow.minimumFlowOnly
    ? 'Tomorrow\'s posted schedule has only minimum flow.'
    : 'Tomorrow\'s posted schedule has no generation.';
}

export function reliabilitySentence(r: ScheduleReliability | null): string | null {
  if (!r) return null;
  let sentence = `Lately the posted schedule has called the day's first start within an hour on ${r.matched} of ${r.daysCompared} days`;
  if (r.startedEarly > 0) sentence += `, and the units came on early on ${r.startedEarly}`;
  return `${sentence}.`;
}

function formatTemp(value: number): string {
  return `${Math.round(value)}°F`;
}

function formatOxygen(value: number): string {
  return `${value.toFixed(1)} mg/L`;
}

export function waterQualitySentence(f: DamReadFacts): string | null {
  const parts: string[] = [];
  if (f.waterTempF) parts.push(`${formatTemp(f.waterTempF.value)} water`);
  if (f.dissolvedOxygenMgL) parts.push(`${formatOxygen(f.dissolvedOxygenMgL.value)} dissolved oxygen`);
  if (parts.length === 0) return null;
  const where = f.waterTempF?.where ?? f.dissolvedOxygenMgL?.where;
  return `Below the dam the latest readings show ${parts.join(' and ')}${where ? ` (${where})` : ''}.`;
}

export const AT_THE_DAM_CAVEAT =
  'All times are at the dam, in Central time; water downstream rises later the farther below it you are.';

// ---------------------------------------------------------------------------
// The model's side of the contract
// ---------------------------------------------------------------------------

/**
 * The exact line the model must echo before its blocks, the same handshake
 * report-facts uses: a model that did not read the facts cannot reproduce it.
 */
export function damReadClaimsLine(f: DamReadFacts): string {
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  const posted = !today ? 'none' : today.windows.length ? today.windows.map((w) => w.label).join(', ') : 'idle';
  const group = (p: StartPattern | null) =>
    !p ? 'none'
      : !p.consistent || p.rangeFromHour === null || p.rangeToHour === null ? 'varied'
        : p.rangeFromHour === p.rangeToHour ? clockLabel(p.rangeFromHour) : `${clockLabel(p.rangeFromHour)}-${clockLabel(p.rangeToHour)}`;
  return `[CLAIMS] dam=${f.damName}; today=${posted}; weekdays=${group(f.weekday)}; weekends=${group(f.weekend)}`;
}

/** Every Central hour-of-day the facts name. A clock time outside this set is invented. */
export function allowedHours(f: DamReadFacts): Set<number> {
  const hours = new Set<number>();
  for (const day of f.posted?.days ?? []) {
    for (const w of day.windows) {
      hours.add(w.fromHour % 24);
      hours.add(w.toHour % 24);
    }
  }
  for (const p of [f.weekday, f.weekend]) {
    if (!p) continue;
    for (const h of [p.typicalStartHour, p.rangeFromHour, p.rangeToHour, p.earliestStartHour]) {
      if (h !== null) hours.add(h);
    }
  }
  return hours;
}

/**
 * Clock times written in prose, as Central hours-of-day.
 *
 * Reads "3 PM", "3:00 p.m.", "noon", "midnight", and ranges whose first
 * number borrows the second's meridiem ("2-5 PM", "2 to 5 PM"). Minutes other
 * than :00 are returned as NaN: no fact here has a minute, so one in the
 * prose is invented.
 */
export function clockTimesIn(text: string): number[] {
  const out: number[] = [];
  const toHour = (h: number, min: string | undefined, meridiem: string): number => {
    if (min !== undefined && min !== '00') return Number.NaN;
    const pm = /^p/i.test(meridiem);
    return (h % 12) + (pm ? 12 : 0);
  };
  const meridiem = '([ap])\\.?\\s?m\\.?(?![a-z])';
  const range = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*(?:-|–|to|and)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${meridiem}`, 'gi');
  let rest = text.replace(range, (_all, h1: string, m1: string | undefined, h2: string, m2: string | undefined, mer: string) => {
    out.push(toHour(Number(h1), m1, mer), toHour(Number(h2), m2, mer));
    return ' ';
  });
  const single = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*${meridiem}`, 'gi');
  rest = rest.replace(single, (_all, h: string, m: string | undefined, mer: string) => {
    out.push(toHour(Number(h), m, mer));
    return ' ';
  });
  if (/\bnoon\b/i.test(rest)) out.push(12);
  if (/\bmidnight\b/i.test(rest)) out.push(0);
  return out;
}

const PROMISE_PATTERNS: RegExp[] = [
  /\bwill (?:start|rise|come on|come up|generate|run|begin|turn on|kick on|be (?:off|on|running|generating))\b/i,
  /\bguarantee/i,
  /\b(?:predictable|reliably|like clockwork)\b/i,
  /\bpercentile\b/i,
];

/** Problems with a written Read against its facts. Empty means it may be served. */
export function damReadProblems(report: ParsedEddyResponse, f: DamReadFacts): string[] {
  const problems: string[] = [];
  const allowed = allowedHours(f);
  const texts = [report.summaryText ?? '', report.eddyRead ?? '', report.quoteText];
  const all = texts.join('\n');

  for (const hour of clockTimesIn(all)) {
    if (!Number.isFinite(hour)) problems.push('a clock time with minutes');
    else if (!allowed.has(hour)) problems.push(`clock time ${clockLabel(hour)} is not in the facts`);
  }
  for (const pattern of PROMISE_PATTERNS) {
    if (pattern.test(all)) problems.push(`promise wording: ${pattern.source}`);
  }
  if (clockTimesIn(report.quoteText).length > 0 && !/\bat the dam\b/i.test(report.quoteText)) {
    problems.push('full read names times without saying they are at the dam');
  }
  // Water-quality numbers must be the ones measured.
  for (const match of all.matchAll(/(\d+(?:\.\d+)?)\s*°\s*F/gi)) {
    if (!f.waterTempF || Math.round(Number(match[1])) !== Math.round(f.waterTempF.value)) problems.push('water temperature not in the facts');
  }
  for (const match of all.matchAll(/(\d+(?:\.\d+)?)\s*mg\/L/gi)) {
    if (!f.dissolvedOxygenMgL || Math.abs(Number(match[1]) - f.dissolvedOxygenMgL.value) > 0.051) problems.push('dissolved oxygen not in the facts');
  }
  if (!report.summaryText || !report.quoteText) problems.push('missing block');
  return problems;
}

/** The Read written from the facts alone, when the model's cannot be served. */
export function damReadFallback(f: DamReadFacts): ParsedEddyResponse {
  const lead = f.todayGroup === 'weekend' ? f.weekend : f.weekday;
  const other = f.todayGroup === 'weekend' ? f.weekday : f.weekend;
  const posted = postedSentence(f);
  const leadPattern = patternSentence(lead);

  const summary = posted
    ?? (leadPattern ? `No schedule is posted for today yet. ${leadPattern}` : `No schedule is posted for ${f.damName} today yet.`);
  const eddyRead = leadPattern ?? patternSentence(other) ?? summary;
  const full = [
    posted,
    tomorrowSentence(f),
    leadPattern,
    patternSentence(other, { follow: Boolean(leadPattern) }),
    posted || f.posted ? null : 'Check the posted schedule before you wade; a pattern is not a plan.',
    reliabilitySentence(f.reliability),
    waterQualitySentence(f),
    AT_THE_DAM_CAVEAT,
  ].filter((s): s is string => Boolean(s));

  return { summaryText: summary, eddyRead, quoteText: full.join(' ') };
}

/** Parse, verify, and fall back. The one door a generated dam Read passes through. */
export function prepareDamRead(raw: string, f: DamReadFacts): { report: ParsedEddyResponse; usedFallback: boolean; problems: string[] } {
  const lines = raw.trim().split(/\r?\n/);
  const claims = lines.filter((line) => /\[CLAIMS\]/i.test(line));
  const expected = damReadClaimsLine(f);
  if (claims.length !== 1 || claims[0].trim() !== expected) {
    return { report: damReadFallback(f), usedFallback: true, problems: ['claims line mismatch'] };
  }
  const parsed = parseEddyResponse(lines.filter((line) => !/\[CLAIMS\]/i.test(line)).join('\n'));
  const problems = damReadProblems(parsed, f);
  return problems.length
    ? { report: damReadFallback(f), usedFallback: true, problems }
    : { report: parsed, usedFallback: false, problems };
}

/** The facts block of the prompt. Every time in it is a Central hour at the dam. */
export function damReadFactsPrompt(f: DamReadFacts): string {
  const lines: string[] = [];
  lines.push(damReadClaimsLine(f));
  lines.push('');
  lines.push(`Dam: ${f.damName}${f.tailwaterFishery === 'trout' ? ', on a trout tailwater' : ''}.${f.riverName ? ` Water below it: ${f.riverName}.` : ''}`);
  lines.push(`Today is ${f.todayWeekday}, a ${f.todayGroup}. All times below are Central time at the dam.`);
  if (f.generatingNow !== null) lines.push(`Measured right now: units ${f.generatingNow ? 'generating' : 'not generating'}.`);

  lines.push('');
  lines.push('[POSTED SCHEDULE — the plan; it outranks the pattern]');
  if (!f.posted) lines.push('No schedule is posted for today.');
  else {
    for (const day of f.posted.days) {
      const name = day.dayOffset === 0 ? 'Rest of today' : 'Tomorrow';
      lines.push(`${name}: ${day.windows.length ? day.windows.map((w) => w.label).join(', ') : day.minimumFlowOnly ? 'only minimum flow' : 'no generation'}`);
    }
    if (f.posted.mayBeOutdated) lines.push('Eddy\'s copy of the schedule is old enough that it may have been revised.');
  }

  lines.push('');
  lines.push(`[RECENT PATTERN — what the units actually did, last ${PATTERN_WINDOW_DAYS} complete days]`);
  for (const p of [f.weekday, f.weekend]) {
    if (!p) continue;
    const head = `${groupPlural(p.group)} (${p.days} days, ${p.daysWithoutGeneration} with no generation, typically ${p.typicalGeneratingHours ?? 0} generating hours)`;
    if (!p.daysWithStart) lines.push(`${head}: no starts.`);
    else if (!p.consistent) lines.push(`${head}: starts varied too widely to call a pattern; earliest ${clockLabel(p.earliestStartHour!)}.`);
    else {
      lines.push(`${head}: usually first came on ${rangePhrase(p.rangeFromHour!, p.rangeToHour!)} (typical ${clockLabel(p.typicalStartHour!)}); earliest ${clockLabel(p.earliestStartHour!)}${p.earlyDays ? `, ${p.earlyDays} day(s) well before the typical start` : ''}.`);
    }
  }
  if (!f.weekday && !f.weekend) lines.push('Not enough recent observations to describe a pattern.');

  const reliability = reliabilitySentence(f.reliability);
  if (reliability) {
    lines.push('');
    lines.push('[HOW THE POSTED SCHEDULE HAS HELD UP]');
    lines.push(reliability);
    if (f.reliability!.startedLate) lines.push(`Units came on late on ${f.reliability!.startedLate} day(s); on/off disagreed on ${f.reliability!.onOffMismatch}.`);
  }

  const water = waterQualitySentence(f);
  if (water) {
    lines.push('');
    lines.push('[WATER BELOW THE DAM]');
    lines.push(water);
  }
  return lines.join('\n');
}
