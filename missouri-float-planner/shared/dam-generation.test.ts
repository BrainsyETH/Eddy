import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FULL_GENERATION_SHORT_LABEL,
  generationReferenceCitation,
  RACK_ESTIMATE_NOTE,
  schedulePeak,
  schedulePeakLabel,
  schedulePeakTechnical,
  schedulePeakWindowLabel,
  generationFraction,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorEquivalentPhrase,
  generatorRack,
  nowNextClauses,
  observedBar,
  OBSERVATION_ALIGNMENT_MINUTES,
  OTHER_RELEASE_FLOOR_CFS,
  releaseComparison,
  scheduleDayVoiceOver,
  scheduledBar,
  scheduledClauseProvenance,
  scheduleOutlook,
  speaksForNow,
  patternRowVoiceOver,
  patternRows,
  patternSpanLabel,
  unitEquivalents,
  type GenerationReference,
} from './dam-generation';
import type { DamMetricValue, DamSnapshot } from './dam-types';

/**
 * Bull Shoals as SWPA publishes it, and the reason the whole feature exists:
 * eight units, 26,400 cfs at full power, scheduled against 391 MW. The pair is
 * verified against SWPA's project table in
 * dossiers/verified-identifiers-tailwater-swl-bull-shoals-dam.md.
 */
const BULL_SHOALS: GenerationReference = {
  units: 8,
  fullGenerationCfs: 26_400,
  schedulingCapacityMw: 391,
  source: 'SWPA',
};

// 17:00 UTC is noon Central in July (CDT), which is hour ending 13.
const NOON_CENTRAL = Date.parse('2026-07-28T17:00:00Z');

/**
 * A day of scheduled megawatts from a sparse `{ hourEnding: mw }` map — every
 * hour not named is idle. Same helper shape dam-schedule-copy.test.ts uses, so
 * a case reads as the shape of the day rather than as 24 numbers.
 */
function day(
  scheduleDate: string,
  mwByHour: Record<number, number>,
  options?: { retrievedMinutesAgo?: number }
) {
  const ago = options?.retrievedMinutesAgo ?? 5;
  return {
    scheduleDate,
    hours: Array.from({ length: 24 }, (_, i) => ({
      hourEnding: i + 1,
      megawatts: mwByHour[i + 1] ?? 0,
      cfs: null,
      isRamp: false,
    })),
    retrievedAt: new Date(NOON_CENTRAL - ago * 60_000).toISOString(),
  };
}

/** A CWMS reading, `minutesAgo` before the reference instant. */
function reading(
  value: number,
  minutesAgo: number,
  extra?: Partial<DamMetricValue>
): DamMetricValue {
  return {
    value,
    unit: 'cfs',
    at: new Date(NOON_CENTRAL - minutesAgo * 60_000).toISOString(),
    staleness: 'fresh',
    ...extra,
  };
}

/** A powerhouse snapshot with only the fields generationNow reads. */
function dam(
  overrides: Partial<Pick<DamSnapshot, 'hasTurbines' | 'metrics' | 'generationReference' | 'generationFloorCfs'>>
) {
  return {
    hasTurbines: true,
    metrics: {},
    generationReference: BULL_SHOALS,
    generationFloorCfs: 100,
    ...overrides,
  };
}

// ── The arithmetic ─────────────────────────────────────────────────────────

test('a percentage is observed flow over published full-generation discharge', () => {
  // The figure the hero prints, from the pair SWPA publishes together.
  assert.equal(generationFraction(19_130, BULL_SHOALS), 19_130 / 26_400);
  assert.equal(generationPercentLabel(19_130 / 26_400), '72%');
  assert.equal(generationPercentLabel(8_200 / 26_400), '31%');
});

test('an observation above the reference is reported, not clamped', () => {
  // Above full power is real information — spill, a different measurement
  // basis, or a reference that has drifted since the rehabilitation project.
  // Clamping it to 100% would hide exactly the case worth showing.
  const fraction = generationFraction(29_000, BULL_SHOALS)!;
  assert.ok(fraction > 1);
  assert.equal(generationPercentLabel(fraction), '110%');

  const rack = generatorRack(29_000, BULL_SHOALS)!;
  assert.equal(rack.overflow, true);
  assert.equal(rack.cells.length, 8, 'the rack still draws the published unit count');
  assert.ok(rack.cells.every((c) => c.fill === 1));
});

test('generator equivalents divide full-power discharge, not the unit count', () => {
  // 19,130 / 26,400 * 8 = 5.797…, the number the partial cell is drawn from.
  const equivalents = unitEquivalents(19_130, BULL_SHOALS)!;
  assert.ok(Math.abs(equivalents - 5.797) < 0.001);

  const rack = generatorRack(19_130, BULL_SHOALS)!;
  assert.deepEqual(
    rack.cells.map((c) => Math.round(c.fill * 100) / 100),
    [1, 1, 1, 1, 1, 0.8, 0, 0],
    'five full cells and a partial sixth — never six lit icons'
  );
  assert.equal(rack.overflow, false);
});

test('the phrase hedges, carries the denominator, and refuses to round a trickle up', () => {
  // The scale rides along: "About 6" made a reader who does not know this
  // plant hold the number until they found out how many units it has.
  assert.equal(generatorEquivalentPhrase(5.797, BULL_SHOALS), 'About 6 of 8 generators’ worth');
  assert.equal(generatorEquivalentPhrase(1.4, BULL_SHOALS), 'About 1 of 8 generators’ worth');
  // 0.9 must not become "about 1 of 8" — that reads as a unit running when the
  // honest statement is that very little is moving. 795 cfs at Bull Shoals is
  // 0.24 equivalents, and "1 of 8" would overstate it fourfold.
  assert.equal(generatorEquivalentPhrase(0.9, BULL_SHOALS), 'Less than one generator’s worth');
  assert.equal(unitEquivalents(795, BULL_SHOALS)! < 1, true);
  assert.equal(generatorEquivalentPhrase(unitEquivalents(795, BULL_SHOALS), BULL_SHOALS), 'Less than one generator’s worth');
  assert.equal(generatorEquivalentPhrase(9.2, BULL_SHOALS), 'More than all 8 generators’ worth');
});

test('no reference means no percentage and no rack, never a zero', () => {
  // Stockton and Truman publish nothing to CWMS; a dam can also arrive from an
  // older deploy with no reference on the wire. Absence must not compute.
  assert.equal(generationFraction(8_200, undefined), null);
  assert.equal(unitEquivalents(8_200, undefined), null);
  assert.equal(generatorRack(8_200, undefined), null);
  assert.equal(generationFraction(8_200, { ...BULL_SHOALS, fullGenerationCfs: 0 }), null);
});

test('the percentage says what it is OF, and the citation sits beneath it', () => {
  // Split rather than shortened: the label beside the number stays readable,
  // and the publisher — the only reason the figure is checkable at all —
  // keeps its own line rather than being dropped.
  assert.equal(FULL_GENERATION_SHORT_LABEL, 'of full generation');
  assert.ok(!/power/i.test(FULL_GENERATION_SHORT_LABEL), 'never "% power" — see the header');
  assert.equal(generationReferenceCitation(BULL_SHOALS), 'Full generation is 26,400 cfs (SWPA)');
});

// ── Observed state ─────────────────────────────────────────────────────────

test('the floor separates idle leakage from generation', () => {
  // CWMS reports real flow through idle turbines — ~20 cfs measured at Table
  // Rock against a 100 cfs registry floor. `value > 0` would light the chip on
  // leakage.
  const idle = generationNow(dam({ metrics: { generationFlow: reading(20, 5) } }), NOON_CENTRAL);
  assert.equal(idle.kind, 'not-generating');

  const on = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  assert.equal(on.kind, 'generating');
});

test('missing data is never "not generating"', () => {
  // The whole discipline in one assertion: four different absences, and not one
  // of them may render as an idle powerhouse.
  assert.deepEqual(generationNow(dam({ hasTurbines: false }), NOON_CENTRAL), {
    kind: 'unavailable',
    reason: 'no-powerhouse',
  });
  assert.deepEqual(generationNow(dam({ metrics: {} }), NOON_CENTRAL), {
    kind: 'unavailable',
    reason: 'not-published',
  });
  assert.deepEqual(
    generationNow(
      dam({ metrics: { generationFlow: { value: 1, unit: 'cfs', at: 'nonsense', staleness: 'fresh' } } }),
      NOON_CENTRAL
    ),
    { kind: 'unavailable', reason: 'unreadable' }
  );
  assert.equal(generationStatusLabel({ kind: 'unavailable', reason: 'not-published' }), 'Current generation unavailable');
  // A flood-control project heads nothing at all rather than inventing a
  // powerhouse to report on.
  assert.equal(generationStatusLabel({ kind: 'unavailable', reason: 'no-powerhouse' }), null);
});

test('a stale observation keeps its number and loses the present tense', () => {
  // READING_STALE_AFTER_HOURS is 6. The band is computed from the timestamp on
  // the reader's clock, not read off the wire's frozen `staleness`.
  const state = generationNow(
    dam({ metrics: { generationFlow: reading(19_130, 9 * 60) } }),
    NOON_CENTRAL
  );
  assert.equal(state.kind, 'generating');
  assert.equal(state.kind === 'generating' && state.age, 'stale');
  assert.equal(generationStatusLabel(state), 'Last observed generating');

  const clauses = nowNextClauses(state, [], BULL_SHOALS, NOON_CENTRAL);
  assert.equal(clauses.observed, 'About 6 of 8 generators’ worth when last observed, 9 hours ago.');
  assert.ok(!/\bnow\b/.test(clauses.observed), 'a stale reading may not say "now"');
});

// ── Now and next, kept apart ───────────────────────────────────────────────

test('the observed clause and the scheduled clause are separate strings', () => {
  // They can honestly disagree — a unit trips, a schedule is revised after Eddy
  // fetched it. One joined string invites a UI to give them one voice, after
  // which nobody can tell which half is a measurement.
  const state = generationNow(
    dam({ metrics: { generationFlow: reading(19_130, 12) } }),
    NOON_CENTRAL
  );
  const schedule = [day('2026-07-28', { 13: 300, 14: 300, 15: 300, 16: 300, 17: 300, 18: 300, 19: 300, 20: 300, 21: 300, 22: 300 })];
  const clauses = nowNextClauses(state, schedule, BULL_SHOALS, NOON_CENTRAL);

  assert.equal(clauses.observed, 'About 6 of 8 generators’ worth now.');
  assert.equal(
    clauses.scheduled,
    'Generation scheduled to stop at 10 PM. Later hours have not been posted.',
    'unbounded only because the posted schedule does not reach a restart'
  );
});

test('an idle plant with a start ahead of it says both halves', () => {
  const state = generationNow(dam({ metrics: { generationFlow: reading(20, 8) } }), NOON_CENTRAL);
  const schedule = [day('2026-07-28', { 14: 300, 15: 300 })];
  const clauses = nowNextClauses(state, schedule, BULL_SHOALS, NOON_CENTRAL);

  assert.equal(clauses.observed, 'No turbine generation observed.');
  assert.equal(clauses.scheduled, 'Generation scheduled to start at 1 PM.');
});

test('an unreadable feed says so instead of borrowing the schedule', () => {
  const state = generationNow(dam({ metrics: {} }), NOON_CENTRAL);
  const schedule = [day('2026-07-28', { 13: 300, 14: 300, 15: 300, 16: 300, 17: 300, 18: 300, 19: 300, 20: 300 })];
  const clauses = nowNextClauses(state, schedule, BULL_SHOALS, NOON_CENTRAL);

  assert.equal(clauses.observed, 'Current turbine flow unavailable.');
  assert.equal(
    clauses.scheduled,
    'Generation scheduled to stop at 8 PM. Later hours have not been posted.'
  );
});

test('no schedule at all yields no scheduled clause rather than a guess', () => {
  const state = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  assert.equal(nowNextClauses(state, [], BULL_SHOALS, NOON_CENTRAL).scheduled, null);
  // A schedule that exists but does not cover today is the same answer.
  assert.equal(
    nowNextClauses(state, [day('2026-07-29', { 8: 300 })], BULL_SHOALS, NOON_CENTRAL).scheduled,
    null
  );
});

// ── The next scheduled move ────────────────────────────────────────────────

test('a material load change is reported, a trivial one is not', () => {
  // One generator's worth of scheduling capacity at Bull Shoals is 391/8 ≈ 49
  // MW. Below that the megawatt-to-cfs conversion's own ±10% swallows the move,
  // and announcing it would be reporting noise as an event.
  const bump = [day('2026-07-28', { 13: 100, 14: 120, 15: 300 })];
  const move = scheduleOutlook(bump, BULL_SHOALS, NOON_CENTRAL)?.move;
  assert.equal(move?.kind, 'increase');
  assert.equal(move?.hourEnding, 15, 'hour 14 moved only 20 MW and is not a move');

  const drop = [day('2026-07-28', { 13: 300, 14: 300, 15: 100, 16: 100 })];
  assert.equal(scheduleOutlook(drop, BULL_SHOALS, NOON_CENTRAL)?.move?.kind, 'decrease');
});

test('load creeping up hour by hour still trips the threshold', () => {
  // Every hour moves 20 MW — never enough against its neighbour, but the third
  // step is 60 MW above what is running now, which clears the 48.9 MW
  // threshold. Comparing neighbours would report nothing at all.
  const creep = [day('2026-07-28', { 13: 100, 14: 120, 15: 140, 16: 160, 17: 180 })];
  const move = scheduleOutlook(creep, BULL_SHOALS, NOON_CENTRAL)?.move;
  assert.equal(move?.kind, 'increase');
  assert.equal(move?.hourEnding, 16);
});

test('an on/off flip outranks a load change at the same hour', () => {
  const stop = [day('2026-07-28', { 13: 300, 14: 300 })];
  const move = scheduleOutlook(stop, BULL_SHOALS, NOON_CENTRAL)?.move;
  assert.equal(move?.kind, 'stop');
  assert.equal(move?.hourEnding, 15);
});

test('the walk stops at a gap in the schedule days', () => {
  // fetchProjectSchedule drops a day whose file has not refreshed, so the array
  // can hold today and the day after tomorrow with a hole between them. Walking
  // across it would report Thursday's 6 AM start as Wednesday's.
  const gapped = [
    day('2026-07-28', { 13: 300, 14: 300, 15: 300, 16: 300, 17: 300, 18: 300, 19: 300, 20: 300, 21: 300, 22: 300, 23: 300, 24: 300 }),
    day('2026-07-30', { 8: 300 }),
  ];
  assert.equal(scheduleOutlook(gapped, BULL_SHOALS, NOON_CENTRAL)?.move, null);
});

test('a move tomorrow and a move later in the week name their day', () => {
  const today = { 13: 300, 14: 300, 15: 300, 16: 300, 17: 300, 18: 300, 19: 300, 20: 300, 21: 300, 22: 300, 23: 300, 24: 300 };
  const tomorrow = [day('2026-07-28', today), day('2026-07-29', { 1: 300, 2: 300, 3: 300 })];
  const state = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  assert.equal(
    nowNextClauses(state, tomorrow, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'Generation scheduled to stop at 3 AM tomorrow. Later hours have not been posted.'
  );

  const thursday = [
    day('2026-07-28', today),
    day('2026-07-29', Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 300]))),
    day('2026-07-30', { 1: 300, 2: 300 }),
  ];
  assert.equal(
    nowNextClauses(state, thursday, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'Generation scheduled to stop at 2 AM Thursday. Later hours have not been posted.'
  );
});

test('a schedule that never changes says so about the POSTED schedule', () => {
  const allDay = [day('2026-07-28', Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 300])))];
  const state = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  assert.equal(
    nowNextClauses(state, allDay, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'Generation scheduled for every remaining hour posted.'
  );

  const never = [day('2026-07-28', {})];
  const idle = generationNow(dam({ metrics: { generationFlow: reading(20, 5) } }), NOON_CENTRAL);
  assert.equal(
    nowNextClauses(idle, never, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'No generation scheduled for the rest of the posted schedule.'
  );
});

// ── Turbine flow against total release ─────────────────────────────────────

test('other release is stated only when every rule passes', () => {
  const comparison = releaseComparison(reading(0, 10), reading(1_250, 10), BULL_SHOALS, {
    declared: true,
    now: NOON_CENTRAL,
  });
  assert.deepEqual(comparison, {
    kind: 'other-release',
    turbineCfs: 0,
    totalCfs: 1_250,
    otherCfs: 1_250,
  });
});

test('a difference inside tolerance is not an outlet', () => {
  // Tolerance is the larger of 50 cfs and 2% of full power — 528 cfs here. Two
  // series measuring almost the same water disagree by less than that all day.
  const within = releaseComparison(reading(19_130, 10), reading(19_430, 10), BULL_SHOALS, {
    declared: true,
    now: NOON_CENTRAL,
  });
  assert.deepEqual(within, { kind: 'separate', reason: 'within-tolerance' });
  assert.ok(OTHER_RELEASE_FLOOR_CFS < 528, 'the relative test is the binding one at Bull Shoals');
});

/** The reason a pair was left un-subtracted, or a failure if it WAS subtracted. */
function separateReason(comparison: ReturnType<typeof releaseComparison>): string {
  assert.equal(comparison.kind, 'separate', 'this pair should never have been subtracted');
  return comparison.kind === 'separate' ? comparison.reason : '';
}

test('misaligned, stale, averaged or impossible pairs are never subtracted', () => {
  // Each of these produced a plausible-looking number and none of them is one.
  assert.equal(separateReason(releaseComparison(reading(0, 10), reading(1_250, 10 + OBSERVATION_ALIGNMENT_MINUTES + 1), BULL_SHOALS, { declared: true, now: NOON_CENTRAL })), 'misaligned');
  assert.equal(separateReason(releaseComparison(reading(0, 8 * 60), reading(1_250, 8 * 60), BULL_SHOALS, { declared: true, now: NOON_CENTRAL })), 'not-fresh');
  assert.equal(separateReason(releaseComparison(reading(0, 10), reading(1_250, 10, { dailyMean: true }), BULL_SHOALS, { declared: true, now: NOON_CENTRAL })), 'daily-mean');
  // Turbine flow above total release means the series do not mean what we
  // think, so nothing is said rather than a negative "other release".
  assert.equal(separateReason(releaseComparison(reading(5_000, 10), reading(1_250, 10), BULL_SHOALS, { declared: true, now: NOON_CENTRAL })), 'implausible');
  assert.equal(separateReason(releaseComparison(reading(0, 10), undefined, BULL_SHOALS, { declared: true, now: NOON_CENTRAL })), 'missing');
});

// ── Drawing ────────────────────────────────────────────────────────────────

test('bar heights are fixed to the project, not to the day', () => {
  // The bug this replaces: a day peaking at 100 MW and a day peaking at 391 MW
  // drew identical bars, so the only comparison worth making was destroyed.
  const light = scheduledBar(100, BULL_SHOALS)!;
  const full = scheduledBar(391, BULL_SHOALS)!;
  assert.ok(Math.abs(light.fraction - 100 / 391) < 1e-9);
  assert.equal(full.fraction, 1);
  assert.equal(full.over, false);

  const over = scheduledBar(420, BULL_SHOALS)!;
  assert.equal(over.fraction, 1, 'a bar cannot draw past its box');
  assert.equal(over.over, true, 'but the caller is told it was capped');

  // Observed bars use the discharge half of the same pair, so an observed hour
  // and a scheduled hour are drawn on comparable scales.
  assert.ok(Math.abs(observedBar(13_200, BULL_SHOALS)!.fraction - 0.5) < 1e-9);
});

// ── Accessible equivalents ─────────────────────────────────────────────────

test('every chart has a sentence that says the same thing', () => {
  const state = generationNow(
    dam({ metrics: { generationFlow: reading(19_130, 5) } }),
    NOON_CENTRAL
  );
  assert.equal(
    generationVoiceOver(state, BULL_SHOALS),
    'Observed turbine discharge is 19,130 cfs, 72% of published full-generation discharge, approximately 5.8 of 8 full-load generator equivalents.'
  );

  assert.equal(
    scheduleDayVoiceOver(day('2026-07-28', { 14: 391, 15: 391, 16: 391 }), BULL_SHOALS),
    'Generation scheduled for 3 of 24 hours, 1 PM – 4 PM. Peak scheduled load is 100% of plant capacity.'
  );
  assert.equal(
    scheduleDayVoiceOver(day('2026-07-28', {}), BULL_SHOALS),
    'No generation scheduled at any hour.'
  );
});

// ── The claims this copy is not allowed to make ────────────────────────────

test('no generation copy promises a safe river', () => {
  // The sibling of dam-schedule-copy.test.ts's water assertion. This module may
  // say "water" — an observation of total release legitimately does — but
  // nothing here may imply it is safe to stand in.
  const generating = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  const idleState = generationNow(dam({ metrics: { generationFlow: reading(20, 5) } }), NOON_CENTRAL);
  const schedule = [day('2026-07-28', { 13: 300, 14: 300, 15: 300, 16: 300, 17: 300, 18: 300, 19: 300, 20: 300, 21: 300, 22: 300 })];

  const strings = [
    generationStatusLabel(generating)!,
    generationStatusLabel(idleState)!,
    nowNextClauses(generating, schedule, BULL_SHOALS, NOON_CENTRAL).observed,
    nowNextClauses(generating, schedule, BULL_SHOALS, NOON_CENTRAL).scheduled!,
    nowNextClauses(idleState, schedule, BULL_SHOALS, NOON_CENTRAL).observed,
    generatorEquivalentPhrase(5.8, BULL_SHOALS)!,
    generationVoiceOver(generating, BULL_SHOALS)!,
    scheduleDayVoiceOver(day('2026-07-28', { 14: 391 }), BULL_SHOALS),
  ];

  for (const s of strings) {
    assert.ok(s, 'expected a sentence to check');
    assert.ok(
      !/\b(safe|wade|wading|window|low water|dry)\b/i.test(s),
      `generation copy must not imply a safe river: ${JSON.stringify(s)}`
    );
  }
});

test('an observation is never phrased as a plan, and a plan never as a fact', () => {
  // The two halves are the two mistakes. An observed clause that said
  // "scheduled" would present CWMS as SWPA; a scheduled clause missing
  // "scheduled" would present a plan as a measurement someone can act on.
  const state = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  const schedule = [day('2026-07-28', { 13: 300, 14: 300, 15: 300, 16: 300 })];
  const clauses = nowNextClauses(state, schedule, BULL_SHOALS, NOON_CENTRAL);

  assert.ok(!/scheduled/i.test(clauses.observed));
  assert.ok(/scheduled/i.test(clauses.scheduled!));
});

// ── The pattern strip ──────────────────────────────────────────────────────

/** A stored day, from a sparse `{ hourIndex: cfs }` map. Every other hour is a gap. */
function observedDay(
  scheduleDate: string,
  turbineByIndex: Record<number, number>,
  /** 23 or 25 on a daylight-saving transition. Defaults to an ordinary day. */
  hours = 24,
  /**
   * Central midnight in UTC — 05:00 during daylight time, 06:00 during
   * standard. The anchor matters to patternRows on TODAY's row, where the
   * observed half is cut by real hours since this instant; buildPatternDays is
   * what computes it for real, and dam-history.test.ts pins that.
   */
  startUtc = `${scheduleDate}T05:00:00.000Z`
) {
  return {
    scheduleDate,
    startUtc,
    turbineCfs: Array.from({ length: hours }, (_, i) =>
      turbineByIndex[i] === undefined ? null : turbineByIndex[i]
    ),
    totalReleaseCfs: new Array(hours).fill(null),
  };
}

test('a past day is drawn entirely from what was measured', () => {
  // Never from the schedule that was posted for it. A schedule is what was
  // PLANNED, and redrawing it as history presents a plan as a record of the
  // river — the same class of mistake as calling an idle hour a wading window.
  const rows = patternRows(
    [observedDay('2026-07-27', { 8: 19_130, 9: 19_130 })],
    [day('2026-07-27', { 1: 391, 2: 391, 3: 391 })],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );

  const yesterday = rows.find((r) => r.dayKey === '2026-07-27')!;
  assert.ok(
    yesterday.cells.every((c) => c.kind !== 'scheduled'),
    'yesterday must carry no scheduled cells even though a schedule exists for it'
  );
  assert.equal(yesterday.cells[8].kind, 'observed');
  assert.equal(yesterday.cells[0].kind, 'missing', 'an unobserved hour is a gap, not an idle bar');
  assert.equal(yesterday.today, false);
});

test('today switches from measured to planned at the marker', () => {
  // Noon Central: hours 0-11 have happened and are observations, 12-23 have not
  // and are SWPA's plan. That boundary is where what Eddy knows changes, so it
  // is where the drawing changes.
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130, 14: 19_130 })],
    [day('2026-07-28', { 15: 391, 16: 391 })],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );

  const today = rows.find((r) => r.today)!;
  assert.equal(today.cells[8].kind, 'observed', 'an elapsed hour is what was measured');
  assert.equal(today.cells[14].kind, 'scheduled', 'a future hour is what is planned');
  // Hour index 14 had a stored observation too. The schedule must win there —
  // an observation in the future is a clock error, not a measurement.
  assert.equal(
    today.cells.filter((c) => c.kind === 'observed').length,
    1,
    'nothing after the marker may be drawn as observed'
  );
});

test('a future day is scheduled only, and unposted hours stay gaps', () => {
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130 })],
    [day('2026-07-29', { 8: 391 })],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );

  const tomorrow = rows.find((r) => r.dayKey === '2026-07-29')!;
  assert.equal(tomorrow.scheduled, true);
  assert.equal(tomorrow.today, false);
  assert.ok(tomorrow.cells.every((c) => c.kind === 'scheduled'));
  assert.equal((tomorrow.cells[7] as { fraction: number }).fraction, 1);
});

test('an observed hour below the floor is idle, and a gap is neither', () => {
  // The two must be separable by the renderer: one is a measurement of an idle
  // powerhouse, the other is Eddy's own downtime. Drawing them alike would say
  // the units were off during an outage.
  const rows = patternRows(
    [observedDay('2026-07-27', { 3: 20, 4: 19_130 })],
    [],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );
  const cells = rows.find((r) => r.dayKey === '2026-07-27')!.cells;

  assert.deepEqual(cells[3], { kind: 'observed', fraction: 20 / 26_400, generating: false });
  assert.equal(cells[4].kind === 'observed' && cells[4].generating, true);
  assert.equal(cells[5].kind, 'missing');
});

test('a row says which of its hours were measured and which were planned', () => {
  // The solid/outlined distinction is invisible to a screen reader, so
  // collapsing the two counts would hand somebody a week of history that is
  // partly a forecast.
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130, 9: 19_130 })],
    [day('2026-07-28', { 15: 391 }), day('2026-07-29', { 8: 391, 9: 391 })],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );

  // Today: 12 elapsed hours of which 2 were measured (10 gaps), then 12 posted
  // hours of which 1 carries load.
  assert.equal(
    patternRowVoiceOver(rows.find((r) => r.today)!),
    'Today: generation observed in 2 of 24 hours, generation scheduled in 1 of 24 hours, 10 hours with no observation.'
  );
  // Tomorrow is posted in full, so there is nothing missing to mention — every
  // other hour is scheduled OFF, which is a fact rather than a gap.
  assert.equal(
    patternRowVoiceOver(rows.find((r) => r.dayKey === '2026-07-29')!),
    'Wed: generation scheduled in 2 of 24 hours.'
  );
});

test('the strip says which days it covers, counted from the rows it has', () => {
  // The row labels name each row and never the whole, so the span is the only
  // thing that tells a reader whether they are looking at a week or a fortnight.
  // Counted from the rows rather than from the window constants: a dam with two
  // days of history must not claim seven.
  const rows = patternRows(
    [observedDay('2026-07-27', { 8: 19_130 }), observedDay('2026-07-28', { 8: 19_130 })],
    [day('2026-07-29', { 8: 391 })],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );

  assert.equal(patternSpanLabel(rows), 'The past 1 day, today, and the next 1 day');
});

test('the span never promises a tomorrow the dam has not posted', () => {
  // Most dams have no schedule at all — SWPA posts for a handful — so a strip
  // that always said "and the next 2 days" would be describing a forecast that
  // is not on screen.
  const rows = patternRows(
    [observedDay('2026-07-26', { 8: 19_130 }), observedDay('2026-07-28', { 8: 19_130 })],
    [],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );

  const label = patternSpanLabel(rows)!;
  assert.doesNotMatch(label, /next/);
  assert.match(label, /^The past \d+ days? and today$/);
});

test('an empty strip has no span to state', () => {
  assert.equal(patternSpanLabel([]), null);
});

// ── Review fixes: the present tense, the stale schedule, the gated gap ─────

test('a LAGGING observation loses "now", not just a stale one', () => {
  // READING_LAGGING_AFTER_HOURS is 2 and READING_STALE_AFTER_HOURS is 6. The
  // present tense was gated on `stale`, so a five-hour-old reading rendered
  // "GENERATING NOW / About 6 generators' worth now" — a true number attached
  // to the wrong moment, the same class of error as an hour-ending off-by-one.
  assert.equal(speaksForNow('fresh'), true);
  assert.equal(speaksForNow('lagging'), false);
  assert.equal(speaksForNow('stale'), false);

  const lagging = generationNow(
    dam({ metrics: { generationFlow: reading(19_130, 5 * 60) } }),
    NOON_CENTRAL
  );
  assert.equal(lagging.kind === 'generating' && lagging.age, 'lagging');
  assert.equal(generationStatusLabel(lagging), 'Last observed generating');

  const clauses = nowNextClauses(lagging, [], BULL_SHOALS, NOON_CENTRAL);
  assert.ok(!/\bnow\b/.test(clauses.observed), `still said now: ${clauses.observed}`);
  assert.equal(clauses.observed, 'About 6 of 8 generators’ worth when last observed, 5 hours ago.');

  // And the idle side of the same rule.
  const idleLagging = generationNow(
    dam({ metrics: { generationFlow: reading(20, 5 * 60) } }),
    NOON_CENTRAL
  );
  assert.equal(generationStatusLabel(idleLagging), 'No generation at last observation');
});

test('a stop is bounded by its restart when the schedule reaches one', () => {
  // "No generation scheduled after 10 PM" reads as open-ended and stays that
  // way in the reader's head even when the units are back at 6 AM. A night off
  // and a shutdown are different plans.
  const overnight = [
    day('2026-07-28', { 13: 300, 14: 300, 15: 300, 16: 300, 17: 300, 18: 300, 19: 300, 20: 300, 21: 300, 22: 300 }),
    day('2026-07-29', { 7: 300, 8: 300, 9: 300 }),
  ];
  const state = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  assert.equal(
    nowNextClauses(state, overnight, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'No generation scheduled from 10 PM to 6 AM tomorrow.'
  );

  const outlook = scheduleOutlook(overnight, BULL_SHOALS, NOON_CENTRAL);
  assert.equal(outlook?.move?.kind, 'stop');
  assert.equal(outlook?.resumesAt?.hourEnding, 7);
  assert.equal(outlook?.resumesAt?.dayOffset, 1);
});

test('a stale schedule says so beside its own sentence, and is not suppressed', () => {
  // SCHEDULE_STALE_AFTER_MINUTES is 90. Suppressing the line would trade a
  // legible caveat for an invisible one — "when does generation stop" is the
  // most load-bearing sentence on the page, and a reader given nothing guesses.
  const stale = [
    day('2026-07-28', { 13: 300, 14: 300, 15: 300 }, { retrievedMinutesAgo: 200 }),
  ];
  const state = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);

  const clauses = nowNextClauses(state, stale, BULL_SHOALS, NOON_CENTRAL);
  assert.ok(clauses.scheduled, 'the sentence survives staleness');
  assert.equal(scheduleOutlook(stale, BULL_SHOALS, NOON_CENTRAL)?.stale, true);
  assert.equal(
    scheduledClauseProvenance(stale, BULL_SHOALS, NOON_CENTRAL),
    'From a schedule Eddy last retrieved 3 hours ago. It may have been revised since.'
  );

  // A current schedule says nothing extra.
  const fresh = [day('2026-07-28', { 13: 300, 14: 300, 15: 300 })];
  assert.equal(scheduledClauseProvenance(fresh, BULL_SHOALS, NOON_CENTRAL), null);
  assert.equal(scheduleOutlook(fresh, BULL_SHOALS, NOON_CENTRAL)?.stale, false);
});

test('a stale schedule is marked on the pattern rows it draws', () => {
  const staleSchedule = [
    day('2026-07-28', { 20: 300 }, { retrievedMinutesAgo: 200 }),
    day('2026-07-29', { 8: 300 }, { retrievedMinutesAgo: 200 }),
  ];
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130 })],
    staleSchedule,
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );
  const tomorrow = rows.find((r) => r.dayKey === '2026-07-29')!;
  assert.equal(tomorrow.scheduleStale, true);
  assert.ok(
    patternRowVoiceOver(tomorrow).includes('may have been revised'),
    'the caveat has to reach a screen reader too — the visual treatment does not'
  );
});

test('the release gap is not stated for a dam that has not declared it', () => {
  // The arithmetic cannot see whether the two series MEAN compatible things at
  // a given project. Bull Shoals returned byte-identical values for both on a
  // live read, which no timestamp check can distinguish from a genuine
  // all-through-the-turbines hour.
  const undeclared = releaseComparison(reading(0, 10), reading(1_250, 10), BULL_SHOALS, {
    now: NOON_CENTRAL,
  });
  assert.deepEqual(undeclared, { kind: 'separate', reason: 'not-declared' });
});

test('an adjacent hourly pair is no longer close enough to subtract', () => {
  // The 65-minute window admitted exactly the pair that manufactures a number:
  // during a start, 10:00 total release against 11:00 turbine flow yields
  // thousands of cfs of "other release" that no outlet is carrying.
  assert.equal(OBSERVATION_ALIGNMENT_MINUTES, 5);
  assert.equal(
    separateReason(
      releaseComparison(reading(0, 10), reading(19_000, 70), BULL_SHOALS, {
        declared: true,
        now: NOON_CENTRAL,
      })
    ),
    'misaligned'
  );
  // Same hour, small jitter, still fine.
  assert.equal(
    releaseComparison(reading(0, 10), reading(1_250, 12), BULL_SHOALS, {
      declared: true,
      now: NOON_CENTRAL,
    }).kind,
    'other-release'
  );
});

test('a screen reader hears the actual generating windows, not their span', () => {
  // 6-9 AM and 5-8 PM is six hours in two blocks — the commonest shape a
  // peaking plant has. It was described as a fourteen-hour continuous run.
  const split = day('2026-07-28', { 7: 280, 8: 280, 9: 280, 18: 280, 19: 280, 20: 280 });
  assert.equal(
    scheduleDayVoiceOver(split, BULL_SHOALS),
    'Generation scheduled for 6 of 24 hours, 6 AM – 9 AM and 5 PM – 8 PM. Peak scheduled load is 72% of plant capacity.'
  );

  // Past three blocks the recitation stops being listenable and the count says
  // more than the list would.
  const scattered = day('2026-07-28', { 2: 280, 5: 280, 8: 280, 11: 280, 14: 280 });
  assert.ok(scheduleDayVoiceOver(scattered, BULL_SHOALS).includes('in 5 periods'));
});

test('a row is as long as its day, not as long as 24', () => {
  // The strip draws a 23-hour day with 23 bars and a 25-hour day with 25. The
  // alternative — padding both to 24 — is what invented a gap each March and
  // dropped a reading each November; see DamPatternDay.
  const spring = patternRows(
    [observedDay('2026-03-08', { 0: 19_130 }, 23)],
    [],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );
  assert.equal(spring[0].cells.length, 23);

  const fall = patternRows(
    [observedDay('2026-11-01', { 0: 19_130 }, 25)],
    [],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );
  assert.equal(fall[0].cells.length, 25);
  // And the spoken summary counts against the real length rather than 24.
  assert.ok(patternRowVoiceOver(fall[0]).includes('of 25 hours'));
});

test('the now marker is the measured/scheduled boundary, not elapsed over 24', () => {
  // Noon Central: twelve hours have happened. The marker belongs at cell 12
  // regardless of how many hours the day turns out to hold.
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130 })],
    [day('2026-07-28', { 20: 300 })],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );
  const today = rows.find((r) => r.today)!;
  assert.equal(today.splitIndex, 12);
  assert.equal(today.cells.length, 24);
  // Index 8 was observed; index 11 was an elapsed hour with no reading stored,
  // which is a gap and not a forecast — the split is about SOURCE, not fill.
  assert.equal(today.cells[8].kind, 'observed');
  assert.equal(today.cells[11].kind, 'missing');
  assert.equal(today.cells[12].kind, 'scheduled');

  // A row that is wholly one thing has no boundary to draw.
  assert.equal(rows.find((r) => !r.today)?.splitIndex ?? null, null);
});

// ── Review fixes: the wrong midnight, the ref-less strip, the DST split ────

test('a move at tomorrow’s hour ending 1 is midnight TONIGHT, never tomorrow', () => {
  // Tomorrow's hour ending 1 is the release running from 00:00 tonight — the
  // midnight a reader at noon is twelve hours from, not thirty-six. "midnight
  // tomorrow" quietly moved the change a day out, in the dangerous direction:
  // it told a wading angler they had a full day before the units came on.
  // nextScheduleChangeSentence fixed this first; moveClock is what the live
  // heroes actually render through, and it had the unguarded phrasing.
  const idle = generationNow(dam({ metrics: { generationFlow: reading(20, 5) } }), NOON_CENTRAL);
  const startAtMidnight = [day('2026-07-28', {}), day('2026-07-29', { 1: 300, 2: 300 })];
  assert.equal(
    nowNextClauses(idle, startAtMidnight, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'Generation scheduled to start at midnight tonight.'
  );

  // The bounded-stop sentence names a restart through the same clock.
  const on = generationNow(dam({ metrics: { generationFlow: reading(19_130, 5) } }), NOON_CENTRAL);
  const nightOff = [
    day('2026-07-28', { 13: 300, 14: 300, 15: 300, 16: 300, 17: 300, 18: 300, 19: 300, 20: 300, 21: 300, 22: 300 }),
    day('2026-07-29', { 1: 300, 2: 300 }),
  ];
  assert.equal(
    nowNextClauses(on, nightOff, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'No generation scheduled from 10 PM to midnight tonight.'
  );

  // An ordinary tomorrow hour is unaffected.
  const startAtSix = [day('2026-07-28', {}), day('2026-07-29', { 7: 300, 8: 300 })];
  assert.equal(
    nowNextClauses(idle, startAtSix, BULL_SHOALS, NOON_CENTRAL).scheduled,
    'Generation scheduled to start at 6 AM tomorrow.'
  );
});

test('a scheduled hour with no reference still knows it is on', () => {
  // Without a reference the fraction collapses to 0 — there is no scale to
  // draw against — but on/off comes from the schedule itself. Judging the cell
  // by its fraction turned a full-load forecast into scheduled idle: an
  // absence of scale becoming "not generating", on the deploy-skew payload
  // DamSnapshot.generationReference explicitly commits to supporting.
  const allDay = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 300]));
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130 })],
    [day('2026-07-29', allDay)],
    undefined,
    100,
    NOON_CENTRAL
  );
  const tomorrow = rows.find((r) => r.dayKey === '2026-07-29')!;
  assert.ok(
    tomorrow.cells.every((c) => c.kind === 'scheduled' && c.generating),
    'every full-load hour stays ON with no reference'
  );
  assert.ok(
    tomorrow.cells.every((c) => c.kind === 'scheduled' && c.fraction === 0),
    'while the fraction honestly says there is no scale'
  );
  // And the spoken count agrees with the schedule, not with the missing scale.
  assert.equal(patternRowVoiceOver(tomorrow), 'Wed: generation scheduled in 24 of 24 hours.');
});

test('today’s split survives the fall-back day without dropping a measured hour', () => {
  // 2026-11-01 is 25 real hours long. At 3 PM CST the wall clock reads 15 but
  // SIXTEEN real hours have completed since the day's startUtc (05:00Z,
  // midnight CDT) — and the observed array is indexed by real hours. Cutting
  // it at the wall clock dropped the stored 2-3 PM observation from the row.
  const fallBackAfternoon = Date.parse('2026-11-01T21:00:00Z'); // 3 PM CST
  const rows = patternRows(
    [observedDay('2026-11-01', { 15: 19_130 }, 25)],
    [],
    BULL_SHOALS,
    100,
    fallBackAfternoon
  );
  const today = rows.find((r) => r.today)!;
  assert.equal(today.splitIndex, 16, 'the marker sits after 16 REAL hours');
  assert.equal(today.cells[15].kind, 'observed', 'the 2-3 PM CST reading stays on the row');
  // 16 observed slots plus the 9 wall-clock hour-endings still ahead: the row
  // holds all 25 hours of the day.
  assert.equal(today.cells.length, 25);
});

test('today’s split survives the spring-forward day without inventing a gap', () => {
  // 2026-03-08 is 23 real hours long. At 3 PM CDT the wall clock reads 15 but
  // only FOURTEEN real hours have completed since startUtc (06:00Z, midnight
  // CST). Cutting at the wall clock reached one slot past the completed hours
  // and drew the still-filling hour as a missing observation — an invented
  // outage on a healthy day.
  const springForwardAfternoon = Date.parse('2026-03-08T20:00:00Z'); // 3 PM CDT
  const rows = patternRows(
    [observedDay('2026-03-08', { 13: 19_130 }, 23, '2026-03-08T06:00:00.000Z')],
    [],
    BULL_SHOALS,
    100,
    springForwardAfternoon
  );
  const today = rows.find((r) => r.today)!;
  assert.equal(today.splitIndex, 14, 'the marker sits after 14 REAL hours');
  assert.equal(today.cells[13].kind, 'observed', 'the last completed hour is measured, not a gap');
  // 14 observed slots plus the 9 wall-clock hour-endings still ahead: 23
  // cells, the day's own length.
  assert.equal(today.cells.length, 23);
});

// ── The day's peak: the river number first ─────────────────────────────────

/** A day whose hours carry cfs estimates and ramp flags, for the peak tests. */
function scheduledDay(
  hours: Array<{ hourEnding: number; megawatts: number; cfs?: number | null; isRamp?: boolean }>
) {
  const byHour = new Map(hours.map((h) => [h.hourEnding, h]));
  return {
    scheduleDate: '2026-07-28',
    hours: Array.from({ length: 24 }, (_, i) => {
      const hour = byHour.get(i + 1);
      return {
        hourEnding: i + 1,
        megawatts: hour?.megawatts ?? 0,
        cfs: hour?.cfs ?? null,
        isRamp: hour?.isRamp ?? false,
      };
    }),
  };
}

test('the peak leads with the river number and names when it runs', () => {
  // "peaks at 335 MW · 86% of capacity" asked somebody planning a float to
  // convert a power figure before it meant anything. The cfs estimate is
  // within ~10% at steady state, which is well inside what "is this going to
  // be a big evening" needs.
  const evening = scheduledDay([
    { hourEnding: 16, megawatts: 200, cfs: 13_500, isRamp: true },
    { hourEnding: 17, megawatts: 335, cfs: 22_600 },
    { hourEnding: 18, megawatts: 335, cfs: 22_600 },
    { hourEnding: 19, megawatts: 335, cfs: 22_600 },
    { hourEnding: 20, megawatts: 335, cfs: 22_600 },
  ]);
  const peak = schedulePeak(evening, BULL_SHOALS)!;

  assert.equal(peak.megawatts, 335);
  assert.equal(schedulePeakLabel(peak), 'Peak release ~22,600 cfs');
  assert.equal(schedulePeakWindowLabel(peak), '4 PM – 8 PM');
  // The megawatts survive, one step down, for anyone checking Eddy against
  // SWPA's own posted table.
  assert.equal(schedulePeakTechnical(peak), '335 MW · 86% of scheduling capacity');
});

test('a peak reachable only through ramp hours refuses to estimate cfs', () => {
  // A ramp hour ran -41% to +117% against CWMS because units spin up partway
  // through an hour CWMS reports as an average — and a peak is exactly where a
  // ramp is likeliest to sit.
  const rampOnly = scheduledDay([{ hourEnding: 14, megawatts: 335, cfs: 22_600, isRamp: true }]);
  const peak = schedulePeak(rampOnly, BULL_SHOALS)!;

  assert.equal(peak.cfs, null);
  assert.equal(schedulePeakLabel(peak), 'Peak load 335 MW', 'falls back rather than printing it');
  // And the technical line does not repeat the megawatts the label just used.
  assert.equal(schedulePeakTechnical(peak), '86% of scheduling capacity');
});

test('a day that reaches its peak twice names no window rather than a wrong one', () => {
  // 6-9 AM and 5-8 PM at the same load is the commonest shape a peaking plant
  // has. Spanning both would describe a twelve-hour run that did not happen.
  const twice = scheduledDay([
    { hourEnding: 7, megawatts: 335, cfs: 22_600 },
    { hourEnding: 8, megawatts: 335, cfs: 22_600 },
    { hourEnding: 18, megawatts: 335, cfs: 22_600 },
    { hourEnding: 19, megawatts: 335, cfs: 22_600 },
  ]);
  const peak = schedulePeak(twice, BULL_SHOALS)!;

  assert.equal(schedulePeakWindowLabel(peak), null);
  assert.equal(schedulePeakLabel(peak), 'Peak release ~22,600 cfs', 'the magnitude still stands');
});

test('a wholly idle day has no peak, and no reference still has a magnitude', () => {
  assert.equal(schedulePeak(scheduledDay([]), BULL_SHOALS), null, '"0 MW" is not a peak');

  // An app older than its server draws no capacity share, but the cfs estimate
  // does not depend on the reference at all — it rides the wire per hour.
  const noRef = schedulePeak(
    scheduledDay([{ hourEnding: 18, megawatts: 335, cfs: 22_600 }]),
    undefined
  )!;
  assert.equal(noRef.fraction, null);
  assert.equal(schedulePeakLabel(noRef), 'Peak release ~22,600 cfs');
  assert.equal(schedulePeakTechnical(noRef), '335 MW');
});

test('the rack caveat scans, and still refuses to name physical units', () => {
  // "This does not identify which physical units are operating" is precise and
  // nobody read it. The claim it blocks has to survive the rewrite.
  assert.match(RACK_ESTIMATE_NOTE, /estimated/i);
  assert.match(RACK_ESTIMATE_NOTE, /turbines/i);
  assert.match(RACK_ESTIMATE_NOTE, /may differ/i);
});

test('a dam with no posted schedule shows the rest of today as not-yet, never as an outage', () => {
  // Every LRN dam is this case, permanently: SEPA markets Cumberland power and
  // publishes no hour-by-hour sheet, so `schedule` is [] on every render.
  //
  // The rest of today used to come back as `missing` — the dashed treatment
  // legended "No reading", which means "there should be a reading here and
  // there is not". Wearing it for hours that have not happened turned the
  // normal state of three dams into a permanent feed-outage display, directly
  // above a forecast card saying exactly what those hours hold.
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130, 9: 19_130 })],
    [],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );

  const today = rows.find((r) => r.today)!;
  assert.equal(today.cells.length, 24, 'the row keeps its width so the days stay aligned');
  assert.equal(today.cells[8].kind, 'observed', 'the measured half is unchanged');
  assert.equal(today.cells[0].kind, 'missing', 'an elapsed hour with no reading is still a gap');
  assert.equal(today.cells[12].kind, 'future', 'noon onward has not happened yet');
  assert.equal(today.cells[23].kind, 'future');
  assert.ok(
    today.cells.every((c) => c.kind !== 'scheduled'),
    'nothing may be drawn as scheduled when no schedule was posted'
  );

  // The flags a schedule-less row must not set — they drive the stale-schedule
  // label, which cannot be true of a schedule that does not exist.
  assert.equal(today.scheduled, false);
  assert.equal(today.scheduleStale, false);
  // But the marker stays: the boundary between observed and not-yet IS now.
  assert.equal(today.splitIndex, 12);
});

test('the spoken row separates hours Eddy missed from hours that have not happened', () => {
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130 })],
    [],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );
  const spoken = patternRowVoiceOver(rows.find((r) => r.today)!);

  // Twelve hours of today have happened; one carries a reading, eleven do not.
  assert.match(spoken, /11 hours with no observation/);
  // The other twelve have not happened, and are said as such rather than
  // counted into the sentence above — which read "23 hours with no
  // observation", a coverage complaint about the rest of the day.
  assert.match(spoken, /12 hours still to come, with no schedule published/);
  assert.doesNotMatch(spoken, /23 hours with no observation/);
});

test('a dam that does post a schedule is untouched by the not-yet treatment', () => {
  // The guard on the fix: SWPA dams must keep drawing their plan.
  const rows = patternRows(
    [observedDay('2026-07-28', { 8: 19_130 })],
    [day('2026-07-28', { 13: 391, 14: 391 })],
    BULL_SHOALS,
    100,
    NOON_CENTRAL
  );
  const today = rows.find((r) => r.today)!;
  assert.equal(today.cells[12].kind, 'scheduled');
  assert.equal(today.scheduled, true);
  assert.ok(
    today.cells.every((c) => c.kind !== 'future'),
    'a posted sheet means the rest of the day is known, not unknown'
  );
});
