// shared/dam-generation.ts
//
// What the powerhouse is doing, in the unit a fisherman actually thinks in.
//
// ── Why this module exists ─────────────────────────────────────────────────
// A dam page can answer four questions in five seconds or it cannot:
//
//   1. Is the powerhouse generating now?
//   2. How much water is moving through the turbines?
//   3. How large is that relative to THIS project?
//   4. When is generation scheduled to change?
//
// Every one of those is arithmetic over two numbers SWPA publishes as a pair —
// a project's scheduling capacity in megawatts and its full-power discharge in
// cfs — plus one CWMS observation. Two independent implementations of that
// arithmetic is two chances for web and iOS to tell one person two different
// things about the same river, which is the reason dam-schedule-copy.ts lives
// beside this file and the reason this one does too.
//
// ── The claim discipline ───────────────────────────────────────────────────
// 19,130 cfs through the turbines does NOT prove six generators are turning.
// It is six generators' WORTH of full-load discharge; the plant could be
// running a different number of units at partial load, and the Corps does not
// publish per-unit status. So the headline is "about 6 generators' worth" and
// never "6 generators running", and the percentage is "of published
// full-generation discharge" and never "power".
//
// Two more rules inherited from dam-schedule-copy.ts, for the same reason:
//   - OBSERVATION AND SCHEDULE ARE NEVER ONE SENTENCE. `nowNextClauses` returns
//     two strings so a UI cannot accidentally present a plan as a measurement.
//   - NOTHING HERE IMPLIES SAFE WADING. The turbines being scheduled off is a
//     fact about a powerhouse; the river below stays up on the recession limb.
//
// ── What is deliberately NOT clamped ───────────────────────────────────────
// An observation above the published reference is information — spill, a
// different measurement basis, or a reference that has drifted since the MER
// project. Clamping it to 100% would hide exactly the case worth showing.
//
// Pure TypeScript, sibling-shared imports only — the same constraint
// condition-system.ts and dam-schedule-copy.ts are under, so Metro, tsx and
// Next can all consume it.

import type { DamMetricValue, DamPatternDay, DamScheduleDay, DamSnapshot } from './dam-types';
import {
  centralDayKey,
  hourEndingLabel,
  hourEndingNow,
  nextDayKey,
  readingStaleness,
  relativeAge,
  scheduleHoursElapsed,
  type ReadingStaleness,
} from './dam-schedule-copy';

/**
 * SWPA's published pair for one project, plus who published it.
 *
 * `schedulingCapacityMw` and `fullGenerationCfs` are ONE PAIR and must travel
 * together: megawattsToCfs divides by the first and multiplies by the second,
 * and mixing either half with an operator nameplate silently rescales every
 * number on the page. Bull Shoals is the case that proves it — 340 MW
 * installed, 362 after the Major Equipment Replacement project, and 391 as
 * SWPA's scheduling capability. Only 391 belongs here.
 *
 * `units` is SWPA's unit count for the same reason: it is the denominator that
 * makes `fullGenerationCfs` divide into generator-equivalents.
 */
export interface GenerationReference {
  units: number;
  fullGenerationCfs: number;
  schedulingCapacityMw: number;
  /** Attribution, rendered beside the reference so the figure is citable. */
  source: string;
}

/** The generation reference the wire may or may not carry, plus the floor. */
type GenerationInputs = Pick<
  DamSnapshot,
  'hasTurbines' | 'metrics' | 'generationReference' | 'generationFloorCfs'
>;

/**
 * Observed turbine flow as a share of the project's published full-generation
 * discharge. UNCLAMPED, and null rather than a guess.
 *
 * Null when there is no usable reference or the observation cannot be read at
 * all. Never 0 as a stand-in for "unknown" — the whole point of the missing
 * states below is that no absence becomes "not generating".
 */
export function generationFraction(
  turbineCfs: number | null | undefined,
  ref: GenerationReference | null | undefined
): number | null {
  if (typeof turbineCfs !== 'number' || !Number.isFinite(turbineCfs)) return null;
  if (turbineCfs < 0) return null;
  if (!ref || !Number.isFinite(ref.fullGenerationCfs) || ref.fullGenerationCfs <= 0) return null;
  return turbineCfs / ref.fullGenerationCfs;
}

/**
 * The same observation expressed in generators, which is the unit anglers use.
 *
 * 19,130 cfs at Bull Shoals is 19,130 / 26,400 * 8 = 5.8 — "about six
 * generators' worth". Unclamped for the same reason the fraction is: 8.4 at a
 * plant with eight units is a real reading and a useful one.
 */
export function unitEquivalents(
  turbineCfs: number | null | undefined,
  ref: GenerationReference | null | undefined
): number | null {
  const fraction = generationFraction(turbineCfs, ref);
  if (fraction === null) return null;
  if (!ref || !Number.isFinite(ref.units) || ref.units <= 0) return null;
  return fraction * ref.units;
}

/** One generator cell in the powerhouse rack, filled 0..1. */
export interface RackCell {
  /** How full this cell draws, 0 to 1. The partial cell is the honest one. */
  fill: number;
}

export interface GeneratorRack {
  cells: RackCell[];
  /** The unrounded figure the cells are drawn from, e.g. 5.8. */
  equivalents: number;
  /** True when the observation exceeds the whole published reference. */
  overflow: boolean;
}

/**
 * The powerhouse rack: one cell per published unit, the last active one drawn
 * PARTIALLY FILLED.
 *
 * Rounding 5.8 up to six identical lit icons would state a precision the
 * observation does not have — it would read as "six units are running", which
 * is the one thing this cannot establish. A five-and-a-bit rack communicates
 * the approximation in the drawing itself, so the caveat beneath it is a
 * reminder rather than a correction.
 */
export function generatorRack(
  turbineCfs: number | null | undefined,
  ref: GenerationReference | null | undefined
): GeneratorRack | null {
  const equivalents = unitEquivalents(turbineCfs, ref);
  if (equivalents === null || !ref) return null;

  const cells: RackCell[] = [];
  for (let i = 0; i < ref.units; i += 1) {
    cells.push({ fill: Math.max(0, Math.min(1, equivalents - i)) });
  }
  return { cells, equivalents, overflow: equivalents > ref.units };
}

/**
 * What Eddy has OBSERVED at the powerhouse, as a state a UI can switch on.
 *
 * Four kinds, and the distinction between the last two is the one that matters:
 * `not-generating` is a measurement of approximately no flow, `unavailable` is
 * the absence of a measurement. Collapsing them is how a dashboard tells
 * somebody the units are off because a feed timed out.
 */
export type GenerationNow =
  | {
      kind: 'generating';
      turbineCfs: number;
      observedAt: string;
      age: ReadingStaleness;
      /** Unclamped share of full-generation discharge; null without a reference. */
      fraction: number | null;
      /** Unclamped generator-equivalents; null without a reference. */
      equivalents: number | null;
    }
  | {
      kind: 'not-generating';
      /** The measured flow, which is near zero rather than exactly zero. */
      turbineCfs: number;
      observedAt: string;
      age: ReadingStaleness;
    }
  | {
      kind: 'unavailable';
      /**
       * `no-powerhouse` — a flood-control project. Render no hero at all.
       * `not-published` — a powerhouse whose turbine flow Eddy cannot read.
       * `unreadable` — a reading arrived with a timestamp that will not parse.
       */
      reason: 'no-powerhouse' | 'not-published' | 'unreadable';
    };

/**
 * Read the current generation state off a snapshot.
 *
 * ── Why the floor and not `value > 0` ──────────────────────────────────────
 * CWMS reports small leakage through idle turbines — measured around 20 cfs at
 * Table Rock against a 100 cfs registry floor. `generationFloorCfs` is the
 * registry's per-dam answer to "below this, the units are off", and it is the
 * same number `DamSnapshot.generating` is derived from server-side, so the two
 * cannot disagree.
 *
 * ── Why the band is recomputed here ────────────────────────────────────────
 * `DamMetricValue.staleness` is stamped when the server assembles the snapshot
 * and then frozen, while the reader's clock keeps moving; an iOS screen opened,
 * backgrounded and resumed renders that payload hours later still claiming to
 * be fresh. See readingStaleness in dam-schedule-copy.ts.
 */
export function generationNow(dam: GenerationInputs, now = Date.now()): GenerationNow {
  if (!dam.hasTurbines) return { kind: 'unavailable', reason: 'no-powerhouse' };

  const reading = dam.metrics?.generationFlow;
  if (!reading || typeof reading.value !== 'number' || !Number.isFinite(reading.value)) {
    return { kind: 'unavailable', reason: 'not-published' };
  }

  const age = readingStaleness(reading.at, now);
  if (age === null) return { kind: 'unavailable', reason: 'unreadable' };

  // Absent floor means the registry has not decided for this dam. Falling back
  // to "any flow is generation" would light the chip on leakage, so treat a
  // missing floor as zero only when the reading is unambiguous.
  const floor = typeof dam.generationFloorCfs === 'number' ? dam.generationFloorCfs : 0;
  if (reading.value <= floor) {
    return { kind: 'not-generating', turbineCfs: reading.value, observedAt: reading.at, age };
  }

  return {
    kind: 'generating',
    turbineCfs: reading.value,
    observedAt: reading.at,
    age,
    fraction: generationFraction(reading.value, dam.generationReference),
    equivalents: unitEquivalents(reading.value, dam.generationReference),
  };
}

/**
 * The hero's status line, or null when there is nothing to head.
 *
 * A stale observation does NOT get to say "now". It keeps its number and its
 * age — a number with an honest age beats no number — but the present tense is
 * a claim the timestamp cannot support.
 */
export function generationStatusLabel(state: GenerationNow): string | null {
  switch (state.kind) {
    case 'generating':
      return state.age === 'stale' ? 'Last observed generating' : 'Generating now';
    case 'not-generating':
      return state.age === 'stale'
        ? 'No generation at last observation'
        : 'No turbine generation observed';
    case 'unavailable':
      // A flood-control project has no powerhouse to report on, and a hero that
      // said anything at all here would invent one.
      return state.reason === 'no-powerhouse' ? null : 'Current generation unavailable';
  }
}

/** "6 generators’ worth" — possessive placement is the whole formatting job. */
function generatorsWorth(whole: number): string {
  return whole === 1 ? 'one generator’s worth' : `${whole} generators’ worth`;
}

/**
 * The generator-equivalent phrase, hedged in proportion to what it can support.
 *
 * "About" is load-bearing and never dropped: this is full-load-discharge
 * equivalents, not a unit count. Below one equivalent it refuses to round to
 * "about 1", because "about one generator's worth" reads as a unit that is
 * running when the honest statement is that very little is moving.
 */
export function generatorEquivalentPhrase(
  equivalents: number | null | undefined,
  ref: GenerationReference | null | undefined
): string | null {
  if (typeof equivalents !== 'number' || !Number.isFinite(equivalents)) return null;
  if (!ref || !Number.isFinite(ref.units) || ref.units <= 0) return null;
  if (equivalents <= 0) return null;
  if (equivalents < 1) return 'Less than one generator’s worth';
  if (equivalents > ref.units) return `More than ${generatorsWorth(ref.units)}`;
  return `About ${generatorsWorth(Math.round(equivalents))}`;
}

/**
 * The caveat that MUST render with the rack, in some form, on every surface
 * that draws it.
 *
 * The rack is the most confident-looking thing on the page and the thing least
 * entitled to confidence about unit count.
 */
export const RACK_ESTIMATE_NOTE =
  'Estimated from turbine discharge. This does not identify which physical units are operating.';

/** The exact reference label. Never "31% power" — see the header. */
export function fullGenerationReferenceLabel(ref: GenerationReference): string {
  return `of published full-generation discharge (${ref.fullGenerationCfs.toLocaleString()} cfs, ${ref.source})`;
}

/** A percentage for display, unclamped and rounded the way the hero shows it. */
export function generationPercentLabel(fraction: number | null | undefined): string | null {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return null;
  return `${Math.round(fraction * 100)}%`;
}

// ── The next scheduled move ────────────────────────────────────────────────

/**
 * How the schedule changes next.
 *
 * `start` and `stop` rest on the ON/OFF pattern, which measured EXACT against
 * CWMS turbine flow. `increase` and `decrease` rest on scheduled megawatts,
 * which are ±10% at steady state — so they are only reported when the move is
 * at least one generator's worth of capacity, a threshold comfortably outside
 * that error.
 */
export type ScheduledMoveKind = 'start' | 'stop' | 'increase' | 'decrease';

export interface ScheduledMove {
  kind: ScheduledMoveKind;
  /** SWPA hour-ending the new load begins at. Render with hourEndingLabel. */
  hourEnding: number;
  /** Central calendar day it falls on, YYYY-MM-DD. */
  scheduleDate: string;
  /** 0 = today at the dam, 1 = tomorrow, 2 = the day after. */
  dayOffset: number;
}

export interface ScheduleOutlook {
  /** True when SWPA has load scheduled for the hour running right now. */
  generating: boolean;
  /** The next move, or null when the posted schedule holds steady to its end. */
  move: ScheduledMove | null;
}

/**
 * A magnitude move has to clear one generator's worth of scheduling capacity.
 *
 * Anything smaller is inside the conversion's own error, and announcing it
 * would be reporting noise as an event.
 */
function magnitudeThresholdMw(ref: GenerationReference | null | undefined): number | null {
  if (!ref || !Number.isFinite(ref.units) || ref.units <= 0) return null;
  if (!Number.isFinite(ref.schedulingCapacityMw) || ref.schedulingCapacityMw <= 0) return null;
  return ref.schedulingCapacityMw / ref.units;
}

/**
 * What SWPA has the units doing right now, and the next move in the posted
 * schedule — on/off flips AND material load changes.
 *
 * ── Fails closed, twice, exactly as scheduleStateNow does ──────────────────
 * Null when today's schedule is not present, and null when the current hour is
 * missing from it. Both mean "we do not know what the dam is scheduled to do",
 * which is not "the dam is idle".
 *
 * Days are walked only while CONSECUTIVE. fetchProjectSchedule drops a day
 * whose file has not refreshed, so the array can hold today and the day after
 * tomorrow with a hole between them; walking across it would report Thursday's
 * 6 AM start as Wednesday's.
 */
export function scheduleOutlook(
  schedule: Array<Pick<DamScheduleDay, 'scheduleDate' | 'hours'>>,
  ref: GenerationReference | null | undefined,
  now = Date.now()
): ScheduleOutlook | null {
  const today = centralDayKey(now);
  const startIndex = schedule.findIndex((d) => d.scheduleDate === today);
  if (startIndex === -1) return null;

  const elapsed = scheduleHoursElapsed(today, now);
  if (elapsed === null) return null;
  const startHour = hourEndingNow(elapsed);

  const currentHour = schedule[startIndex].hours.find((h) => h.hourEnding === startHour);
  if (!currentHour) return null;

  const generating = currentHour.megawatts > 0;
  const threshold = magnitudeThresholdMw(ref);

  // Every later hour is compared against WHAT IS RUNNING NOW, not against the
  // hour before it. Comparing neighbours would miss a load that creeps up half
  // a generator an hour for four hours — four moves too small to report, one
  // change of two generators that nobody is told about.
  const reference = currentHour.megawatts;
  const referenceOn = reference > 0;

  let expectedDate = today;
  for (let i = startIndex; i < schedule.length; i += 1) {
    const day = schedule[i];
    if (day.scheduleDate !== expectedDate) break; // A gap — see the note above.
    // Walked by hour NUMBER rather than array order: the first move has to be
    // the earliest one, and reading it off iteration order would quietly depend
    // on the parser emitting 1..24 sorted.
    const from = i === startIndex ? startHour + 1 : 1;
    for (let h = from; h <= 24; h += 1) {
      const hour = day.hours.find((x) => x.hourEnding === h);
      if (!hour) continue;

      const nowOn = hour.megawatts > 0;
      if (nowOn !== referenceOn) {
        return {
          generating,
          move: {
            kind: nowOn ? 'start' : 'stop',
            hourEnding: h,
            scheduleDate: day.scheduleDate,
            // Index offset equals calendar-day offset because the walk stops at
            // the first non-consecutive date.
            dayOffset: i - startIndex,
          },
        };
      }

      // Still on, but by materially more or less than before.
      if (threshold !== null && nowOn && Math.abs(hour.megawatts - reference) >= threshold) {
        return {
          generating,
          move: {
            kind: hour.megawatts > reference ? 'increase' : 'decrease',
            hourEnding: h,
            scheduleDate: day.scheduleDate,
            dayOffset: i - startIndex,
          },
        };
      }
    }
    expectedDate = nextDayKey(expectedDate);
  }

  return { generating, move: null };
}

/**
 * "3 PM", "midnight tomorrow", "6 AM Thursday" — when a move happens, phrased
 * so it stays true no matter how stale the render is.
 *
 * A clock time and never a countdown: both dam surfaces are ISR'd at 300
 * seconds and the iOS app can hold a response far longer, so "in 2 hours"
 * silently decays into a false claim while "at 3 PM" does not.
 */
function moveClock(move: ScheduledMove): string {
  // hourEndingLabel gives the hour the water STARTS moving, which is exactly
  // the instant the move happens — hour ending 16 is the release running from
  // 3 PM, so the change is at 3 PM.
  const time = hourEndingLabel(move.hourEnding);
  const clock = time === '12 AM' ? 'midnight' : time;

  if (move.dayOffset === 0) return clock;
  if (move.dayOffset === 1) return `${clock} tomorrow`;
  const [y, m, d] = move.scheduleDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `${clock} ${weekday}`;
}

/**
 * The two halves of the headline sentence, kept apart on purpose.
 *
 * `observed` is a measurement, `scheduled` is a plan, and they can honestly
 * disagree — a unit trips, a schedule is revised after Eddy fetched it. A
 * single joined string invites a UI to give them one weight and one voice,
 * after which nobody can tell which half is which. Callers render them as two
 * visually distinct clauses.
 */
export interface NowNextClauses {
  observed: string;
  scheduled: string | null;
}

export function nowNextClauses(
  state: GenerationNow,
  schedule: Array<Pick<DamScheduleDay, 'scheduleDate' | 'hours'>>,
  ref: GenerationReference | null | undefined,
  now = Date.now()
): NowNextClauses {
  return {
    observed: observedClause(state, ref, now),
    scheduled: scheduledClause(schedule, ref, now),
  };
}

function observedClause(
  state: GenerationNow,
  ref: GenerationReference | null | undefined,
  now: number
): string {
  if (state.kind === 'unavailable') {
    return state.reason === 'no-powerhouse'
      ? 'This project has no powerhouse.'
      : 'Current turbine flow unavailable.';
  }

  const age = relativeAge(state.observedAt, now);

  if (state.kind === 'not-generating') {
    return state.age === 'stale' && age
      ? `No turbine generation observed as of ${age}.`
      : 'No turbine generation observed.';
  }

  const phrase = generatorEquivalentPhrase(state.equivalents, ref);
  if (!phrase) {
    // Generating, but with no reference to size it against — say so plainly
    // rather than inventing a denominator.
    return state.age === 'stale' && age
      ? `Turbine generation observed as of ${age}.`
      : 'Turbine generation observed now.';
  }
  return state.age === 'stale' && age ? `${phrase} when last observed, ${age}.` : `${phrase} now.`;
}

function scheduledClause(
  schedule: Array<Pick<DamScheduleDay, 'scheduleDate' | 'hours'>>,
  ref: GenerationReference | null | undefined,
  now: number
): string | null {
  const outlook = scheduleOutlook(schedule, ref, now);
  if (!outlook) return null;

  if (!outlook.move) {
    // The posted schedule runs out without changing. Said as a fact about the
    // POSTED schedule, not about the rest of time — tomorrow's file may simply
    // not exist yet.
    return outlook.generating
      ? 'Generation scheduled for every remaining hour posted.'
      : 'No generation scheduled for the rest of the posted schedule.';
  }

  const when = moveClock(outlook.move);
  switch (outlook.move.kind) {
    case 'start':
      return `Generation scheduled to start at ${when}.`;
    case 'stop':
      // "No generation scheduled after 10 PM" rather than "scheduled off",
      // which sounds more certain than a schedule is entitled to sound.
      return `No generation scheduled after ${when}.`;
    case 'increase':
      return `Generation scheduled to increase at ${when}.`;
    case 'decrease':
      return `Generation scheduled to decrease at ${when}.`;
  }
}

// ── Turbine flow against total release ─────────────────────────────────────

/**
 * How far apart two observations may be and still be subtracted.
 *
 * CWMS publishes these hourly, so 65 minutes admits an adjacent pair and
 * rejects a stale series being differenced against a live one.
 */
export const OBSERVATION_ALIGNMENT_MINUTES = 65;

/** Absolute floor on a difference worth naming, before the relative test. */
export const OTHER_RELEASE_FLOOR_CFS = 50;

/** And the relative one: 2% of the project's own full-generation discharge. */
export const OTHER_RELEASE_FRACTION_OF_FULL = 0.02;

/**
 * Whether the difference between total release and turbine flow can be stated.
 *
 * ── Why this is a gate and not a subtraction ───────────────────────────────
 * "Turbines idle, gates open" is a claim someone acts on, and it is one
 * subtraction away from being wrong in every direction: two series measured an
 * hour apart, one of them a daily mean, one of them a district that defines
 * "release" to already include the powerhouse. When any rule fails, the caller
 * shows the two measurements SEPARATELY and interprets nothing.
 *
 * It is called "other release" and never "spill" or "gates open", because Eddy
 * does not know which outlet the water is leaving through.
 */
export type ReleaseComparison =
  | { kind: 'other-release'; turbineCfs: number; totalCfs: number; otherCfs: number }
  | {
      kind: 'separate';
      reason: 'missing' | 'daily-mean' | 'not-fresh' | 'misaligned' | 'within-tolerance' | 'implausible';
    };

export function releaseComparison(
  generationFlow: DamMetricValue | null | undefined,
  release: DamMetricValue | null | undefined,
  ref: GenerationReference | null | undefined,
  now = Date.now()
): ReleaseComparison {
  if (!generationFlow || !release) return { kind: 'separate', reason: 'missing' };

  // A daily mean and a spot reading are not the same kind of number, and their
  // difference is not a flow. MVS publishes release this way, about a day in
  // arrears.
  if (generationFlow.dailyMean || release.dailyMean) {
    return { kind: 'separate', reason: 'daily-mean' };
  }

  if (readingStaleness(generationFlow.at, now) !== 'fresh') {
    return { kind: 'separate', reason: 'not-fresh' };
  }
  if (readingStaleness(release.at, now) !== 'fresh') {
    return { kind: 'separate', reason: 'not-fresh' };
  }

  const genAt = Date.parse(generationFlow.at);
  const relAt = Date.parse(release.at);
  if (!Number.isFinite(genAt) || !Number.isFinite(relAt)) {
    return { kind: 'separate', reason: 'misaligned' };
  }
  if (Math.abs(genAt - relAt) > OBSERVATION_ALIGNMENT_MINUTES * 60_000) {
    return { kind: 'separate', reason: 'misaligned' };
  }

  const difference = release.value - generationFlow.value;

  // Turbine flow above total release is physically impossible on any reading
  // of the two series, so it means the series do not mean what we think. Say
  // nothing rather than a negative "other release".
  if (difference < 0) return { kind: 'separate', reason: 'implausible' };

  const relative =
    ref && Number.isFinite(ref.fullGenerationCfs)
      ? ref.fullGenerationCfs * OTHER_RELEASE_FRACTION_OF_FULL
      : 0;
  const tolerance = Math.max(OTHER_RELEASE_FLOOR_CFS, relative);
  if (difference <= tolerance) return { kind: 'separate', reason: 'within-tolerance' };

  return {
    kind: 'other-release',
    turbineCfs: generationFlow.value,
    totalCfs: release.value,
    otherCfs: difference,
  };
}

/**
 * The line that explains an "other release" without naming an outlet.
 *
 * Deliberately not "spill" and not "the gates are open": the difference says
 * water is leaving the project by some route other than the turbines, and the
 * data cannot say which.
 */
export const OTHER_RELEASE_NOTE =
  'More is leaving the project than is passing through the turbines. Eddy cannot tell which outlet carries the difference.';

// ── Magnitudes for drawing ─────────────────────────────────────────────────

/** A bar's height, on a scale fixed to the project rather than to the day. */
export interface FixedScaleBar {
  /** 0..1, for height. Clamped, because a bar cannot draw past its box. */
  fraction: number;
  /** True when the underlying value exceeded the reference — label it. */
  over: boolean;
}

/**
 * A SCHEDULED hour's height, as a share of the project's scheduling capacity.
 *
 * ── Why not the day's own peak ─────────────────────────────────────────────
 * Because scaling each day to its own maximum makes a day that runs two units
 * for four hours look exactly like a day that runs all eight flat out. The
 * whole reason someone reads three days at once is to compare them, and the
 * old scaling destroyed the only comparison worth making.
 */
export function scheduledBar(
  megawatts: number,
  ref: GenerationReference | null | undefined
): FixedScaleBar | null {
  if (!Number.isFinite(megawatts) || megawatts < 0) return null;
  if (!ref || !Number.isFinite(ref.schedulingCapacityMw) || ref.schedulingCapacityMw <= 0) {
    return null;
  }
  const raw = megawatts / ref.schedulingCapacityMw;
  return { fraction: Math.max(0, Math.min(1, raw)), over: raw > 1 };
}

/** An OBSERVED hour's height, on the same footing: share of full-power discharge. */
export function observedBar(
  cfs: number | null | undefined,
  ref: GenerationReference | null | undefined
): FixedScaleBar | null {
  const raw = generationFraction(cfs, ref);
  if (raw === null) return null;
  return { fraction: Math.max(0, Math.min(1, raw)), over: raw > 1 };
}

// ── Accessible equivalents ─────────────────────────────────────────────────

/**
 * The rack and bar, said in words.
 *
 * Every chart in this feature is hidden from assistive technology and carries
 * one of these instead — a drawing that exists only for people who can see it
 * is half a feature. Mirrors the pattern nowSentence() established for the
 * schedule bars.
 */
export function generationVoiceOver(
  state: GenerationNow,
  ref: GenerationReference | null | undefined
): string | null {
  if (state.kind === 'unavailable') {
    return state.reason === 'no-powerhouse' ? null : 'Current turbine flow is unavailable.';
  }
  if (state.kind === 'not-generating') {
    return `No turbine generation observed. Turbine discharge is ${Math.round(
      state.turbineCfs
    ).toLocaleString()} cfs.`;
  }

  const parts = [`Observed turbine discharge is ${Math.round(state.turbineCfs).toLocaleString()} cfs`];
  if (state.fraction !== null) {
    parts.push(`${Math.round(state.fraction * 100)}% of published full-generation discharge`);
  }
  if (state.equivalents !== null && ref) {
    parts.push(
      `approximately ${state.equivalents.toFixed(1)} of ${ref.units} full-load generator equivalents`
    );
  }
  return `${parts.join(', ')}.`;
}

/**
 * One day of the timeline, said in words: how many hours run, and at what
 * share of the plant.
 *
 * Deliberately says "scheduled" in every branch. This describes a posted plan
 * and a screen-reader user has no bar chart to tell them so.
 */
export function scheduleDayVoiceOver(
  day: Pick<DamScheduleDay, 'scheduleDate' | 'hours'>,
  ref: GenerationReference | null | undefined
): string {
  const on = day.hours.filter((h) => h.megawatts > 0);
  if (on.length === 0) return 'No generation scheduled at any hour.';

  const peak = on.reduce((max, h) => (h.megawatts > max ? h.megawatts : max), 0);
  const bar = scheduledBar(peak, ref);
  const share = bar ? ` Peak scheduled load is ${Math.round(bar.fraction * 100)}% of plant capacity.` : '';
  const first = hourEndingLabel(on[0].hourEnding);
  const last = hourEndingLabel(on[on.length - 1].hourEnding + 1);

  return `Generation scheduled for ${on.length} of 24 hours, from ${first} to ${last}.${share}`;
}

// ── The pattern strip ──────────────────────────────────────────────────────

/**
 * One hour in the pattern strip, and how well Eddy knows it.
 *
 * Three kinds, not two, and the third is the point: `missing` is an hour with
 * no stored observation. Drawing it as an idle bar would say the units were off
 * during what was actually a feed outage — a claim about the river made out of
 * Eddy's own downtime.
 */
export type PatternCell =
  | { kind: 'observed'; fraction: number; generating: boolean }
  | { kind: 'scheduled'; fraction: number }
  | { kind: 'missing' };

export interface PatternRow {
  /** Central calendar day, YYYY-MM-DD. */
  dayKey: string;
  /** 24 cells, index 0 = hour ending 1. */
  cells: PatternCell[];
  /** True when any part of this row comes from a posted schedule. */
  scheduled: boolean;
  /** True for the row the now marker sits on. */
  today: boolean;
}

/**
 * The rows the strip draws: observed days behind, scheduled days ahead, and
 * today split between them at the current hour.
 *
 * ── The rule this function exists to hold ──────────────────────────────────
 * THE PAST COMES FROM OBSERVATIONS AND THE FUTURE FROM SCHEDULES. An old
 * schedule is what was PLANNED. Redrawing it as history would present a plan as
 * a record of the river, which is the same class of mistake as calling a
 * generation-idle hour a wading window — a true statement about a powerhouse,
 * moved onto a subject it cannot support.
 *
 * Today is the interesting row because it is the one where those two sources
 * meet, and they meet exactly at the now marker: everything before it is
 * measured, everything after it is planned. That is where what Eddy KNOWS
 * changes, so it is where the drawing changes.
 *
 * Lives here rather than in the two strip components because it was written
 * twice, once per platform, and every rule above is one a port can quietly get
 * backwards.
 */
export function patternRows(
  pattern: DamPatternDay[],
  schedule: Array<Pick<DamScheduleDay, 'scheduleDate' | 'hours'>>,
  ref: GenerationReference | null | undefined,
  generationFloorCfs: number | undefined,
  now = Date.now()
): PatternRow[] {
  const today = centralDayKey(now);
  const elapsed = scheduleHoursElapsed(today, now);
  const floor = generationFloorCfs ?? 0;
  const scheduleByDay = new Map(schedule.map((d) => [d.scheduleDate, d]));

  const scheduledCell = (megawatts: number | undefined): PatternCell => {
    if (megawatts === undefined) return { kind: 'missing' };
    return { kind: 'scheduled', fraction: scheduledBar(megawatts, ref)?.fraction ?? 0 };
  };

  const observedCell = (cfs: number | null | undefined): PatternCell => {
    // Null is a gap, and stays one. Zero is a measurement of an idle
    // powerhouse and is a different fact with a different drawing.
    if (cfs === null || cfs === undefined) return { kind: 'missing' };
    return {
      kind: 'observed',
      fraction: observedBar(cfs, ref)?.fraction ?? 0,
      generating: cfs > floor,
    };
  };

  const past: PatternRow[] = pattern.map((day) => {
    const isToday = day.scheduleDate === today;
    const hoursByEnding = new Map(
      scheduleByDay.get(day.scheduleDate)?.hours.map((h) => [h.hourEnding, h.megawatts]) ?? []
    );
    // `scheduleHoursElapsed` is null on any day but today, so a day that is not
    // today is entirely observed — which is what the fallback below encodes.
    const splitAt = isToday && elapsed !== null ? Math.floor(elapsed) : 24;

    return {
      dayKey: day.scheduleDate,
      cells: Array.from({ length: 24 }, (_, i) =>
        i >= splitAt ? scheduledCell(hoursByEnding.get(i + 1)) : observedCell(day.turbineCfs[i])
      ),
      scheduled: isToday && splitAt < 24,
      today: isToday,
    };
  });

  const future: PatternRow[] = schedule
    .filter((d) => d.scheduleDate > today)
    .map((d) => {
      const hoursByEnding = new Map(d.hours.map((h) => [h.hourEnding, h.megawatts]));
      return {
        dayKey: d.scheduleDate,
        cells: Array.from({ length: 24 }, (_, i) => scheduledCell(hoursByEnding.get(i + 1))),
        scheduled: true,
        today: false,
      };
    });

  return [...past, ...future];
}

/** "Wed", or "Today" for the row the marker is on. Central, never the viewer's. */
export function patternRowLabel(dayKey: string, today: boolean): string {
  if (today) return 'Today';
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/**
 * A row, said in words, for readers who get no bars at all.
 *
 * Names its sources separately — "observed" and "scheduled" — because the whole
 * visual distinction between solid and outlined bars is invisible here, and
 * collapsing them into one count would hand a screen-reader user a week of
 * history that is partly a forecast.
 */
export function patternRowVoiceOver(row: PatternRow): string {
  const label = patternRowLabel(row.dayKey, row.today);
  const observed = row.cells.filter((c) => c.kind === 'observed' && c.generating).length;
  const scheduled = row.cells.filter((c) => c.kind === 'scheduled' && c.fraction > 0).length;
  const missing = row.cells.filter((c) => c.kind === 'missing').length;

  // "of 24" on every count, because a bare "generation observed in 2 hours"
  // leaves the listener to guess whether the other 22 were quiet or unknown —
  // which is the exact distinction the third clause exists to draw.
  const parts: string[] = [];
  if (row.cells.some((c) => c.kind === 'observed')) {
    parts.push(`generation observed in ${observed} of 24 hours`);
  }
  if (row.cells.some((c) => c.kind === 'scheduled')) {
    parts.push(`generation scheduled in ${scheduled} of 24 hours`);
  }
  if (missing > 0) {
    parts.push(`${missing} ${missing === 1 ? 'hour' : 'hours'} with no observation`);
  }
  if (parts.length === 0) return `${label}: no data.`;
  return `${label}: ${parts.join(', ')}.`;
}
