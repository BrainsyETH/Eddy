// src/lib/eddy/dam-read-facts.ts
// A dam's Eddy's Read: the facts, the conclusions they support, and the words.
//
// Pure: no SDK, no database, no network. The generator fetches the inputs and
// hands them here; everything the reader sees is decided in this file, where a
// test can replay it.
//
// ── Code writes the whole Read ─────────────────────────────────────────────
// Two earlier versions gave a model part of the job and checked its text
// afterwards. Review broke both checks. The first passed a wrong schedule and
// invented counts; the second banned numbers and clock words but never saw the
// facts, so "Mornings have stayed quiet" passed beside fourteen mornings of
// generation. A claim with no number in it is still a claim.
//
// So the Read is now written here, from conclusions computed against the
// facts (damReadStory), in Eddy's voice (src/lib/eddy/voice.ts: a local
// outfitter at the counter, plain words, warnings direct). Nothing can say
// something the numbers do not. ADR 0017.
//
// ── Current presentation ───────────────────────────────────────────────────
// takeaway is one short headline and at most two sentences: what is posted
// next from the serving clock, with how long it runs and how hard, then the
// one thing about today that most departs from the last two weeks. See "The
// compact Read" below. The schedule and generation-pattern chart already
// surround the Read. The full report fields below remain for released clients
// during the mobile rollout.
//
// ── Legacy reading order ───────────────────────────────────────────────────
//   headline   today's posted generation and how it compares with recent days
//   story      two or three sentences: surprises first, then the pattern
//   keyRows    the two or three facts that back the story
//   detailRows "Recent pattern details", collapsed by default
// Water temperature and the posted schedule itself are free on the dam page and
// are not repeated here. What Premium buys is what they mean.
//
// ── Definitions that keep the numbers honest ───────────────────────────────
// - 14 complete Central days, weekdays and weekends apart: these powerhouses
//   change regime with the season, and a 90-day median described none of them.
// - A usual start is stated only when the middle half of recent starts sits
//   inside CONSISTENT_SPREAD_HOURS, and always alongside how many days had any
//   generation, so three starts in nine weekdays never reads as "the rule".
// - A day whose first start could be hidden by missing hours has an UNKNOWN
//   start and leaves the pattern and the track record.
// - A typical day is total generating hours and number of runs, not the first
//   run. Runs that carry on past midnight are counted as such, never dropped.
// - The schedule track record scores only days where something was posted or
//   ran; quiet days posted quiet are counted on their own.
//
// ── Everything is at the dam ───────────────────────────────────────────────
// Nothing here models how long a rise takes to reach an access downstream;
// AT_THE_DAM_CAVEAT travels with every Read.

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
import { generatorEquivalentPhrase } from '@shared/dam-generation';
import type { DamReadRow, DamScheduleCheck, DamScheduleDay } from '@shared/dam-types';
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
/** Fewer known days than this and a shape fact (mornings, typical day, peak) is left out. */
export const MIN_DAYS_FOR_SHAPE = 5;
/** Fewer scored days than this and the schedule track record is not stated. */
export const MIN_RELIABILITY_DAYS = 10;
/**
 * The plan a day is scored against is the one Eddy held by this hour of that
 * morning (Central). Not midnight: SWPA's sheet for a day often lands just
 * after it. A revision after it is not credited to the plan.
 */
export const PLAN_CUTOFF_HOUR = 5;
/** "Mornings" are the hours before this (Central). */
export const MORNING_ENDS_HOUR = 12;
/** Mornings are called quiet only at or above this share of known mornings. */
export const QUIET_MORNINGS_SHARE = 0.8;
/** An isolated exception can qualify the compact Read for these complete Central days. */
export const RECENT_EXCEPTION_DAYS = 3;

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
  /** True when a missing hour could be hiding the first start. */
  startUnknown: boolean;
  /** No generation before MORNING_ENDS_HOUR; false if any morning hour ran; null when a gap leaves it open. */
  morningOff: boolean | null;
  /** Separate stretches of generation, on a fully observed day. */
  runs: number | null;
  /** Generation was still going in the day's last hour, on a fully observed day. */
  pastMidnight: boolean | null;
  /** Central hour the last run ended (exclusive), on a fully observed day that ended before midnight. */
  endHour: number | null;
  /** Highest hourly turbine flow while generating, cfs. */
  peakCfs: number | null;
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
    let morningRan = false;
    let morningGap = false;
    let coverage = 0;
    let generatingHours = 0;
    let peakCfs: number | null = null;
    let gapSeen = false;
    let firstStartIndex: number | null = null;
    let startUnknown = false;
    let runs = 0;
    let lastOnIndex: number | null = null;
    let previousOn: boolean | null = null;

    for (let i = 0; i < length; i += 1) {
      const ms = start + i * HOUR_MS;
      const value = values.get(ms);
      // Visit actual elapsed hours: both November 1 AMs count, and the absent
      // March 2 AM is not a missing observation.
      const morning = centralClock(ms).hoursElapsed < MORNING_ENDS_HOUR;
      if (value === undefined) {
        if (morning) morningGap = true;
        gapSeen = true;
        previousOn = null;
        continue;
      }
      const on = value >= floorCfs;
      coverage += 1;
      if (morning && on) morningRan = true;
      if (on && previousOn !== true) runs += 1;
      previousOn = on;
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
    const pastMidnight = fullyObserved ? lastOnIndex === length - 1 : null;

    return {
      dayKey,
      weekend: isWeekendDay(dayKey),
      coverage,
      complete: coverage >= MIN_DAY_COVERAGE_HOURS,
      fullyObserved,
      generatingHours,
      firstStartHour: firstStartIndex === null ? null : hourOf(firstStartIndex),
      startUnknown,
      // An observed morning run settles it even with gaps.
      morningOff: morningRan ? false : morningGap ? null : true,
      runs: fullyObserved ? runs : null,
      pastMidnight,
      endHour: fullyObserved && lastOnIndex !== null && !pastMidnight ? hourOf(lastOnIndex) + 1 : null,
      peakCfs,
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
  /** Of those, days with any generation at all. */
  daysWithGeneration: number;
  daysWithStart: number;
  typicalStartHour: number | null;
  /** The middle half of first starts, Central hour-of-day. */
  rangeFromHour: number | null;
  rangeToHour: number | null;
  /** Starts at least CONSISTENT_SPREAD_HOURS before the typical one. */
  earlyDays: number;
  /** The middle half is tight enough, and has enough starts, to state. */
  consistent: boolean;
}

/** Days the pattern may count: complete, with a first start not hidden by a gap. */
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
    daysWithGeneration: pool.filter((d) => d.generatingHours > 0).length,
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
  /** The earliest known first start in the window, and its day. */
  earliest: { hour: number; dayKey: string } | null;
  morningsKnown: number;
  morningsOff: number;
  /** Fully observed days with generation: the base for the typical day. */
  generatingDays: number;
  typicalHours: number | null;
  typicalRuns: number | null;
  daysPastMidnight: number;
  /** Median end hour, over the days that ended before midnight. */
  typicalEndHour: number | null;
  typicalPeakCfs: number | null;
  peakDays: number;
}

export function recentShape(days: readonly ObservedDay[]): RecentShape {
  const pool = patternPool(days);
  const earliest = pool
    .filter((d) => d.firstStartHour !== null)
    .reduce<ObservedDay | null>((best, d) => (!best || d.firstStartHour! < best.firstStartHour! ? d : best), null);
  const mornings = days.filter((d) => d.complete && d.morningOff !== null);
  const generating = days.filter((d) => d.fullyObserved && d.generatingHours > 0);
  const peaks = days.filter((d) => d.complete).map((d) => d.peakCfs).filter((v): v is number => v !== null);
  return {
    earliest: earliest ? { hour: earliest.firstStartHour!, dayKey: earliest.dayKey } : null,
    morningsKnown: mornings.length,
    morningsOff: mornings.filter((d) => d.morningOff).length,
    generatingDays: generating.length,
    typicalHours: median(generating.map((d) => d.generatingHours)),
    typicalRuns: median(generating.map((d) => d.runs!)),
    daysPastMidnight: generating.filter((d) => d.pastMidnight).length,
    typicalEndHour: median(generating.map((d) => d.endHour).filter((h): h is number => h !== null)),
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
  /** Days where generation was posted or ran, and the plan was known. */
  daysCompared: number;
  /** Of those, the first start came within an hour of the posted one. */
  onTime: number;
  /** Generation started more than an hour before the posted start. */
  startedEarlyDays: string[];
  /** Generation started more than an hour after the posted start. */
  startedLate: number;
  /** The dam generated with nothing posted. */
  ranUnpostedDays: string[];
  /** Generation was posted and none ran, or a start could not be compared. */
  otherMismatch: number;
  /** Nothing posted and nothing ran: counted apart, not as "on time". */
  quietDaysKept: number;
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
 * The plan is the latest version stored by PLAN_CUTOFF_HOUR that morning.
 * Versions must come with minimum-flow hours marked (markMinimumFlowHours):
 * Bull Shoals' schedules stored before that flag existed post its minimum
 * flow in every hour. It scores the first start only, which is what the row
 * says; duration and later runs are not scored.
 */
export function scheduleReliability(
  versions: readonly ScheduleVersion[],
  days: readonly ObservedDay[],
): ScheduleReliability | null {
  const ordered = [...versions]
    .map((v) => ({ ...v, seen: Date.parse(v.firstSeenAt) }))
    .filter((v) => Number.isFinite(v.seen))
    .sort((a, b) => a.seen - b.seen);

  const r: ScheduleReliability = { daysCompared: 0, onTime: 0, startedEarlyDays: [], startedLate: 0, ranUnpostedDays: [], otherMismatch: 0, quietDaysKept: 0 };

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
    const ran = day.generatingHours > 0;
    if (!scheduled.any && !ran) {
      r.quietDaysKept += 1;
      continue;
    }
    r.daysCompared += 1;
    if (!scheduled.any) r.ranUnpostedDays.push(day.dayKey);
    else if (!ran || scheduled.start === null || day.firstStartHour === null) r.otherMismatch += 1;
    else {
      const diff = day.firstStartHour - scheduled.start;
      if (Math.abs(diff) <= 1) r.onTime += 1;
      else if (diff < 0) r.startedEarlyDays.push(day.dayKey);
      else r.startedLate += 1;
    }
  }

  return r.daysCompared >= MIN_RELIABILITY_DAYS ? r : null;
}

/** A posted generation stretch, in Central hours-of-day (end exclusive, 24 = midnight). */
export interface PostedWindow {
  fromHour: number;
  toHour: number;
  label: string;
  /**
   * The window's strongest and weakest posted hour, as a share of the dam's
   * scheduling capacity (posted megawatts over SWPA's capacity for the
   * project). Null without that capacity; absent on facts stored before
   * 2026-11-20.
   */
  peakShare?: number | null;
  lowShare?: number | null;
}

export interface PostedDay {
  scheduleDate: string;
  dayOffset: 0 | 1;
  /** Windows still to come (today) or all of them (tomorrow). */
  windows: PostedWindow[];
  /** First posted start of the WHOLE day, hour-of-day; null when none. */
  firstStartHour: number | null;
  minimumFlowOnly: boolean;
  /** Hours of posted generation in the WHOLE day. Absent on facts stored before 2026-11-20. */
  generatingHours?: number;
  /** Any posted generation before MORNING_ENDS_HOUR, in the WHOLE day. Absent as above. */
  morningGeneration?: boolean;
}

export interface PostedSchedule {
  days: PostedDay[];
  /** True when Eddy's copy is old enough that it may have been revised. */
  mayBeOutdated: boolean;
}

/**
 * Today's and tomorrow's posted generation, as windows.
 *
 * Recomputed against the CURRENT snapshot each time a Read is served, so a
 * window that ended at noon is gone by one. Tomorrow is only read when it is
 * the next calendar day.
 */
export function postedSchedule(
  schedule: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>>,
  now = Date.now(),
  reference: GenerationRef | null = null,
): PostedSchedule | null {
  const clock = centralClock(now);
  const todayIndex = schedule.findIndex((d) => d.scheduleDate === clock.dayKey);
  if (todayIndex === -1) return null;

  const currentHour = hourEndingNow(clock.hoursElapsed) - 1;
  const picked = [schedule[todayIndex]];
  const next = schedule[todayIndex + 1];
  if (next && next.scheduleDate === nextDayKey(clock.dayKey)) picked.push(next);

  const capacityMw = reference?.schedulingCapacityMw;
  const share = (megawatts: number) =>
    typeof capacityMw === 'number' && Number.isFinite(capacityMw) && capacityMw > 0 ? megawatts / capacityMw : null;

  const days = picked.map((day, offset): PostedDay => {
    const on = new Map(day.hours.map((h) => [h.hourEnding, scheduledGeneration(h)]));
    const megawatts = new Map(day.hours.map((h) => [h.hourEnding, h.megawatts]));
    const windows: PostedWindow[] = [];
    let runStart: number | null = null;
    for (let he = 1; he <= 25; he += 1) {
      const generating = he <= 24 && on.get(he) === true;
      if (generating && runStart === null) runStart = he;
      if (!generating && runStart !== null) {
        const to = he - 1;
        const posted: number[] = [];
        for (let h = runStart; h <= to; h += 1) posted.push(megawatts.get(h) ?? 0);
        windows.push({
          fromHour: runStart - 1,
          toHour: to,
          label: windowLabel(runStart, to),
          peakShare: share(Math.max(...posted)),
          lowShare: share(Math.min(...posted)),
        });
        runStart = null;
      }
    }
    return {
      scheduleDate: day.scheduleDate,
      dayOffset: offset as 0 | 1,
      windows: offset === 0 ? windows.filter((w) => w.toHour > currentHour) : windows,
      firstStartHour: windows.length ? windows[0].fromHour : null,
      minimumFlowOnly: windows.length === 0 && day.hours.some((h) => h.minimumFlow === true),
      generatingHours: windows.reduce((sum, w) => sum + (w.toHour - w.fromHour), 0),
      morningGeneration: windows.some((w) => w.fromHour < MORNING_ENDS_HOUR),
    };
  });

  return {
    days,
    mayBeOutdated: scheduleIsStale(oldestRetrievedAt(picked.map((d) => ({ retrievedAt: d.retrievedAt }))), now),
  };
}

export interface GenerationRef {
  units: number;
  fullGenerationCfs: number;
  /**
   * SWPA's scheduling capacity for the project, the denominator a posted
   * megawatt figure is a share of. Absent on facts stored before 2026-11-20,
   * and the Read then leaves the size of a posted run out.
   */
  schedulingCapacityMw?: number;
}

/**
 * Advance the saved windows when no current snapshot is available. The saved
 * schedule has already lost past windows, so it can only be used on its own
 * Central day. Keep the whole-day start and tomorrow's windows unchanged.
 * Advancing the clock cannot verify whether SWPA has revised this copy.
 */
export function advancePosted(posted: PostedSchedule | null, now = Date.now()): PostedSchedule | null {
  const clock = centralClock(now);
  const today = posted?.days.find((day) => day.dayOffset === 0 && day.scheduleDate === clock.dayKey);
  if (!posted || !today) return null;
  const currentHour = hourEndingNow(clock.hoursElapsed) - 1;
  return {
    ...posted,
    days: posted.days.map((day) => day === today
      ? { ...day, windows: day.windows.filter((window) => window.toHour > currentHour) }
      : day),
    mayBeOutdated: true,
  };
}

export interface DamReadInputs {
  damId: string;
  damName: string;
  floorCfs: number;
  /** SWPA's reference pair, for the peak in generators' worth. */
  reference: GenerationRef | null;
  schedule: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>>;
  observed: readonly ObservedHourRow[];
  scheduleVersions: readonly ScheduleVersion[];
  now?: number;
}

/** Plain JSON: stored in dam_updates.facts and re-rendered when served. */
export interface DamReadFacts {
  damId: string;
  damName: string;
  reference: GenerationRef | null;
  todayGroup: DayGroup;
  posted: PostedSchedule | null;
  weekday: StartPattern | null;
  weekend: StartPattern | null;
  shape: RecentShape;
  reliability: ScheduleReliability | null;
  now: number;
  /**
   * What the serving snapshot's last read of SWPA's sheets found. Set when
   * served (withCurrentSchedule), never stored: absent, or from another day,
   * a missing sheet is said as unverified. See missingScheduleLine.
   */
  scheduleCheck?: DamScheduleCheck | null;
}

export function buildDamReadFacts(input: DamReadInputs): DamReadFacts {
  const now = input.now ?? Date.now();
  const days = observedDays(input.observed, input.floorCfs, { now });
  return {
    damId: input.damId,
    damName: input.damName,
    reference: input.reference,
    todayGroup: isWeekendDay(centralClock(now).dayKey) ? 'weekend' : 'weekday',
    posted: postedSchedule(input.schedule, now, input.reference),
    weekday: startPattern(days, 'weekday'),
    weekend: startPattern(days, 'weekend'),
    shape: recentShape(days),
    reliability: scheduleReliability(input.scheduleVersions, days),
    now,
  };
}

/**
 * Cached history with the schedule re-read from the current snapshot, or its
 * saved windows advanced and marked unverified when that snapshot is missing.
 * The day type follows the serving clock too, so a Read is never framed
 * against yesterday's kind of day.
 */
export function withCurrentSchedule(
  facts: DamReadFacts,
  schedule: ReadonlyArray<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>> | null,
  now = Date.now(),
  reference: GenerationRef | null = facts.reference,
  scheduleCheck: DamScheduleCheck | null = null,
): DamReadFacts {
  return {
    ...facts,
    posted: schedule === null ? advancePosted(facts.posted, now) : postedSchedule(schedule, now, reference),
    todayGroup: isWeekendDay(centralClock(now).dayKey) ? 'weekend' : 'weekday',
    now,
    scheduleCheck,
  };
}

const CHECK_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });

/**
 * What to say where a posted day would go, when Eddy holds none.
 *
 * "Isn't posted yet" claimed something about SWPA that a failed request
 * cannot establish. So the line says only what the last read found:
 * - the sheet was read today and did not have this day: "No schedule
 *   available as of 9:10 AM CT", the time being that read's;
 * - anything else (the read failed, there is no record of one, or it was
 *   made on an earlier Central day, so it was about another day's sheet):
 *   the schedule couldn't be verified.
 */
export function missingScheduleLine(f: DamReadFacts, day: 'today' | 'tomorrow'): { verified: true; asOf: string } | { verified: false } {
  const check = f.scheduleCheck;
  const outcome = check ? check[day] : undefined;
  if (!check || !outcome || outcome === 'failed') return { verified: false };
  const at = Date.parse(check.checkedAt);
  if (!Number.isFinite(at) || at > f.now + 5 * 60_000) return { verified: false };
  if (centralClock(at).dayKey !== centralClock(f.now).dayKey) return { verified: false };
  return { verified: true, asOf: `${CHECK_TIME.format(at)} CT` };
}

/** Whether there is anything worth writing a Read about. */
export function damReadHasSubstance(f: DamReadFacts): boolean {
  return Boolean(f.posted || f.weekday || f.weekend);
}

// ---------------------------------------------------------------------------
// Words, in Eddy's voice
// ---------------------------------------------------------------------------
//
// The voice is src/lib/eddy/voice.ts: an outfitter at the counter, plain and
// direct. In practice, for a dam:
//   - "generation", "generating" and "generators' worth", the words the rest
//     of the dam page uses. Never "units came on" or "first start".
//   - "posted" for SWPA's plan, "lately" and "usually" for the record.
//   - Surprises are said plainly and first ("Heads up"), because early water
//     is the part that matters to someone standing in the river.
//   - Counts stay attached to what they count ("3 of the last 9 weekdays").

/** Central hour-of-day -> "3 PM", "noon", "midnight". The schedule's own labels. */
export function clockLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return 'midnight';
  if (normalized === 12) return 'noon';
  return hourEndingLabel(normalized + 1);
}

function plural(group: DayGroup): string {
  return group === 'weekday' ? 'weekdays' : 'weekends';
}

/** For counts: "of the last 9 weekdays" / "of the last 4 weekend days". */
function daysNoun(group: DayGroup, n: number): string {
  if (group === 'weekday') return n === 1 ? 'weekday' : 'weekdays';
  return n === 1 ? 'weekend day' : 'weekend days';
}

function partOfDay(hour: number): string {
  return hour < MORNING_ENDS_HOUR ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

function dayName(dayKey: string): string {
  return scheduleDayLabel(dayKey);
}

function listWindows(windows: readonly PostedWindow[]): string {
  const labels = windows.map((w) => w.label);
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function listDays(dayKeys: readonly string[]): string {
  const names = dayKeys.map(dayName);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function rangePhrase(from: number, to: number): string {
  return from === to ? `around ${clockLabel(from)}` : `between ${clockLabel(from)} and ${clockLabel(to)}`;
}

/** The pattern for today's kind of day, when it is consistent. */
function leadPattern(f: DamReadFacts): StartPattern | null {
  return f.todayGroup === 'weekend' ? f.weekend : f.weekday;
}

/** Most days in the group generated at all. */
function mostlyGenerating(p: StartPattern): boolean {
  return p.daysWithGeneration * 2 > p.days;
}

/** A posted day's start against recent days of the same kind (weekday or weekend). */
function comparison(f: DamReadFacts, offset: 0 | 1): { versus: 'in-line' | 'earlier' | 'later' | 'quieter'; group: DayGroup } | null {
  const day = f.posted?.days.find((d) => d.dayOffset === offset);
  if (!day) return null;
  const group: DayGroup = isWeekendDay(day.scheduleDate) ? 'weekend' : 'weekday';
  const p = group === 'weekend' ? f.weekend : f.weekday;
  if (!p) return null;
  // Minimum flow only is the idle state at a minimum-flow project.
  if (day.firstStartHour === null) return mostlyGenerating(p) ? { versus: 'quieter', group } : null;
  if (!p.consistent || p.rangeFromHour === null || p.rangeToHour === null || !mostlyGenerating(p)) return null;
  if (day.firstStartHour < p.rangeFromHour - 1) return { versus: 'earlier', group };
  if (day.firstStartHour > p.rangeToHour + 1) return { versus: 'later', group };
  return { versus: 'in-line', group };
}

/** Eligible warnings can qualify today's news or replace a generic comparison. */
function compactException(f: DamReadFacts): { headline: string; clause: string } | null {
  const r = f.reliability;
  if (!r) return null;
  const tracked = patternDayKeys(PATTERN_WINDOW_DAYS, f.now).slice(0, -1);
  const recent = new Set(tracked.slice(-RECENT_EXCEPTION_DAYS));
  const eligible = (days: string[]) => {
    const unique = [...new Set(days)].filter(day => tracked.includes(day)).sort();
    return unique.length >= 2 || unique.some(day => recent.has(day)) ? unique : [];
  };
  const early = eligible(r.startedEarlyDays);
  const unposted = eligible(r.ranUnpostedDays);
  if (!early.length && !unposted.length) return null;
  if (early.length && unposted.length) {
    const count = (n: number) => n === 1 ? 'once' : `${n} times`;
    return {
      headline: 'Early and unposted generation lately',
      clause: `in ${r.daysCompared} tracked days, generation started over an hour early ${count(early.length)} and ran without a posted start ${count(unposted.length)}`,
    };
  }
  const days = early.length ? early : unposted;
  const what = early.length ? 'generation started over an hour early' : 'generation ran without a posted start';
  return {
    headline: early.length ? 'Generation has started early' : 'Generation has run without a posted start',
    clause: days.length === 1
      ? `${what} on ${dayName(days[0])}`
      : `${what} on ${days.length} of ${r.daysCompared} tracked days, most recently ${dayName(days.at(-1)!)}`,
  };
}

// ── The compact Read ───────────────────────────────────────────────────────
//
// A headline and at most two sentences (TAKEAWAY_MAX_WORDS). The first
// sentence is what is posted NEXT, from the serving clock: the run in progress
// or the next one, how long it lasts and how hard the dam is posted to run.
// The second is the one thing about today that most departs from the last two
// weeks, or the schedule's track record when nothing does.
//
// Why it changed (2026-11-20). The earlier takeaway compared the day's FIRST
// posted start with the usual first start and said nothing else. Read against
// the Reads stored on 2026-11-19: Norfork's said "A familiar start time" on a
// day posted for 3 hours where recent days ran 12; Table Rock's said starts
// were "too scattered for a usual time" on a morning with nothing posted until
// 4 PM, after generation on 10 of the last 14 mornings; Bull Shoals' still led
// with its 5 AM start at 1 PM; and every evening Read said tomorrow was not
// posted and stopped, beside a pattern that could have answered. ADR 0017.

/** Longest compact Read, in words. */
export const TAKEAWAY_MAX_WORDS = 60;
/** From this Central hour the reader is planning tomorrow. */
export const EVENING_STARTS_HOUR = 17;
/** Mornings are called busy at or above this share of known mornings with generation. */
export const BUSY_MORNINGS_SHARE = 0.6;
/** A posted day is short or long only when it is this many hours from the typical one, and half or double it. */
export const DAY_LENGTH_GAP_HOURS = 3;

/** The Central hour-of-day (0-23) the serving clock is in. */
function servingHour(now: number): number {
  return hourEndingNow(centralClock(now).hoursElapsed) - 1;
}

/**
 * A posted share of the dam's full power, in the fractions someone would say
 * out loud. Not "light" or "heavy": on a tailwater "light generation" reads as
 * an all-clear to someone wading, and nothing here may sound like one. Not
 * "generators' worth" either (owner, 2026-11-20): the dam page keeps that for
 * the measured rack, and a posted megawatt figure is a share of capacity, which
 * says nothing about how many generators carry it.
 */
export function powerPhrase(share: number | null | undefined): string | null {
  if (typeof share !== 'number' || !Number.isFinite(share) || share <= 0) return null;
  if (share >= 0.875) return 'close to full power';
  if (share >= 0.708) return 'about three quarters of full power';
  if (share >= 0.583) return 'about two thirds of full power';
  if (share >= 0.417) return 'about half power';
  if (share >= 0.29) return 'about a third of full power';
  if (share >= 0.18) return 'about a quarter of full power';
  return 'well under a quarter of full power';
}

/** How hard a posted run is posted to go: one phrase when it holds, its peak when it does not. */
function sizeClause(w: PostedWindow): string {
  const peak = powerPhrase(w.peakShare);
  if (!peak) return '';
  return powerPhrase(w.lowShare) === peak ? ` at ${peak}` : `, peaking at ${peak}`;
}

function fromTo(w: PostedWindow): string {
  return `from ${clockLabel(w.fromHour)} to ${clockLabel(w.toHour)}`;
}

/** The posted runs after the one just named, without listing every window. */
function laterRuns(rest: readonly PostedWindow[], brief = false): string {
  if (!rest.length) return '';
  if (rest.length === 1) return `, and again ${fromTo(rest[0])}`;
  if (brief) return `, with ${rest.length} more runs after`;
  return `, with ${rest.length} more runs posted after that, the last ending at ${clockLabel(rest.at(-1)!.toHour)}`;
}

/** How much of the lead a caller with less room keeps. */
interface LeadDetail {
  /** State how hard the run is posted to go. */
  size: boolean;
  /** The runs after it: named or counted in full, counted briefly, or left out. */
  later: 'full' | 'brief' | 'none';
}

const FULL_LEAD: LeadDetail = { size: true, later: 'full' };

/** What is posted next today. Call only with a window still to come or in progress. */
function todayLead(today: PostedDay, hour: number, detail: LeadDetail = FULL_LEAD): string {
  const [next, ...rest] = today.windows;
  const size = detail.size ? sizeClause(next) : '';
  const later = detail.later === 'none' ? '' : laterRuns(rest, detail.later === 'brief');
  if (next.fromHour > hour) return `Generation is next posted ${fromTo(next)}${size}${later}.`;
  if (next.fromHour === 0 && next.toHour === 24) return `Generation is posted all day${size}.`;
  if (next.toHour === 24) return `Generation is posted through midnight${size}.`;
  const after = rest.length ? later : ', then none for the rest of the day';
  return `Generation is posted until ${clockLabel(next.toHour)}${size}${after}.`;
}

/** What tomorrow's sheet posts, for the reader planning the night before. */
function tomorrowLead(tomorrow: PostedDay): string {
  const [first, ...rest] = tomorrow.windows;
  if (!first) return `Tomorrow’s schedule lists ${tomorrow.minimumFlowOnly ? 'only minimum flow' : 'no generation'}.`;
  const size = sizeClause(first);
  if (first.fromHour === 0 && first.toHour === 24) return `Tomorrow, generation is posted all day${size}.`;
  return `Tomorrow, generation is first posted ${fromTo(first)}${size}${laterRuns(rest)}.`;
}

/** How many recent days of one kind generated at all. */
function ranCount(p: StartPattern): string {
  const noun = daysNoun(p.group, p.days);
  return p.daysWithGeneration === 0
    ? `There was no generation on any of the last ${p.days} ${noun}.`
    : `Generation ran on ${p.daysWithGeneration} of the last ${p.days} ${noun}.`;
}

/**
 * What recent days of one kind did, for a day whose schedule is not posted.
 * A usual start is stated only for a consistent pattern, and always with how
 * many of those days generated at all.
 */
function expectation(p: StartPattern | null): string | null {
  if (!p) return null;
  const noun = daysNoun(p.group, p.days);
  if (p.daysWithGeneration === 0) return ranCount(p);
  if (p.consistent && mostlyGenerating(p) && p.rangeFromHour !== null && p.rangeToHour !== null) {
    // "Weekend days" is said in full: four of them are two weekends.
    const last = p.group === 'weekend' ? `${p.days} ${noun}` : `${p.days}`;
    const ran = p.daysWithGeneration === p.days ? `each of the last ${last}` : `${p.daysWithGeneration} of the last ${last}`;
    return `On recent ${plural(p.group)} generation has usually started ${rangePhrase(p.rangeFromHour, p.rangeToHour)}, and it ran on ${ran}.`;
  }
  return mostlyGenerating(p) && p.daysWithStart >= MIN_STARTS_FOR_PATTERN
    ? `${ranCount(p).slice(0, -1)}, with no usual start time.`
    : ranCount(p);
}

/**
 * How the posted start has held up, with its count. "Within an hour" is the
 * scoring rule itself. Always follows a sentence about posted generation, so
 * "it" is the generation just named.
 */
function trackRecord(r: ScheduleReliability, subject = 'It'): string {
  return `${subject} has started within an hour of the posted time on ${r.onTime} of ${r.daysCompared} tracked days.`;
}

function sentence(clause: string): string {
  return `${clause[0].toUpperCase()}${clause.slice(1)}.`;
}

/** An exception clause as the sentence after one about posted generation. */
function sentenceAfterLead(clause: string): string {
  return sentence(clause.replace('generation', 'it'));
}

interface Note { headline: string; sentence: string }

/** A morning that departs from recent mornings, while it is still morning. */
function morningNote(today: PostedDay, s: RecentShape, hour: number): Note | null {
  if (hour >= MORNING_ENDS_HOUR || today.morningGeneration === undefined || s.morningsKnown < MIN_DAYS_FOR_SHAPE) return null;
  const ran = s.morningsKnown - s.morningsOff;
  if (!today.morningGeneration && ran / s.morningsKnown >= BUSY_MORNINGS_SHARE) {
    return { headline: 'A quiet morning on the schedule', sentence: `Mornings have had generation on ${ran} of the last ${s.morningsKnown} days.` };
  }
  if (today.morningGeneration && s.morningsOff / s.morningsKnown >= QUIET_MORNINGS_SHARE) {
    return { headline: 'Morning generation on the schedule', sentence: `There was no generation before noon on ${s.morningsOff} of the last ${s.morningsKnown} days.` };
  }
  return null;
}

/** A posted day much shorter or longer than the typical recent generating day. */
function dayLengthNote(today: PostedDay, s: RecentShape): Note | null {
  const posted = today.generatingHours;
  const usual = s.typicalHours;
  if (posted === undefined || posted <= 0 || usual === null || s.generatingDays < MIN_DAYS_FOR_SHAPE) return null;
  const short = posted * 2 <= usual && usual - posted >= DAY_LENGTH_GAP_HOURS;
  const long = posted >= usual * 2 && posted - usual >= DAY_LENGTH_GAP_HOURS;
  if (!short && !long) return null;
  return {
    headline: short ? 'A short day of generation' : 'A long day of generation',
    sentence: `That’s ${posted} ${posted === 1 ? 'hour' : 'hours'} posted for the whole day, against about ${usual} on a typical recent day.`,
  };
}

function join(...sentences: Array<string | null | undefined>): string {
  return sentences.filter(Boolean).join(' ');
}

/**
 * The compact Read: what is posted next, then what stands out about it.
 * Every time refers to the posted plan, never observed generation, and is at
 * the dam. Recomputed at serve time, with no truncation or model-written
 * claims.
 */
export function damReadTakeaway(f: DamReadFacts): { headline: string; summary: string } {
  const hour = servingHour(f.now);
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  const tomorrow = f.posted?.days.find((d) => d.dayOffset === 1);
  const p = leadPattern(f);
  const exception = compactException(f);

  if (!today) {
    const usual = expectation(p);
    const earliest = f.shape.earliest;
    // Early is the dangerous miss, so the earliest recent start rides along
    // whenever it is ahead of the range just stated.
    const early = p?.consistent && p.rangeFromHour !== null && earliest && earliest.hour < p.rangeFromHour
      ? `The earliest start lately was ${clockLabel(earliest.hour)}, on ${dayName(earliest.dayKey)}.`
      : null;
    return {
      headline: 'Today’s schedule isn’t posted',
      summary: usual ? join(usual, early) : 'There’s no posted start to compare with recent generation yet.',
    };
  }

  if (today.firstStartHour === null) {
    const minimum = today.minimumFlowOnly;
    const c = comparison(f, 0);
    const unposted = f.reliability?.ranUnpostedDays.length ?? 0;
    const second = unposted > 0
      ? `Generation ran without a posted start on ${unposted} of ${f.reliability!.daysCompared} tracked days.`
      : hour >= EVENING_STARTS_HOUR && tomorrow
        ? tomorrowLead(tomorrow)
        : c?.versus === 'quieter'
          ? `Recent ${plural(c.group)} had generation on ${p!.daysWithGeneration} of ${p!.days} days.`
          : p
            ? `Recent ${plural(p.group)} have also been quiet, with no generation on ${p.days - p.daysWithGeneration} of ${p.days} days.`
            : null;
    return {
      headline: minimum ? 'Only minimum flow scheduled' : 'No generation scheduled today',
      summary: join(`${minimum ? 'Only minimum flow' : 'No generation'} is posted today.`, second),
    };
  }

  if (!today.windows.length) {
    if (tomorrow) {
      const c = comparison(f, 1);
      const tp = c ? (c.group === 'weekend' ? f.weekend : f.weekday) : null;
      const shifted = (c?.versus === 'earlier' || c?.versus === 'later') && tomorrow.firstStartHour !== null
        && tp?.rangeFromHour != null && tp.rangeToHour !== null
        ? `That’s ${shiftPhrase(tomorrow.firstStartHour, tp.rangeFromHour, tp.rangeToHour, c.versus)} than recent ${plural(c.group)}.`
        : null;
      return {
        headline: 'No more generation scheduled today',
        summary: join(tomorrowLead(tomorrow), shifted ?? (exception && tomorrow.windows.length ? sentenceAfterLead(exception.clause) : f.reliability && tomorrow.windows.length ? trackRecord(f.reliability) : null)),
      };
    }
    const next = isWeekendDay(nextDayKey(centralClock(f.now).dayKey)) ? f.weekend : f.weekday;
    const missing = missingScheduleLine(f, 'tomorrow');
    return {
      headline: 'No more generation scheduled today',
      summary: join(
        missing.verified ? `No schedule for tomorrow is available as of ${missing.asOf}.` : 'Tomorrow’s schedule couldn’t be verified.',
        exception ? sentence(exception.clause) : expectation(next),
      ),
    };
  }

  const lead = todayLead(today, hour);
  const [next] = today.windows;
  const inProgress = next.fromHour <= hour;
  // A start is early or late only while it is still ahead.
  const c = hour < today.firstStartHour ? comparison(f, 0) : null;

  if ((c?.versus === 'earlier' || c?.versus === 'later') && p?.rangeFromHour != null && p.rangeToHour !== null) {
    return {
      headline: c.versus === 'earlier' ? 'An earlier start today' : 'A later start today',
      summary: join(lead, exception
        ? sentenceAfterLead(exception.clause)
        : `That’s ${shiftPhrase(today.firstStartHour, p.rangeFromHour, p.rangeToHour, c.versus)} than recent ${plural(c.group)}.`),
    };
  }

  if (exception) return { headline: exception.headline, summary: join(lead, sentenceAfterLead(exception.clause)) };

  const note = morningNote(today, f.shape, hour) ?? dayLengthNote(today, f.shape);
  if (note) return { headline: note.headline, summary: join(lead, note.sentence) };

  const more = today.firstStartHour < next.fromHour;
  return {
    headline: inProgress
      ? 'Generation is on the schedule now'
      : `${more ? 'More generation' : 'Generation'} scheduled this ${partOfDay(next.fromHour)}`,
    summary: join(lead, p && !mostlyGenerating(p)
      ? ranCount(p)
      : f.reliability
        ? trackRecord(f.reliability)
        : c?.versus === 'in-line'
          ? `That’s close to when recent ${plural(c.group)} have started.`
          : null),
  };
}

/** A shift this large is a different kind of day, and an hour count would be false precision. */
export const LARGE_SHIFT_HOURS = 6;

/** "about 2-3 hours earlier", from a posted start and the middle half of recent ones. */
function shiftPhrase(start: number, from: number, to: number, versus: 'earlier' | 'later'): string {
  const low = versus === 'earlier' ? from - start : start - to;
  const high = versus === 'earlier' ? to - start : start - from;
  if (low >= LARGE_SHIFT_HOURS) return `much ${versus}`;
  return `about ${low === high ? `${low}` : `${low}–${high}`} ${high === 1 ? 'hour' : 'hours'} ${versus}`;
}

// ── The tailwater river Read ───────────────────────────────────────────────
//
// On a river whose level IS a dam's release (the White below Bull Shoals, the
// Norfork tailwater, Taneycomo below Table Rock) there is no float ladder, and
// the river Read could only say that no assessment was available. These are
// the parts of that river's Read the dam's facts can write: a summary of what
// is posted next, and the recent pattern with how the schedule has held. The
// local note between them is chosen by tailwater-river-read.ts from the state
// returned here. ADR 0017 decision 10.

/** The summary is shown alone on cards; the river Read brief holds it to this. */
export const RIVER_SUMMARY_MAX_CHARS = 120;

/** What the posted schedule has the dam doing in the serving hour. */
export type PostedState = 'idle' | 'generating' | 'full';
/** At or above this share of full power a posted run is "near full power". */
export const NEAR_FULL_SHARE = 0.875;

export interface DamRiverBlocks {
  /** Public: what is posted next at the dam, named, with its size. Restates the free schedule. */
  summary: string;
  /** Premium: the recent pattern, how the posted start has held, and the at-the-dam caveat. */
  full: string;
  /** The posted state now, for the local note. Null when today's schedule is not posted. */
  state: PostedState | null;
}

/** The longest candidate that fits the summary, else the last (shortest) one. */
function fitSummary(candidates: readonly string[]): string {
  return candidates.find((c) => c.length <= RIVER_SUMMARY_MAX_CHARS) ?? candidates.at(-1)!;
}

/** The dam's part of a tailwater river's Read. Rendered against the serving clock, like the card. */
export function damRiverBlocks(f: DamReadFacts): DamRiverBlocks {
  const hour = servingHour(f.now);
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  const tomorrow = f.posted?.days.find((d) => d.dayOffset === 1);
  const at = `At ${f.damName}, `;
  const lower = (lead: string) => `${at}${lead[0].toLowerCase()}${lead.slice(1)}`;

  let summary: string;
  let state: PostedState | null;
  if (!today) {
    const missing = missingScheduleLine(f, 'today');
    summary = missing.verified
      ? `${at}no schedule is available for today as of ${missing.asOf}.`
      : `${f.damName}’s schedule for today couldn’t be verified.`;
    state = null;
  } else if (today.firstStartHour === null) {
    summary = `${at}${today.minimumFlowOnly ? 'only minimum flow' : 'no generation'} is posted today.`;
    state = 'idle';
  } else if (!today.windows.length) {
    const first = tomorrow?.windows[0];
    summary = fitSummary([
      first
        ? `${at}today’s posted generation is done. Tomorrow’s starts at ${clockLabel(first.fromHour)}.`
        : tomorrow
          ? `${at}today’s posted generation is done. Tomorrow’s schedule lists ${tomorrow.minimumFlowOnly ? 'only minimum flow' : 'no generation'}.`
          : `${at}today’s posted generation is done.`,
      `${at}today’s posted generation is done.`,
    ]);
    state = 'idle';
  } else {
    summary = fitSummary([
      lower(todayLead(today, hour)),
      lower(todayLead(today, hour, { size: true, later: 'brief' })),
      lower(todayLead(today, hour, { size: true, later: 'none' })),
      lower(todayLead(today, hour, { size: false, later: 'none' })),
    ]);
    const [next] = today.windows;
    state = next.fromHour > hour ? 'idle' : (next.peakShare ?? 0) >= NEAR_FULL_SHARE ? 'full' : 'generating';
  }

  const exception = compactException(f);
  const full = join(
    expectation(leadPattern(f)),
    exception ? sentence(exception.clause) : f.reliability ? trackRecord(f.reliability, 'Generation') : null,
    AT_THE_DAM_CAVEAT,
  );
  return { summary, full, state };
}

/** One sentence about today: what is posted, and how it compares. */
export function damReadHeadline(f: DamReadFacts): string {
  const today = f.posted?.days.find((d) => d.dayOffset === 0);
  const p = leadPattern(f);
  const c = comparison(f, 0);
  if (today) {
    if (today.windows.length) {
      const base = `Generation's posted for ${listWindows(today.windows)} today`;
      if (c?.versus === 'in-line') return `${base}, about when recent ${plural(c.group)} have started.`;
      if (c?.versus === 'earlier') return `${base}, earlier than recent ${plural(c.group)} have been starting.`;
      if (c?.versus === 'later') return `${base}, later than recent ${plural(c.group)} have been starting.`;
      return `${base}.`;
    }
    if (today.firstStartHour !== null) return 'Today\'s posted generation is done.';
    const base = today.minimumFlowOnly ? 'Only minimum flow is posted for the rest of today' : 'No generation is posted for the rest of today';
    return c?.versus === 'quieter' ? `${base}, quieter than most recent ${plural(c.group)}.` : `${base}.`;
  }
  const missing = missingScheduleLine(f, 'today');
  const base = missing.verified
    ? `No schedule is available for today as of ${missing.asOf}.`
    : 'Today\'s schedule couldn\'t be verified.';
  if (p?.consistent && p.rangeFromHour !== null && p.rangeToHour !== null && mostlyGenerating(p)) {
    return `${base} Recent ${plural(p.group)} have usually started ${rangePhrase(p.rangeFromHour, p.rangeToHour)}.`;
  }
  return base;
}

/** Recent surprises against the posted schedule, said first and plainly. */
function surpriseSentence(f: DamReadFacts): string | null {
  const r = f.reliability;
  const early = r?.startedEarlyDays ?? [];
  const unposted = r?.ranUnpostedDays ?? [];
  const earlyPart = early.length === 1
    ? `generation started more than an hour before the posted time on ${dayName(early[0])}`
    : early.length > 1 ? `generation started more than an hour ahead of the posted time on ${listDays(early)}` : null;
  const unpostedPart = unposted.length === 1
    ? `the dam generated on ${dayName(unposted[0])} with nothing on the schedule`
    : unposted.length > 1 ? `the dam generated with nothing on the schedule on ${listDays(unposted)}` : null;
  if (earlyPart && unpostedPart) return `Heads up on two recent surprises: ${earlyPart}, and ${unpostedPart}.`;
  if (earlyPart || unpostedPart) {
    const part = (earlyPart ?? unpostedPart)!;
    return `Heads up: ${part}.`;
  }
  // No track record to speak from, but the record itself has an outlier.
  const lead = leadPattern(f);
  if (f.shape.earliest && lead && lead.earlyDays > 0 && lead.typicalStartHour !== null) {
    return `Heads up: it doesn't always wait for the ${partOfDay(lead.typicalStartHour)}. The earliest start lately was ${clockLabel(f.shape.earliest.hour)} on ${dayName(f.shape.earliest.dayKey)}.`;
  }
  return null;
}

/** The pattern for today's kind of day, with how often it generated at all. */
function patternSentence(p: StartPattern): string {
  const days = plural(p.group);
  if (p.daysWithGeneration === 0) {
    return `Recent ${days} have been quiet, with no generation on any of the last ${p.days} ${daysNoun(p.group, p.days)}.`;
  }
  if (!mostlyGenerating(p)) {
    const when = p.consistent && p.typicalStartHour !== null ? ` When it did run, it started in the ${partOfDay(p.typicalStartHour)}.` : '';
    return `The dam's been quiet most ${days} lately, generating on ${p.daysWithGeneration} of the last ${p.days} ${daysNoun(p.group, p.days)}.${when}`;
  }
  if (p.consistent && p.rangeFromHour !== null && p.rangeToHour !== null) {
    return `On recent ${days}, generation has usually started in the ${partOfDay(p.typicalStartHour!)}, ${rangePhrase(p.rangeFromHour, p.rangeToHour)}.`;
  }
  return `Start times on recent ${days} have been all over the place, so go by the posted schedule.`;
}

/**
 * Two or three sentences: surprises first, then the pattern for today's kind
 * of day, then the one shape fact that most changes the picture. Every
 * sentence is a conclusion the facts support, with its count beside it.
 */
export function damReadStory(f: DamReadFacts): string[] {
  const story: string[] = [];
  const surprise = surpriseSentence(f);
  if (surprise) story.push(surprise);

  const lead = leadPattern(f);
  const other = f.todayGroup === 'weekend' ? f.weekday : f.weekend;
  if (lead) story.push(patternSentence(lead));
  else if (other) story.push(patternSentence(other));
  else story.push('There isn\'t enough recent history at this dam to describe a pattern yet.');

  const s = f.shape;
  const extras: string[] = [];
  if (s.morningsKnown >= MIN_DAYS_FOR_SHAPE && s.morningsOff / s.morningsKnown >= QUIET_MORNINGS_SHARE) {
    extras.push(s.morningsOff === s.morningsKnown
      ? `Mornings have been quiet, with no generation before noon on any of the last ${s.morningsKnown} days.`
      : `Mornings have been quiet, with no generation before noon on ${s.morningsOff} of the last ${s.morningsKnown} days.`);
  }
  if (f.weekday?.consistent && f.weekend?.consistent && mostlyGenerating(f.weekday) && mostlyGenerating(f.weekend)) {
    const diff = f.weekend.typicalStartHour! - f.weekday.typicalStartHour!;
    if (Math.abs(diff) >= 2) extras.push(`Weekends have been starting a few hours ${diff > 0 ? 'later' : 'earlier'} than weekdays.`);
  }
  if (s.generatingDays >= MIN_DAYS_FOR_SHAPE && s.daysPastMidnight * 2 >= s.generatingDays) {
    extras.push(`Generation has often carried on past midnight, ${s.daysPastMidnight} of the last ${s.generatingDays} days it ran.`);
  }
  return [...story, ...extras].slice(0, 3);
}

/** The two or three facts that back the story. */
export function damReadKeyRows(f: DamReadFacts): DamReadRow[] {
  const rows: DamReadRow[] = [];
  const tomorrow = f.posted?.days.find((d) => d.dayOffset === 1);
  if (tomorrow) {
    const c = comparison(f, 1);
    const versus = !c ? undefined
      : c.versus === 'earlier' ? `Earlier than recent ${plural(c.group)}`
        : c.versus === 'later' ? `Later than recent ${plural(c.group)}`
          : c.versus === 'quieter' ? `Quieter than most recent ${plural(c.group)}`
            : `About when recent ${plural(c.group)} have started`;
    rows.push({
      key: 'tomorrow',
      label: 'Posted for tomorrow',
      value: tomorrow.windows.length ? listWindows(tomorrow.windows) : tomorrow.minimumFlowOnly ? 'Only minimum flow' : 'No generation',
      detail: versus,
    });
  }
  // Stated whenever known, pattern or no pattern: early is the dangerous miss.
  if (f.shape.earliest) {
    rows.push({
      key: 'earliest',
      label: 'Earliest start lately',
      value: clockLabel(f.shape.earliest.hour),
      detail: dayName(f.shape.earliest.dayKey),
    });
  }
  if (f.reliability) {
    const r = f.reliability;
    rows.push({
      key: 'track-record',
      label: 'Schedule track record',
      value: `Started on time ${r.onTime} of ${r.daysCompared} days`,
      detail: 'On time means within an hour of the posted start',
    });
  }
  return rows;
}

/** "Recent pattern details", collapsed by default. */
export function damReadDetailRows(f: DamReadFacts): DamReadRow[] {
  const rows: DamReadRow[] = [];
  for (const p of [f.weekday, f.weekend]) {
    if (!p) continue;
    rows.push({
      key: `usual-${p.group}`,
      label: p.group === 'weekday' ? 'Usual weekday start' : 'Usual weekend start',
      value: p.daysWithGeneration === 0 ? 'No generation'
        : p.consistent && p.rangeFromHour !== null && p.rangeToHour !== null
          ? (p.rangeFromHour === p.rangeToHour ? `Around ${clockLabel(p.rangeFromHour)}` : `${clockLabel(p.rangeFromHour)} – ${clockLabel(p.rangeToHour)}`)
          : 'Varies too much to say',
      detail: `Generated on ${p.daysWithGeneration} of the last ${p.days} ${daysNoun(p.group, p.days)}`,
    });
  }

  const s = f.shape;
  if (s.morningsKnown >= MIN_DAYS_FOR_SHAPE) {
    rows.push({ key: 'mornings', label: 'Quiet mornings', value: `${s.morningsOff} of the last ${s.morningsKnown} days`, detail: 'No generation before noon' });
  }

  if (s.generatingDays >= MIN_DAYS_FOR_SHAPE && s.typicalHours !== null && s.typicalRuns !== null) {
    const hours = `about ${s.typicalHours} ${s.typicalHours === 1 ? 'hour' : 'hours'}`;
    const runs = s.typicalRuns === 1 ? 'One run' : `${s.typicalRuns} runs`;
    const end = s.daysPastMidnight * 2 >= s.generatingDays
      ? `Ran past midnight on ${s.daysPastMidnight} of ${s.generatingDays} days`
      : s.typicalEndHour !== null ? `Usually done by ${clockLabel(s.typicalEndHour)}` : undefined;
    rows.push({
      key: 'typical-day',
      label: 'Typical generating day',
      value: s.typicalRuns === 1 ? `${runs}, ${hours}` : `${runs}, ${hours} in all`,
      detail: end,
    });
  }

  if (s.typicalPeakCfs !== null && s.peakDays >= MIN_DAYS_FOR_SHAPE) {
    const cfs = (Math.round(s.typicalPeakCfs / 100) * 100).toLocaleString('en-US');
    // The phrase the dam page's generator rack uses, so the two agree.
    const ref = f.reference;
    const equivalents = ref && ref.fullGenerationCfs > 0 ? (s.typicalPeakCfs / ref.fullGenerationCfs) * ref.units : null;
    const phrase = ref ? generatorEquivalentPhrase(equivalents, { ...ref, schedulingCapacityMw: 0, source: '' }) : null;
    rows.push({
      key: 'peak',
      label: 'Typical daily peak',
      value: phrase ?? `About ${cfs} cfs`,
      detail: phrase ? `About ${cfs} cfs, estimated from flow` : 'Estimated from turbine flow',
    });
  }

  if (f.reliability) {
    const r = f.reliability;
    const notes: string[] = [];
    if (r.startedEarlyDays.length) notes.push(`Started early: ${listDays(r.startedEarlyDays)}`);
    if (r.ranUnpostedDays.length) notes.push(`Generated with nothing posted: ${listDays(r.ranUnpostedDays)}`);
    if (r.startedLate) notes.push(`Started late: ${r.startedLate} ${r.startedLate === 1 ? 'day' : 'days'}`);
    if (r.quietDaysKept) notes.push(`Posted quiet and stayed quiet: ${r.quietDaysKept} ${r.quietDaysKept === 1 ? 'day' : 'days'}`);
    if (notes.length) rows.push({ key: 'track-record-detail', label: 'Schedule track record', value: notes.join(' · ') });
  }
  return rows;
}

export const AT_THE_DAM_CAVEAT =
  'Times are at the dam. Water downstream comes up later the farther below it you are, and the posted schedule can change, so check it before you wade.';

/** The whole Read, as the route serves it. */
export function renderDamRead(f: DamReadFacts) {
  return {
    takeaway: damReadTakeaway(f),
    headline: damReadHeadline(f),
    story: damReadStory(f),
    keyRows: damReadKeyRows(f),
    detailRows: damReadDetailRows(f),
    caveat: AT_THE_DAM_CAVEAT,
    mayBeOutdated: Boolean(f.posted?.mayBeOutdated),
  };
}
