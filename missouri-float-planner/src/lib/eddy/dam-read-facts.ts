// src/lib/eddy/dam-read-facts.ts
// The facts behind a dam's Eddy's Read, and the rows they render as.
//
// Pure: no SDK, no database, no network. The generator fetches the inputs and
// hands them here; everything a reader could be misled by is decided in this
// file, where a test can replay it.
//
// ── Code states the facts; the model only interprets ───────────────────────
// The first version let the model write the schedule, the times and the
// counts, and checked its prose afterwards. A review showed the check could
// not hold: it asked whether a time appeared SOMEWHERE in the facts, so "No
// generation is scheduled for the rest of today" passed beside a posted 2-9 PM
// schedule, "6 AM to 9 PM" passed by borrowing 6 AM from the pattern, and an
// invented "14 of 14" passed because counts were never checked at all.
//
// So every fact is now a ROW rendered here (damReadRows): the posted schedule,
// the recent starts, the earliest start, the mornings, the run, the release,
// how the schedule held, the water readings. The model writes two or three
// sentences of interpretation beside them, and damProseProblems rejects any
// digit, clock word, schedule claim, "today", live-state claim or measurement
// in that prose. Those rules are simple enough to be airtight, which the old
// ones were not.
//
// ── Why 14 days and not 90 ─────────────────────────────────────────────────
// These powerhouses change regime with the season. Measured 2026-08-07 to
// 2026-11-01: Table Rock's first start was 6 AM on 20 of 24 August days and
// 3-5 PM through October. A 90-day median put Bull Shoals' weekday start at
// 11 AM, an hour it almost never started at lately.
//
// ── Why "no consistent pattern" is an answer ───────────────────────────────
// A median always exists. The usual start is only stated when the middle half
// of recent starts sits inside CONSISTENT_SPREAD_HOURS. The EARLIEST recent
// start is a row of its own whenever one is known, stated or not: early is the
// direction that catches someone in rising water.
//
// ── A gap is not an afternoon start ────────────────────────────────────────
// A day whose first observed start comes after a missing hour has an UNKNOWN
// first start: the gap could hide an earlier run. Such days drop out of the
// start pattern and the schedule scoring rather than counting as later starts.
//
// ── Everything is at the dam ───────────────────────────────────────────────
// Schedule and observations both describe the powerhouse. Nothing here models
// how long a rise takes to reach an access downstream; AT_THE_DAM_CAVEAT
// travels with every Read.

import {
  centralClock,
  hourEndingLabel,
  hourEndingNow,
  nextDayKey,
  oldestRetrievedAt,
  scheduleDayLabel,
  scheduleIsStale,
  scheduledGeneration,
  windowLabel,
} from '@shared/dam-schedule-copy';
import type { DamReadRow, DamScheduleDay } from '@shared/dam-types';
import { centralDayHours, centralDayStart, patternDayKeys } from '@/lib/data/dam-history';

export { DAM_READ_DAM_IDS, damHasRead } from './dam-read-dams';

/** Complete Central days behind today that the pattern reads. */
export const PATTERN_WINDOW_DAYS = 14;
/** A day with fewer stored hours than this is a feed gap, not a pattern day. */
export const MIN_DAY_COVERAGE_HOURS = 20;
/** Fewer recent starts than this is not a pattern in either group. */
export const MIN_STARTS_FOR_PATTERN = 3;
/** Widest middle-half spread of recent first starts still called a pattern. */
export const CONSISTENT_SPREAD_HOURS = 3;
/** Fewer known days than this and the mornings/run/release rows are left out. */
export const MIN_DAYS_FOR_SHAPE = 5;
/** Fewer scored days than this and schedule reliability is not stated at all. */
export const MIN_RELIABILITY_DAYS = 10;
/**
 * The plan a day is scored against is the one Eddy held by this hour of that
 * morning (Central). Not midnight: SWPA's sheet for a day often lands just
 * after it, and scoring "the plan before the day began" left half of recent
 * days unscored. A revision after it is not credited to the plan.
 */
export const PLAN_CUTOFF_HOUR = 5;
/** "Mornings" are the hours before this (Central). */
export const MORNING_ENDS_HOUR = 12;
/** Water-quality readings older than this are left out. */
export const WATER_QUALITY_MAX_AGE_HOURS = 24;

const HOUR_MS = 3_600_000;

/** One stored hour, as dam_metric_readings holds it. */
export interface ObservedHourRow {
  /** Hour-truncated UTC ISO: the hour the mean BEGINS. */
  observedHour: string;
  valueCfs: number;
}

/** One Central day of turbine observations. */
export interface ObservedDay {
  dayKey: string;
  weekend: boolean;
  /** Stored hours that day. */
  coverage: number;
  /** True when coverage reaches MIN_DAY_COVERAGE_HOURS. */
  complete: boolean;
  /** True when every hour of the day is stored. */
  fullyObserved: boolean;
  generatingHours: number;
  /**
   * Central hour-of-day (0-23) of the first off-to-on transition WITHIN the
   * day, when it is known. A run carried over from the night before is not a
   * start: it began yesterday.
   */
  firstStartHour: number | null;
  /**
   * True when a missing hour could be hiding the first start: one came before
   * the first observed transition, or the day had gaps and no transition.
   */
  startUnknown: boolean;
  /** No generation before MORNING_ENDS_HOUR; false if any morning hour ran; null when a missing hour leaves it open. */
  morningOff: boolean | null;
  /** Length of the run that began at firstStartHour, on a fully observed day. */
  firstRunHours: number | null;
  /** Central hour the day's last generation ended (exclusive; 24 = midnight), on a fully observed day. */
  endHour: number | null;
  /** Highest hourly turbine flow while generating, cfs. */
  peakCfs: number | null;
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
 * for certain. `floorCfs` is the registry's generationOnCfs, the same line the
 * dam page's "generating" uses; at Bull Shoals it sits above the minimum flow
 * the Corps passes through a turbine, so minimum flow is not generation here.
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

  return patternDayKeys(days, now).slice(0, -1).map((dayKey) => {
    const start = centralDayStart(dayKey);
    const length = centralDayHours(dayKey);
    const byHour: Array<boolean | null> = new Array(24).fill(null);
    let coverage = 0;
    let generatingHours = 0;
    let peakCfs: number | null = null;
    let gapSeen = false;
    let firstStartIndex: number | null = null;
    let startUnknown = false;
    let lastOnIndex: number | null = null;

    for (let i = 0; i < length; i += 1) {
      const ms = start + i * HOUR_MS;
      const value = values.get(ms);
      if (value === undefined) {
        gapSeen = true;
        continue;
      }
      const on = value >= floorCfs;
      coverage += 1;
      const hour = Math.floor(centralClock(ms).hoursElapsed);
      // The repeated hour each November keeps its first occurrence.
      if (byHour[hour] === null) byHour[hour] = on;
      if (!on) continue;
      generatingHours += 1;
      lastOnIndex = i;
      peakCfs = peakCfs === null ? value : Math.max(peakCfs, value);
      if (firstStartIndex === null && !startUnknown && i > 0) {
        const previous = values.get(ms - HOUR_MS);
        if (previous !== undefined && previous < floorCfs) {
          if (gapSeen) startUnknown = true;
          else firstStartIndex = i;
        } else if (previous === undefined) {
          startUnknown = true;
        }
      }
    }
    if (firstStartIndex === null && gapSeen) startUnknown = true;

    const fullyObserved = coverage === length;
    const hourOf = (i: number) => Math.floor(centralClock(start + i * HOUR_MS).hoursElapsed);

    let firstRunHours: number | null = null;
    if (fullyObserved && firstStartIndex !== null) {
      let end = firstStartIndex;
      while (end < length && (values.get(start + end * HOUR_MS) ?? 0) >= floorCfs) end += 1;
      firstRunHours = end - firstStartIndex;
    }

    const morningHours = byHour.slice(0, MORNING_ENDS_HOUR);
    return {
      dayKey,
      weekend: isWeekendDay(dayKey),
      coverage,
      complete: coverage >= MIN_DAY_COVERAGE_HOURS,
      fullyObserved,
      generatingHours,
      firstStartHour: firstStartIndex === null ? null : hourOf(firstStartIndex),
      startUnknown,
      // An observed morning run settles it even with gaps; otherwise any
      // missing morning hour leaves it unknown.
      morningOff: morningHours.some((h) => h === true) ? false : morningHours.some((h) => h === null) ? null : true,
      firstRunHours,
      // A run still going at midnight did not end that day.
      endHour: fullyObserved && lastOnIndex !== null && lastOnIndex < length - 1 ? hourOf(lastOnIndex) + 1 : null,
      peakCfs,
      byHour,
    };
  });
}

/** Nearest-rank percentile of an ascending list. */
function rank(sorted: readonly number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  return rank([...values].sort((a, b) => a - b), 0.5);
}

export type DayGroup = 'weekday' | 'weekend';

export interface StartPattern {
  group: DayGroup;
  /** Complete days in the group whose first start is known (or known absent). */
  days: number;
  daysWithoutGeneration: number;
  daysWithStart: number;
  /** Median first start, Central hour-of-day. */
  typicalStartHour: number | null;
  /** The middle half of first starts, Central hour-of-day. */
  rangeFromHour: number | null;
  rangeToHour: number | null;
  /** Starts at least CONSISTENT_SPREAD_HOURS before the typical one. */
  earlyDays: number;
  /** True when the middle half is tight enough, and numerous enough, to state. */
  consistent: boolean;
}

/** Days the pattern may count: complete, and with a first start that is not hidden by a gap. */
function patternPool(days: readonly ObservedDay[]): ObservedDay[] {
  return days.filter((d) => d.complete && !d.startUnknown);
}

export function startPattern(days: readonly ObservedDay[], group: DayGroup): StartPattern | null {
  const pool = patternPool(days).filter((d) => d.weekend === (group === 'weekend'));
  if (pool.length === 0) return null;

  const starts = pool
    .map((d) => d.firstStartHour)
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);
  const typical = starts.length ? rank(starts, 0.5) : null;
  const from = starts.length ? rank(starts, 0.25) : null;
  const to = starts.length ? rank(starts, 0.75) : null;

  return {
    group,
    days: pool.length,
    daysWithoutGeneration: pool.filter((d) => d.generatingHours === 0).length,
    daysWithStart: starts.length,
    typicalStartHour: typical,
    rangeFromHour: from,
    rangeToHour: to,
    earlyDays: typical === null ? 0 : starts.filter((h) => h <= typical - CONSISTENT_SPREAD_HOURS).length,
    consistent: starts.length >= MIN_STARTS_FOR_PATTERN && from !== null && to !== null && to - from <= CONSISTENT_SPREAD_HOURS,
  };
}

/** What a typical recent day looked like, across both day types. */
export interface RecentShape {
  /** The earliest known first start in the window, and the day it fell on. */
  earliest: { hour: number; dayKey: string } | null;
  /** Days with every morning hour observed, and how many of them had no generation before noon. */
  morningsKnown: number;
  morningsOff: number;
  /** Median length of the first run, hours, and how many days it was measured on. */
  typicalRunHours: number | null;
  runDays: number;
  /** Median hour generation ended (24 = midnight). */
  typicalEndHour: number | null;
  /** Median daily peak turbine flow on generating days, cfs, and how many days. */
  typicalPeakCfs: number | null;
  peakDays: number;
}

export function recentShape(days: readonly ObservedDay[]): RecentShape {
  const pool = patternPool(days);
  const withStart = pool.filter((d) => d.firstStartHour !== null);
  const earliest = withStart.reduce<ObservedDay | null>(
    (best, d) => (!best || d.firstStartHour! < best.firstStartHour! ? d : best),
    null,
  );
  const mornings = days.filter((d) => d.complete && d.morningOff !== null);
  const runs = days.map((d) => d.firstRunHours).filter((h): h is number => h !== null);
  const ends = days.map((d) => d.endHour).filter((h): h is number => h !== null);
  const peaks = days.filter((d) => d.complete).map((d) => d.peakCfs).filter((v): v is number => v !== null);
  return {
    earliest: earliest ? { hour: earliest.firstStartHour!, dayKey: earliest.dayKey } : null,
    morningsKnown: mornings.length,
    morningsOff: mornings.filter((d) => d.morningOff).length,
    typicalRunHours: median(runs),
    runDays: runs.length,
    typicalEndHour: median(ends),
    typicalPeakCfs: median(peaks),
    peakDays: peaks.length,
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
  /** Days the units came on more than an hour before the posted start. */
  startedEarlyDays: string[];
  /** Units came on more than an hour after the posted start. */
  startedLate: number;
  /** Days the units generated when nothing was posted. */
  ranUnpostedDays: string[];
  /** Days generation was posted and none ran, or the shape otherwise disagreed. */
  otherMismatch: number;
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
 * The plan scored is the latest version stored by PLAN_CUTOFF_HOUR that
 * morning. Versions must come with minimum-flow hours marked
 * (markMinimumFlowHours): Bull Shoals' schedules stored before that flag
 * existed post its minimum flow in every hour. Days whose first start is
 * hidden by a gap are not scored.
 */
export function scheduleReliability(
  versions: readonly ScheduleVersion[],
  days: readonly ObservedDay[],
): ScheduleReliability | null {
  const ordered = [...versions]
    .map((v) => ({ ...v, seen: Date.parse(v.firstSeenAt) }))
    .filter((v) => Number.isFinite(v.seen))
    .sort((a, b) => a.seen - b.seen);

  const result: ScheduleReliability = { daysCompared: 0, matched: 0, startedEarlyDays: [], startedLate: 0, ranUnpostedDays: [], otherMismatch: 0 };

  for (const day of patternPool(days)) {
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
    else if (!scheduled.any && observedAny) result.ranUnpostedDays.push(day.dayKey);
    else if (scheduled.any && !observedAny) result.otherMismatch += 1;
    else if (scheduled.start === null && day.firstStartHour === null) result.matched += 1;
    else if (scheduled.start === null || day.firstStartHour === null) result.otherMismatch += 1;
    else {
      const diff = day.firstStartHour - scheduled.start;
      if (Math.abs(diff) <= 1) result.matched += 1;
      else if (diff < 0) result.startedEarlyDays.push(day.dayKey);
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
  /** Windows still to come (today) or all of them (tomorrow). */
  windows: PostedWindow[];
  /** First posted start of the WHOLE day, hour-of-day; null when none. */
  firstStartHour: number | null;
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
 * Today keeps only windows that have not ended. Tomorrow is only read when it
 * is the next calendar day, the consecutive-days rule scheduleStateNow keeps.
 * Recomputed against the CURRENT snapshot each time a Read is served, so a
 * window that ended at noon is gone by one.
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
      firstStartHour: windows.length ? windows[0].fromHour : null,
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

export interface GenerationRef {
  units: number;
  fullGenerationCfs: number;
}

export interface DamReadInputs {
  damId: string;
  damName: string;
  riverName: string | null;
  tailwaterFishery: 'trout' | 'warmwater' | null;
  floorCfs: number;
  /** SWPA's reference pair, for the release row's unit equivalents. */
  reference: GenerationRef | null;
  schedule: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>>;
  observed: readonly ObservedHourRow[];
  scheduleVersions: readonly ScheduleVersion[];
  waterTempF: WaterQualityFact | null;
  dissolvedOxygenMgL: WaterQualityFact | null;
  now?: number;
}

/** Plain JSON: stored in dam_updates.facts and re-rendered when served. */
export interface DamReadFacts {
  damId: string;
  damName: string;
  riverName: string | null;
  tailwaterFishery: 'trout' | 'warmwater' | null;
  reference: GenerationRef | null;
  todayGroup: DayGroup;
  todayWeekday: string;
  posted: PostedSchedule | null;
  weekday: StartPattern | null;
  weekend: StartPattern | null;
  shape: RecentShape;
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
    reference: input.reference,
    todayGroup: isWeekendDay(today) ? 'weekend' : 'weekday',
    todayWeekday: new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    posted: postedSchedule(input.schedule, now),
    weekday: startPattern(days, 'weekday'),
    weekend: startPattern(days, 'weekend'),
    shape: recentShape(days),
    reliability: scheduleReliability(input.scheduleVersions, days),
    waterTempF: freshEnough(input.waterTempF, now),
    dissolvedOxygenMgL: freshEnough(input.dissolvedOxygenMgL, now),
    now,
  };
}

/** The same facts with the posted schedule re-read from the current snapshot. */
export function withCurrentSchedule(
  facts: DamReadFacts,
  schedule: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>>,
  now = Date.now(),
): DamReadFacts {
  return { ...facts, posted: postedSchedule(schedule, now), now };
}

/** Whether there is anything worth writing a Read about. */
export function damReadHasSubstance(f: DamReadFacts): boolean {
  return Boolean(f.posted || f.weekday || f.weekend);
}

// ---------------------------------------------------------------------------
// Rows: the facts, in words, rendered by code
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

/** "6 AM – 8 AM, 9 AM – 11 AM and 4 PM – 7 PM". */
function listWindows(windows: readonly PostedWindow[]): string {
  const labels = windows.map((w) => w.label);
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function rangeLabel(from: number, to: number): string {
  return from === to ? `Around ${clockLabel(from)}` : `${clockLabel(from)} – ${clockLabel(to)}`;
}

function postedValue(day: PostedDay | undefined): string {
  if (!day) return 'Not posted yet';
  if (day.windows.length) return listWindows(day.windows);
  if (day.dayOffset === 0 && day.firstStartHour !== null) return 'Done for the day';
  return day.minimumFlowOnly ? 'Minimum flow only' : 'No generation';
}

function patternValue(p: StartPattern): string {
  if (p.consistent && p.rangeFromHour !== null && p.rangeToHour !== null) return rangeLabel(p.rangeFromHour, p.rangeToHour);
  if (p.daysWithStart === 0 && p.daysWithoutGeneration === p.days) return 'Mostly off';
  return 'No consistent pattern';
}

function roundCfs(cfs: number): number {
  return Math.round(cfs / 100) * 100;
}

function centralTimeOf(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockLabel(Math.floor(centralClock(ms).hoursElapsed)) : null;
}

/** Today's posted start against the recent pattern for today's kind of day. */
function todayAgainstUsual(f: DamReadFacts): string | null {
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  const p = f.todayGroup === 'weekend' ? f.weekend : f.weekday;
  if (!today || !p) return null;
  const plural = groupPlural(p.group);
  if (today.firstStartHour === null) {
    return p.daysWithoutGeneration * 2 < p.days ? `Quieter than most recent ${plural}` : null;
  }
  if (!p.consistent || p.rangeFromHour === null || p.rangeToHour === null) return null;
  if (today.firstStartHour < p.rangeFromHour - 1) return `Earlier start than recent ${plural}`;
  if (today.firstStartHour > p.rangeToHour + 1) return `Later start than recent ${plural}`;
  return `In line with recent ${plural}`;
}

export function damReadRows(f: DamReadFacts): DamReadRow[] {
  const rows: DamReadRow[] = [];
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  const tomorrow = f.posted?.days.find((d) => d.dayOffset === 1);

  rows.push({
    key: 'posted-today',
    label: 'Posted today',
    value: postedValue(today),
    detail: f.posted?.mayBeOutdated ? 'Eddy\'s copy may be out of date' : 'At the dam · subject to change',
  });
  if (tomorrow) rows.push({ key: 'posted-tomorrow', label: 'Posted tomorrow', value: postedValue(tomorrow) });

  const against = todayAgainstUsual(f);
  if (against) rows.push({ key: 'today-vs-usual', label: 'Against recent days', value: against });

  for (const p of [f.weekday, f.weekend]) {
    if (!p) continue;
    rows.push({
      key: `start-${p.group}s`,
      label: `Usual first start, ${groupPlural(p.group)}`,
      value: patternValue(p),
      detail: `Last ${PATTERN_WINDOW_DAYS} days · ${p.days} ${p.group === 'weekday' ? 'weekdays' : 'weekend days'} measured`,
    });
  }

  // Stated whenever known, pattern or no pattern: early is the dangerous miss.
  if (f.shape.earliest) {
    rows.push({
      key: 'earliest',
      label: 'Earliest recent start',
      value: clockLabel(f.shape.earliest.hour),
      detail: scheduleDayLabel(f.shape.earliest.dayKey),
    });
  }

  if (f.shape.morningsKnown >= MIN_DAYS_FOR_SHAPE) {
    rows.push({
      key: 'mornings',
      label: 'Mornings',
      value: `Off before noon on ${f.shape.morningsOff} of ${f.shape.morningsKnown} days`,
    });
  }

  if (f.shape.typicalRunHours !== null && f.shape.runDays >= MIN_DAYS_FOR_SHAPE) {
    const hours = f.shape.typicalRunHours;
    rows.push({
      key: 'run',
      label: 'Typical run',
      value: `About ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
      detail: f.shape.typicalEndHour !== null ? `Usually off by ${clockLabel(f.shape.typicalEndHour)}` : undefined,
    });
  }

  if (f.shape.typicalPeakCfs !== null && f.shape.peakDays >= MIN_DAYS_FOR_SHAPE) {
    const cfs = roundCfs(f.shape.typicalPeakCfs);
    // The arithmetic of unitEquivalents in shared/dam-generation.ts: flow as a
    // share of SWPA's full-generation discharge, times the unit count.
    const ref = f.reference;
    const units = ref && ref.fullGenerationCfs > 0 && ref.units > 0 ? (f.shape.typicalPeakCfs / ref.fullGenerationCfs) * ref.units : null;
    rows.push({
      key: 'release',
      label: 'Typical daily peak',
      value: units === null
        ? `About ${cfs.toLocaleString('en-US')} cfs`
        : units < 0.75 ? 'Under one unit' : `About ${Math.round(units)} of ${ref!.units} units`,
      detail: units === null ? 'Estimated from turbine flow' : `About ${cfs.toLocaleString('en-US')} cfs · estimated from flow`,
    });
  }

  if (f.reliability) {
    const r = f.reliability;
    const notes: string[] = [];
    if (r.startedEarlyDays.length) notes.push(`Came on earlier than posted: ${r.startedEarlyDays.map(scheduleDayLabel).join(', ')}`);
    if (r.ranUnpostedDays.length) notes.push(`Ran with nothing posted: ${r.ranUnpostedDays.map(scheduleDayLabel).join(', ')}`);
    rows.push({
      key: 'schedule-held',
      label: 'Posted schedule held',
      value: `First start within an hour on ${r.matched} of ${r.daysCompared} days`,
      detail: notes.length ? notes.join(' · ') : undefined,
    });
  }

  // Each reading keeps its own station: they are often different monitors.
  if (f.waterTempF) {
    const at = centralTimeOf(f.waterTempF.observedAt);
    rows.push({ key: 'water-temp', label: 'Water temperature', value: `${Math.round(f.waterTempF.value)}°F`, detail: `${f.waterTempF.where}${at ? `, as of ${at}` : ''}` });
  }
  if (f.dissolvedOxygenMgL) {
    const at = centralTimeOf(f.dissolvedOxygenMgL.observedAt);
    rows.push({ key: 'oxygen', label: 'Dissolved oxygen', value: `${f.dissolvedOxygenMgL.value.toFixed(1)} mg/L`, detail: `${f.dissolvedOxygenMgL.where}${at ? `, as of ${at}` : ''}` });
  }

  return rows;
}

/** One sentence about today, from the posted schedule; rendered by code. */
export function damReadHeadline(f: DamReadFacts): string {
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  if (today) {
    if (today.windows.length) return `Generation scheduled ${listWindows(today.windows)} today at the dam.`;
    if (today.firstStartHour !== null) return 'Today\'s scheduled generation at the dam is done.';
    return today.minimumFlowOnly
      ? 'Only minimum flow scheduled at the dam for the rest of today.'
      : 'No generation scheduled at the dam for the rest of today.';
  }
  const p = f.todayGroup === 'weekend' ? f.weekend : f.weekday;
  if (p?.consistent && p.rangeFromHour !== null && p.rangeToHour !== null) {
    const when = p.rangeFromHour === p.rangeToHour ? `around ${clockLabel(p.rangeFromHour)}` : `between ${clockLabel(p.rangeFromHour)} and ${clockLabel(p.rangeToHour)}`;
    return `No schedule posted yet. Recent ${groupPlural(p.group)} have usually started ${when} at the dam.`;
  }
  return 'No schedule posted for today yet.';
}

export const AT_THE_DAM_CAVEAT =
  'Times are at the dam, in Central time. Water downstream rises later the farther below it you are, and the posted schedule can change. Check it before you wade.';

// ---------------------------------------------------------------------------
// Prose: the model's part, and the rules it cannot get around
// ---------------------------------------------------------------------------

const PROSE_RULES: Array<[RegExp, string]> = [
  [/\d/, 'contains a number'],
  [/\b(?:noon|midnight|o'?clock)\b|\b[ap]\.?\s?m\b\.?/i, 'contains a clock time'],
  [/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|twenty)\b/i, 'spells out a number'],
  [/\b(?:today|tonight|tomorrow|this (?:morning|afternoon|evening))\b/i, 'talks about today; the rows do that'],
  [/\b(?:schedul\w*|posted|plan(?:s|ned)?)\b/i, 'describes the schedule; the rows do that'],
  [/\b(?:right now|currently|at the moment|at present|as of)\b|\b(?:is|are) (?:now )?(?:generating|running|off|idle|releasing)\b/i, 'claims a live state'],
  [/\bwill (?:start|rise|come on|come up|generate|run|begin|turn on|kick on|be)\b|\bguarantee|\b(?:predictable|reliably|like clockwork)\b/i, 'makes a promise'],
  [/\b(?:cfs|mg\/?l|percent|oxygen|degrees?)\b|°|%/i, 'quotes a measurement'],
];

/** Problems with model prose. Empty means it may be served. */
export function damProseProblems(prose: string): string[] {
  const text = prose.trim();
  if (text.length < 20) return ['too short'];
  if (text.length > 600) return ['too long'];
  return PROSE_RULES.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
}

function timeOfDay(hour: number): string {
  return hour < MORNING_ENDS_HOUR ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}

/** The interpretation written from the facts alone, when the model's cannot be served. */
export function damProseFallback(f: DamReadFacts): string {
  const lead = f.todayGroup === 'weekend' ? f.weekend : f.weekday;
  const other = f.todayGroup === 'weekend' ? f.weekday : f.weekend;
  const sentences: string[] = [];

  if (!lead && !other) {
    sentences.push('There is not enough recent history at this dam to describe a pattern.');
  } else if (lead?.consistent && lead.typicalStartHour !== null) {
    sentences.push(`${timeOfDay(lead.typicalStartHour)} runs have been the rule on recent ${groupPlural(lead.group)}.`);
  } else if (lead && lead.daysWithStart === 0 && lead.daysWithoutGeneration === lead.days) {
    sentences.push(`Recent ${groupPlural(lead.group)} have been mostly quiet at the dam.`);
  } else if (lead) {
    sentences.push(`Start times on recent ${groupPlural(lead.group)} have moved around too much to lean on.`);
  }

  const s = f.shape;
  if (s.morningsKnown >= MIN_DAYS_FOR_SHAPE && s.morningsOff / s.morningsKnown >= 0.8) {
    sentences.push('Mornings have stayed quiet on most days.');
  }
  if (s.typicalRunHours !== null && s.runDays >= MIN_DAYS_FOR_SHAPE) {
    if (s.typicalRunHours <= 5) sentences.push('Runs have been short peaking runs rather than all-day releases.');
    else if (s.typicalRunHours >= 12) sentences.push('Runs have lasted most of the day.');
  }
  if (lead?.consistent && other?.consistent && lead.typicalStartHour !== null && other.typicalStartHour !== null
    && Math.abs(lead.typicalStartHour - other.typicalStartHour) >= 2) {
    const weekend = lead.group === 'weekend' ? lead : other;
    const weekday = lead.group === 'weekend' ? other : lead;
    sentences.push(`Weekends have started ${weekend.typicalStartHour! > weekday.typicalStartHour! ? 'later' : 'earlier'} than weekdays.`);
  }
  if ((f.weekday?.earlyDays ?? 0) + (f.weekend?.earlyDays ?? 0) > 0) {
    sentences.push('Now and then the units have come on well before the usual time, which is the case that catches people in rising water.');
  }
  return sentences.join(' ');
}

/** Take the model's [READ] block, check it, and fall back. The one door prose passes through. */
export function prepareDamProse(raw: string, f: DamReadFacts): { prose: string; usedFallback: boolean; problems: string[] } {
  const match = raw.match(/\[READ\]\s*([\s\S]*)$/i);
  const prose = match ? match[1].trim() : '';
  const problems = prose ? damProseProblems(prose) : ['missing [READ] block'];
  return problems.length
    ? { prose: damProseFallback(f), usedFallback: true, problems }
    : { prose, usedFallback: false, problems };
}

/** The facts block of the prompt: the rows the reader will see, plus the pattern in words. */
export function damReadFactsPrompt(f: DamReadFacts): string {
  const lines: string[] = [];
  lines.push(`Dam: ${f.damName}${f.tailwaterFishery === 'trout' ? ', on a trout tailwater' : ''}.${f.riverName ? ` Water below it: ${f.riverName}.` : ''}`);
  lines.push(`Today is ${f.todayWeekday}, a ${f.todayGroup}.`);
  lines.push('');
  lines.push('[ROWS THE READER SEES BESIDE YOUR TEXT — do not repeat them]');
  for (const row of damReadRows(f)) lines.push(`${row.label}: ${row.value}${row.detail ? ` (${row.detail})` : ''}`);
  lines.push('');
  lines.push('[PATTERN NOTES — for your interpretation]');
  for (const p of [f.weekday, f.weekend]) {
    if (!p) continue;
    const plural = groupPlural(p.group);
    if (!p.daysWithStart) lines.push(`${plural}: no starts in the window.`);
    else if (!p.consistent) lines.push(`${plural}: starts varied too widely to call a pattern.`);
    else lines.push(`${plural}: usually a ${timeOfDay(p.typicalStartHour!).toLowerCase()} start${p.earlyDays ? '; on some days the units came on well before the usual time' : ''}.`);
  }
  if (f.weekday?.consistent && f.weekend?.consistent && f.weekday.typicalStartHour !== null && f.weekend.typicalStartHour !== null) {
    const diff = f.weekend.typicalStartHour - f.weekday.typicalStartHour;
    if (Math.abs(diff) >= 2) lines.push(`Weekends start ${diff > 0 ? 'later' : 'earlier'} than weekdays.`);
  }
  return lines.join('\n');
}
