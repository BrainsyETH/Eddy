import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { centralDayStart } from '@/lib/data/dam-history';
import { nextDayKey } from '@shared/dam-schedule-copy';
import type { DamScheduleDay, ScheduledHour } from '@shared/dam-types';
import {
  CONSISTENT_SPREAD_HOURS,
  DAM_READ_DAM_IDS,
  allowedHours,
  buildDamReadFacts,
  clockLabel,
  clockTimesIn,
  damReadClaimsLine,
  damReadFallback,
  damReadProblems,
  observedDays,
  patternSentence,
  postedSchedule,
  prepareDamRead,
  scheduleReliability,
  startPattern,
  type DamReadInputs,
  type ObservedHourRow,
  type ScheduleVersion,
} from './dam-read-facts';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';

const HOUR = 3_600_000;
const FLOOR = 100;

/** Rows for one Central day from a 24-char string: 1 on, 0 off, . unobserved. */
function dayRows(dayKey: string, bits: string, { on = 5_000, off = 20 } = {}): ObservedHourRow[] {
  const start = centralDayStart(dayKey);
  const rows: ObservedHourRow[] = [];
  for (let h = 0; h < bits.length; h += 1) {
    if (bits[h] === '.') continue;
    rows.push({ observedHour: new Date(start + h * HOUR).toISOString(), valueCfs: bits[h] === '1' ? on : off });
  }
  return rows;
}

/** A day that comes on at `start` (Central hour) for `length` hours. */
function bitsFor(start: number | null, length = 4): string {
  return Array.from({ length: 24 }, (_, h) => (start !== null && h >= start && h < start + length ? '1' : '0')).join('');
}

function previousDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

/** Noon Central on a day, which is 17:00 UTC under CDT. */
function noonOn(dayKey: string): number {
  return centralDayStart(dayKey) + 12 * HOUR;
}

// Saturday 2026-10-31. The 14 complete days behind it run Oct 17 (Sat) to Oct 30 (Fri).
const NOW = noonOn('2026-10-31');

function fortnight(startFor: (dayKey: string, weekend: boolean) => number | null): ObservedHourRow[] {
  const rows: ObservedHourRow[] = [];
  let day = '2026-10-17';
  for (let i = 0; i < 14; i += 1) {
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    rows.push(...dayRows(day, bitsFor(startFor(day, dow === 0 || dow === 6))));
    day = nextDayKey(day);
  }
  return rows;
}

test('the Read covers the White River tailwaters, and each is a real dam with a turbine floor', () => {
  for (const id of DAM_READ_DAM_IDS) {
    const dam = USACE_DAMS[id];
    assert.ok(dam, id);
    assert.ok(dam.swpaCode, `${id} has an SWPA schedule`);
    assert.ok(typeof dam.generationOnCfs === 'number' && dam.generationOnCfs > 0, `${id} has a generation floor`);
  }
});

test('observedDays reads the last 14 COMPLETE days and leaves today out', () => {
  const days = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  assert.equal(days.length, 14);
  assert.equal(days[0].dayKey, '2026-10-17');
  assert.equal(days.at(-1)!.dayKey, '2026-10-30');
  assert.ok(days.every((d) => d.complete && d.firstStartHour === 15 && d.generatingHours === 4));
});

test('a run carried over from the night before is not a start', () => {
  const rows = dayRows('2026-10-30', '111000000000000000000000');
  const [day] = observedDays(rows, FLOOR, { now: NOW }).slice(-1);
  assert.equal(day.firstStartHour, null);
  assert.equal(day.generatingHours, 3);
});

test('a start after an unobserved hour is not claimed, and a gappy day is not a pattern day', () => {
  const rows = dayRows('2026-10-30', '00000000000000.111000000');
  const [day] = observedDays(rows, FLOOR, { now: NOW }).slice(-1);
  assert.equal(day.firstStartHour, null);
  assert.equal(day.complete, true);

  const gappy = dayRows('2026-10-29', '0000000000............00');
  const days = observedDays(gappy, FLOOR, { now: NOW });
  assert.equal(days.find((d) => d.dayKey === '2026-10-29')!.complete, false);
});

test('minimum flow below the floor is not generation (Bull Shoals)', () => {
  const floor = USACE_DAMS['swl-bull-shoals-dam'].generationOnCfs!;
  const rows = dayRows('2026-10-30', bitsFor(15), { on: 8_000, off: 800 });
  const [day] = observedDays(rows, floor, { now: NOW }).slice(-1);
  assert.equal(day.firstStartHour, 15);
  assert.equal(day.generatingHours, 4);
});

test('the fall-back day keeps Central hours right', () => {
  // 2026-11-01 is 25 hours long. Index 16 from the day's start is 3 PM CST.
  const start = centralDayStart('2026-11-01');
  const rows: ObservedHourRow[] = [];
  for (let i = 0; i < 25; i += 1) {
    rows.push({ observedHour: new Date(start + i * HOUR).toISOString(), valueCfs: i >= 16 && i < 20 ? 5_000 : 20 });
  }
  const days = observedDays(rows, FLOOR, { now: noonOn('2026-11-03') });
  const nov1 = days.find((d) => d.dayKey === '2026-11-01')!;
  assert.equal(nov1.coverage, 25);
  assert.equal(nov1.firstStartHour, 15);
});

test('a steady weekday pattern is stated with its range, and an early outlier is carried', () => {
  const rows = fortnight((day, weekend) => (weekend ? 16 : day === '2026-10-19' ? 6 : day === '2026-10-21' ? 13 : 15));
  const days = observedDays(rows, FLOOR, { now: NOW });
  const weekday = startPattern(days, 'weekday')!;
  assert.equal(weekday.days, 10);
  assert.equal(weekday.consistent, true);
  assert.equal(weekday.typicalStartHour, 15);
  assert.equal(weekday.earliestStartHour, 6);
  assert.equal(weekday.earlyDays, 1);
  assert.equal(
    patternSentence(weekday),
    'Over the last two weeks the units at the dam have usually come on around 3 PM on weekdays, though once as early as 6 AM.',
  );

  const weekend = startPattern(days, 'weekend')!;
  assert.equal(weekend.days, 4);
  assert.equal(weekend.typicalStartHour, 16);
  assert.equal(patternSentence(weekend), 'Over the last two weeks the units at the dam have usually come on around 4 PM on weekends.');
});

test('starts spread wider than the gate are not called a pattern', () => {
  const spread = [5, 9, 13, 17, 21];
  let i = 0;
  const rows = fortnight((_day, weekend) => (weekend ? 16 : spread[i++ % spread.length]));
  const weekday = startPattern(observedDays(rows, FLOOR, { now: NOW }), 'weekday')!;
  assert.ok(weekday.rangeToHour! - weekday.rangeFromHour! > CONSISTENT_SPREAD_HOURS);
  assert.equal(weekday.consistent, false);
  assert.equal(patternSentence(weekday), 'Recent weekday start times at the dam have varied too much to call a pattern.');
});

test('a fortnight with no generation says the units stayed off', () => {
  const p = startPattern(observedDays(fortnight(() => null), FLOOR, { now: NOW }), 'weekday')!;
  assert.equal(p.daysWithoutGeneration, 10);
  assert.equal(patternSentence(p), 'On recent weekdays the units at the dam have mostly stayed off.');
});

// ── Schedule reliability ───────────────────────────────────────────────────

function hours(onFrom: number | null, length = 4, minimumFlow = false): ScheduledHour[] {
  return Array.from({ length: 24 }, (_, i) => {
    const he = i + 1;
    const on = onFrom !== null && he - 1 >= onFrom && he - 1 < onFrom + length;
    return { hourEnding: he, megawatts: on ? 50 : minimumFlow ? 3 : 0, cfs: on ? 3_000 : null, isRamp: false, minimumFlow: minimumFlow && !on ? true : undefined };
  });
}

function versionsFor(plan: (dayKey: string) => number | null): ScheduleVersion[] {
  const out: ScheduleVersion[] = [];
  let day = '2026-10-17';
  for (let i = 0; i < 14; i += 1) {
    // Posted the afternoon before, as SWPA does.
    out.push({ firstSeenAt: new Date(centralDayStart(day) - 8 * HOUR).toISOString(), days: [{ scheduleDate: day, hours: hours(plan(day)) }] });
    day = nextDayKey(day);
  }
  return out;
}

test('schedule reliability scores the plan posted before the day against what ran', () => {
  const observed = observedDays(fortnight((day) => (day === '2026-10-19' ? 6 : 15)), FLOOR, { now: NOW });
  const r = scheduleReliability(versionsFor(() => 15), observed)!;
  assert.equal(r.daysCompared, 14);
  assert.equal(r.matched, 13);
  assert.equal(r.startedEarly, 1);
  assert.equal(r.startedLate, 0);
});

test('a same-day revision is not credited to the plan', () => {
  const observed = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  const versions = versionsFor(() => 10);
  // A corrected copy appears mid-morning on each day; it must be ignored.
  for (const v of [...versions]) {
    const day = v.days[0].scheduleDate;
    versions.push({ firstSeenAt: new Date(centralDayStart(day) + 9 * HOUR).toISOString(), days: [{ scheduleDate: day, hours: hours(15) }] });
  }
  const r = scheduleReliability(versions, observed)!;
  assert.equal(r.matched, 0);
  assert.equal(r.startedLate, 14);
});

test('a sheet that lands just after midnight is the plan; one after dawn is a revision', () => {
  const observed = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  const versions: ScheduleVersion[] = [];
  let day = '2026-10-17';
  for (let i = 0; i < 14; i += 1) {
    // Fetched at 12:35 AM, as the real sheets often are, then revised at 9 AM.
    versions.push({ firstSeenAt: new Date(centralDayStart(day) + 35 * 60_000).toISOString(), days: [{ scheduleDate: day, hours: hours(15) }] });
    versions.push({ firstSeenAt: new Date(centralDayStart(day) + 9 * HOUR).toISOString(), days: [{ scheduleDate: day, hours: hours(9) }] });
    day = nextDayKey(day);
  }
  const r = scheduleReliability(versions, observed)!;
  assert.equal(r.daysCompared, 14);
  assert.equal(r.matched, 14);
});

test('reliability is withheld until enough days have been scored', () => {
  const observed = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  assert.equal(scheduleReliability(versionsFor(() => 15).slice(0, 9), observed), null);
});

test('scheduled minimum flow is not a scheduled start', () => {
  const observed = observedDays(fortnight(() => null), FLOOR, { now: NOW });
  const versions = versionsFor(() => null).map((v) => ({ ...v, days: v.days.map((d) => ({ ...d, hours: hours(null, 0, true) })) }));
  const r = scheduleReliability(versions, observed)!;
  assert.equal(r.matched, 14);
});

// ── Posted schedule ────────────────────────────────────────────────────────

function scheduleDay(scheduleDate: string, onFrom: number | null, length = 4, minimumFlow = false): DamScheduleDay {
  return { scheduleDate, hours: hours(onFrom, length, minimumFlow), idle: [], retrievedAt: new Date(NOW - 10 * 60_000).toISOString() };
}

test('posted schedule keeps today\'s windows that have not ended, and tomorrow only when consecutive', () => {
  const schedule = [
    { ...scheduleDay('2026-10-31', 6, 3), hours: hours(6, 3).map((h) => (h.hourEnding >= 15 && h.hourEnding <= 21 ? { ...h, megawatts: 50 } : h)) },
    scheduleDay('2026-11-01', 13, 5),
  ];
  const posted = postedSchedule(schedule, NOW)!;
  assert.equal(posted.days.length, 2);
  // 6-9 AM has ended by noon; 2-9 PM has not.
  assert.deepEqual(posted.days[0].windows.map((w) => w.label), ['2 PM – 9 PM']);
  assert.deepEqual(posted.days[1].windows.map((w) => w.label), ['1 PM – 6 PM']);
  assert.equal(posted.mayBeOutdated, false);

  const gap = postedSchedule([scheduleDay('2026-10-31', 15), scheduleDay('2026-11-02', 15)], NOW)!;
  assert.equal(gap.days.length, 1);
  assert.equal(postedSchedule([scheduleDay('2026-11-01', 15)], NOW), null);
});

test('an old copy of the schedule is flagged, and minimum flow only is named', () => {
  const day = { ...scheduleDay('2026-10-31', null, 0, true), retrievedAt: new Date(NOW - 3 * HOUR).toISOString() };
  const posted = postedSchedule([day], NOW)!;
  assert.equal(posted.mayBeOutdated, true);
  assert.equal(posted.days[0].minimumFlowOnly, true);
  assert.deepEqual(posted.days[0].windows, []);
});

// ── The model's contract ───────────────────────────────────────────────────

function inputs(overrides: Partial<DamReadInputs> = {}): DamReadInputs {
  return {
    damId: 'swl-bull-shoals-dam',
    damName: 'Bull Shoals Dam',
    riverName: 'White River',
    tailwaterFishery: 'trout',
    floorCfs: FLOOR,
    schedule: [scheduleDay('2026-10-31', 14, 7), scheduleDay('2026-11-01', 15, 4)],
    observed: fortnight((day, weekend) => (weekend ? 16 : day === '2026-10-19' ? 6 : 15)),
    scheduleVersions: versionsFor(() => 15),
    waterTempF: { value: 52.4, observedAt: new Date(NOW - HOUR).toISOString(), where: 'White River at Bull Shoals Dam near Flippin' },
    dissolvedOxygenMgL: { value: 6.12, observedAt: new Date(NOW - HOUR).toISOString(), where: 'White River at Bull Shoals Dam near Flippin' },
    generatingNow: false,
    now: NOW,
    ...overrides,
  };
}

test('clock times are read from prose, including ranges, noon and midnight', () => {
  assert.deepEqual(clockTimesIn('around 3 PM, as early as 6 a.m.'), [15, 6]);
  assert.deepEqual(clockTimesIn('between 2-5 PM'), [14, 17]);
  assert.deepEqual(clockTimesIn('from 2 to 5 pm, then noon and midnight'), [14, 17, 12, 0]);
  assert.ok(Number.isNaN(clockTimesIn('at 3:30 PM')[0]));
  assert.deepEqual(clockTimesIn('on 9 of 13 days, I am here'), []);
  assert.equal(clockLabel(0), 'midnight');
  assert.equal(clockLabel(12), 'noon');
  assert.equal(clockLabel(15), '3 PM');
});

test('a Read that follows the facts is served as written', () => {
  const f = buildDamReadFacts(inputs());
  assert.ok(allowedHours(f).has(14));
  const raw = [
    damReadClaimsLine(f),
    '[SUMMARY]',
    'Generation is scheduled 2 PM – 9 PM today at Bull Shoals Dam.',
    '[EDDY_READ]',
    'Weekends lately have come on around 4 PM at the dam, a little later than weekdays.',
    '[FULL]',
    'The posted schedule has the units on from 2 PM to 9 PM today at the dam. On weekdays they usually come on around 3 PM, once as early as 6 AM. The water below read 52°F with 6.1 mg/L dissolved oxygen. Water downstream rises later.',
  ].join('\n');
  const out = prepareDamRead(raw, f);
  assert.deepEqual(out.problems, []);
  assert.equal(out.usedFallback, false);
});

test('an invented time, a promise, or a missing "at the dam" sends the Read to the fallback', () => {
  const f = buildDamReadFacts(inputs());
  const write = (full: string) => [damReadClaimsLine(f), '[SUMMARY]', 'Scheduled from 2 PM today at the dam.', '[EDDY_READ]', 'Weekends run later.', '[FULL]', full].join('\n');

  assert.match(prepareDamRead(write('Units at the dam come on at 11 AM.'), f).problems.join(), /11 AM is not in the facts/);
  assert.match(prepareDamRead(write('The units will start at 2 PM at the dam.'), f).problems.join(), /promise/);
  assert.match(prepareDamRead(write('Units come on at 2 PM.'), f).problems.join(), /at the dam/);
  assert.match(prepareDamRead(write('At the dam it read 60°F.'), f).problems.join(), /temperature/);
  assert.equal(prepareDamRead(write('At the dam, 2 PM.').replace('[CLAIMS] dam=Bull', '[CLAIMS] dam=Bul'), f).usedFallback, true);
});

test('the fallback passes its own checks in every shape the facts take', () => {
  const shapes: Partial<DamReadInputs>[] = [
    {},
    { schedule: [] },
    { schedule: [], observed: [] },
    { observed: fortnight(() => null), schedule: [scheduleDay('2026-10-31', null, 0, true)] },
    { waterTempF: null, dissolvedOxygenMgL: null, scheduleVersions: [] },
    { now: noonOn('2026-10-30'), schedule: [scheduleDay('2026-10-30', 15)] },
  ];
  for (const shape of shapes) {
    const f = buildDamReadFacts(inputs(shape));
    const fallback = damReadFallback(f);
    assert.deepEqual(damReadProblems(fallback, f), [], JSON.stringify(shape).slice(0, 80));
    assert.ok(fallback.summaryText && fallback.quoteText);
  }
});

test('the fallback leads with the posted plan and the day-type that today is', () => {
  const f = buildDamReadFacts(inputs());
  const fallback = damReadFallback(f);
  assert.equal(fallback.summaryText, 'Generation is scheduled 2 PM – 9 PM today at the dam.');
  // Saturday: the weekend pattern leads.
  assert.match(fallback.eddyRead!, /on weekends/);
  assert.match(fallback.quoteText, /within an hour on 13 of 14 days, and the units came on early on 1\./);
  assert.match(fallback.quoteText, /52°F water and 6\.1 mg\/L dissolved oxygen/);
  assert.match(fallback.quoteText, /All times are at the dam/);
});

test('stale water-quality readings are left out', () => {
  const f = buildDamReadFacts(inputs({ waterTempF: { value: 50, observedAt: new Date(NOW - 30 * HOUR).toISOString(), where: 'x' } }));
  assert.equal(f.waterTempF, null);
});

// ── Backtest on real history ───────────────────────────────────────────────
//
// What the pattern would have said on each day of Aug-Oct 2026, scored against
// what the units then did. This is the regression guard the feature rests on:
// a change that makes the stated pattern less often right fails here.

const fixture = JSON.parse(readFileSync('src/lib/eddy/__fixtures__/dam-generation-onoff-2026.json', 'utf8')) as {
  year: number;
  dams: Record<string, string[]>;
};

function fixtureRows(damId: string): { rows: ObservedHourRow[]; days: string[] } {
  const rows: ObservedHourRow[] = [];
  const days: string[] = [];
  for (const line of fixture.dams[damId]) {
    const [md, bits] = line.split(' ');
    const dayKey = `${fixture.year}-${md}`;
    days.push(dayKey);
    rows.push(...dayRows(dayKey, bits));
  }
  return { rows, days };
}

function backtest(damId: string) {
  const { rows, days } = fixtureRows(damId);
  const actualByDay = new Map(observedDays(rows, FLOOR, { days: days.length, now: noonOn(nextDayKey(days.at(-1)!)) }).map((d) => [d.dayKey, d]));
  let stated = 0;
  let within = 0;
  let early = 0;
  let unstated = 0;
  for (const day of days.slice(14)) {
    const actual = actualByDay.get(day)!;
    if (actual.firstStartHour === null) continue;
    const window = observedDays(rows, FLOOR, { now: noonOn(day) });
    const pattern = startPattern(window, actual.weekend ? 'weekend' : 'weekday');
    if (!pattern?.consistent || pattern.rangeFromHour === null || pattern.rangeToHour === null) {
      unstated += 1;
      continue;
    }
    stated += 1;
    // "Usually between X and Y": right when the start lands in the stated range, give or take an hour.
    if (actual.firstStartHour >= pattern.rangeFromHour - 1 && actual.firstStartHour <= pattern.rangeToHour + 1) within += 1;
    else if (actual.firstStartHour < pattern.rangeFromHour - 1) early += 1;
    // Sanity: yesterday is the last day the window reads.
    assert.equal(window.at(-1)!.dayKey, previousDay(day));
  }
  return { stated, within, early, unstated, hitRate: within / stated, earlyRate: early / stated };
}

test('backtest: the stated pattern holds on most days at each tailwater', () => {
  // Measured on this fixture when the rules were written (days with a start,
  // after the first 14):
  //
  //   Table Rock   stated 55, unstated 16; within range ±1h 80%, earlier 4%
  //   Norfork      stated 61, unstated  3; within range ±1h 82%, earlier 5%
  //   Bull Shoals  stated 36, unstated 34; within range ±1h 67%, earlier 14%
  //
  // Bull Shoals is the honest outlier: its starts move enough that the gate
  // withholds the pattern on half of days, and when stated it is still right
  // only two times in three. That is why the Read always carries the earliest
  // recent start. Floors sit a few points under the measurement, so a real
  // regression fails while a tie does not.
  const floors: Record<string, { hit: number; maxEarly: number; minStated: number }> = {
    'swl-table-rock-dam': { hit: 0.75, maxEarly: 0.08, minStated: 50 },
    'swl-norfork-dam': { hit: 0.77, maxEarly: 0.1, minStated: 55 },
    'swl-bull-shoals-dam': { hit: 0.6, maxEarly: 0.18, minStated: 30 },
  };
  for (const [damId, floor] of Object.entries(floors)) {
    const r = backtest(damId);
    assert.ok(r.stated >= floor.minStated, `${damId}: stated on ${r.stated} days`);
    assert.ok(r.hitRate >= floor.hit, `${damId}: hit ${r.hitRate.toFixed(2)}`);
    assert.ok(r.earlyRate <= floor.maxEarly, `${damId}: early ${r.earlyRate.toFixed(2)}`);
  }
});
