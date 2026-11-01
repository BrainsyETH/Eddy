import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { centralDayStart } from '@/lib/data/dam-history';
import { nextDayKey } from '@shared/dam-schedule-copy';
import type { DamScheduleDay, ScheduledHour } from '@shared/dam-types';
import {
  CONSISTENT_SPREAD_HOURS,
  DAM_READ_DAM_IDS,
  buildDamReadFacts,
  clockLabel,
  damProseFallback,
  damProseProblems,
  damReadFactsPrompt,
  damReadHeadline,
  damReadRows,
  observedDays,
  postedSchedule,
  prepareDamProse,
  recentShape,
  scheduleReliability,
  startPattern,
  withCurrentSchedule,
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

/** Noon Central on a day. */
function noonOn(dayKey: string): number {
  return centralDayStart(dayKey) + 12 * HOUR;
}

// Saturday 2026-10-31. The 14 complete days behind it run Oct 17 (Sat) to Oct 30 (Fri).
const NOW = noonOn('2026-10-31');

function fortnight(startFor: (dayKey: string, weekend: boolean) => number | null, length = 4): ObservedHourRow[] {
  const rows: ObservedHourRow[] = [];
  let day = '2026-10-17';
  for (let i = 0; i < 14; i += 1) {
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    rows.push(...dayRows(day, bitsFor(startFor(day, dow === 0 || dow === 6), length)));
    day = nextDayKey(day);
  }
  return rows;
}

const row = (rows: ReturnType<typeof damReadRows>, key: string) => rows.find((r) => r.key === key);

test('the Read covers the White River tailwaters, and each is a real dam with a turbine floor', () => {
  for (const id of DAM_READ_DAM_IDS) {
    const dam = USACE_DAMS[id];
    assert.ok(dam, id);
    assert.ok(dam.swpaCode, `${id} has an SWPA schedule`);
    assert.ok(typeof dam.generationOnCfs === 'number' && dam.generationOnCfs > 0, `${id} has a generation floor`);
  }
});

// ── Observed days ──────────────────────────────────────────────────────────

test('observedDays reads the last 14 COMPLETE days and leaves today out', () => {
  const days = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  assert.equal(days.length, 14);
  assert.equal(days[0].dayKey, '2026-10-17');
  assert.equal(days.at(-1)!.dayKey, '2026-10-30');
  for (const d of days) {
    assert.equal(d.firstStartHour, 15);
    assert.equal(d.startUnknown, false);
    assert.equal(d.firstRunHours, 4);
    assert.equal(d.endHour, 19);
    assert.equal(d.morningOff, true);
    assert.equal(d.peakCfs, 5_000);
  }
});

test('a run carried over from the night before is not a start, and one still going at midnight has no end', () => {
  const [carried] = observedDays(dayRows('2026-10-30', '111000000000000000000000'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(carried.firstStartHour, null);
  assert.equal(carried.startUnknown, false);
  assert.equal(carried.morningOff, false);
  const [late] = observedDays(dayRows('2026-10-30', '000000000000000000000111'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(late.firstStartHour, 21);
  assert.equal(late.endHour, null);
});

test('a gap before a start makes the first start UNKNOWN, not the later restart (review case)', () => {
  // A morning run whose start falls in missing hours, then a 3 PM run.
  const [day] = observedDays(dayRows('2026-10-30', '00000..11000000111100000'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(day.complete, true, '22 of 24 hours stored');
  assert.equal(day.startUnknown, true);
  assert.equal(day.firstStartHour, null, 'not 3 PM');
  assert.equal(day.morningOff, false, 'the observed morning run still counts against "off before noon"');
});

test('a gap anywhere on a day with no start leaves the start unknown; a gap after a start does not', () => {
  const [quiet] = observedDays(dayRows('2026-10-30', '00000000000000.000000000'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(quiet.startUnknown, true);
  const [after] = observedDays(dayRows('2026-10-30', '000000000000000111100.00'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(after.firstStartHour, 15);
  assert.equal(after.startUnknown, false);
  assert.equal(after.endHour, null, 'not fully observed');
  assert.equal(after.firstRunHours, null);
});

test('days with an unknown start drop out of the pattern and the schedule scoring', () => {
  const rows = fortnight(() => 15).filter((r) => {
    // Hide 5-6 AM on Oct 20 and Oct 21, around a morning run nobody saw start.
    const ms = Date.parse(r.observedHour);
    return ![centralDayStart('2026-10-20'), centralDayStart('2026-10-21')].some((s) => ms === s + 5 * HOUR || ms === s + 6 * HOUR);
  });
  const days = observedDays(rows, FLOOR, { now: NOW });
  const weekday = startPattern(days, 'weekday')!;
  assert.equal(weekday.days, 8, 'two weekdays dropped');
  const versions = versionsFor(() => 15);
  assert.equal(scheduleReliability(versions, days)!.daysCompared, 12);
});

test('minimum flow below the floor is not generation (Bull Shoals)', () => {
  const floor = USACE_DAMS['swl-bull-shoals-dam'].generationOnCfs!;
  const [day] = observedDays(dayRows('2026-10-30', bitsFor(15), { on: 8_000, off: 800 }), floor, { now: NOW }).slice(-1);
  assert.equal(day.firstStartHour, 15);
  assert.equal(day.generatingHours, 4);
});

test('the fall-back day keeps Central hours right', () => {
  const start = centralDayStart('2026-11-01');
  const rows: ObservedHourRow[] = [];
  for (let i = 0; i < 25; i += 1) {
    rows.push({ observedHour: new Date(start + i * HOUR).toISOString(), valueCfs: i >= 16 && i < 20 ? 5_000 : 20 });
  }
  const nov1 = observedDays(rows, FLOOR, { now: noonOn('2026-11-03') }).find((d) => d.dayKey === '2026-11-01')!;
  assert.equal(nov1.coverage, 25);
  assert.equal(nov1.fullyObserved, true);
  assert.equal(nov1.firstStartHour, 15);
  assert.equal(nov1.endHour, 19);
});

// ── Patterns and shape ─────────────────────────────────────────────────────

test('a steady weekday pattern with an early outlier', () => {
  const rows = fortnight((day, weekend) => (weekend ? 16 : day === '2026-10-19' ? 6 : day === '2026-10-21' ? 13 : 15));
  const days = observedDays(rows, FLOOR, { now: NOW });
  const weekday = startPattern(days, 'weekday')!;
  assert.equal(weekday.days, 10);
  assert.equal(weekday.consistent, true);
  assert.equal(weekday.typicalStartHour, 15);
  assert.equal(weekday.earlyDays, 1);
  assert.deepEqual(recentShape(days).earliest, { hour: 6, dayKey: '2026-10-19' });
});

test('a start exactly CONSISTENT_SPREAD_HOURS early counts as early (review case)', () => {
  const rows = fortnight((day) => (day === '2026-10-20' ? 15 - CONSISTENT_SPREAD_HOURS : 15));
  assert.equal(startPattern(observedDays(rows, FLOOR, { now: NOW }), 'weekday')!.earlyDays, 1);
});

test('starts spread wider than the gate are not called a pattern, and the earliest is still a row (review case)', () => {
  const spread = [5, 9, 13, 17, 21];
  let i = 0;
  const f = buildDamReadFacts(inputs({ observed: fortnight((_day, weekend) => (weekend ? 16 : spread[i++ % spread.length])) }));
  assert.equal(f.weekday!.consistent, false);
  const rows = damReadRows(f);
  assert.equal(row(rows, 'start-weekdays')!.value, 'No consistent pattern');
  assert.equal(row(rows, 'earliest')!.value, '5 AM');
});

test('a fortnight with no generation reads "Mostly off" and has no earliest row', () => {
  const rows = damReadRows(buildDamReadFacts(inputs({ observed: fortnight(() => null) })));
  assert.equal(row(rows, 'start-weekdays')!.value, 'Mostly off');
  assert.equal(row(rows, 'earliest'), undefined);
});

// ── Schedule reliability ───────────────────────────────────────────────────

function hours(onFrom: number | null, length = 4, minimumFlow = false): ScheduledHour[] {
  return Array.from({ length: 24 }, (_, i) => {
    const on = onFrom !== null && i >= onFrom && i < onFrom + length;
    return { hourEnding: i + 1, megawatts: on ? 50 : minimumFlow ? 3 : 0, cfs: on ? 3_000 : null, isRamp: false, minimumFlow: minimumFlow && !on ? true : undefined };
  });
}

function versionsFor(plan: (dayKey: string) => number | null): ScheduleVersion[] {
  const out: ScheduleVersion[] = [];
  let day = '2026-10-17';
  for (let i = 0; i < 14; i += 1) {
    out.push({ firstSeenAt: new Date(centralDayStart(day) - 8 * HOUR).toISOString(), days: [{ scheduleDate: day, hours: hours(plan(day)) }] });
    day = nextDayKey(day);
  }
  return out;
}

test('schedule reliability scores the morning plan against what ran, naming the early days', () => {
  const observed = observedDays(fortnight((day) => (day === '2026-10-19' ? 6 : 15)), FLOOR, { now: NOW });
  const r = scheduleReliability(versionsFor(() => 15), observed)!;
  assert.equal(r.daysCompared, 14);
  assert.equal(r.matched, 13);
  assert.deepEqual(r.startedEarlyDays, ['2026-10-19']);
});

test('a sheet that lands just after midnight is the plan; one after dawn is a revision', () => {
  const observed = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  const versions: ScheduleVersion[] = [];
  let day = '2026-10-17';
  for (let i = 0; i < 14; i += 1) {
    versions.push({ firstSeenAt: new Date(centralDayStart(day) + 35 * 60_000).toISOString(), days: [{ scheduleDate: day, hours: hours(15) }] });
    versions.push({ firstSeenAt: new Date(centralDayStart(day) + 9 * HOUR).toISOString(), days: [{ scheduleDate: day, hours: hours(9) }] });
    day = nextDayKey(day);
  }
  assert.equal(scheduleReliability(versions, observed)!.matched, 14);
});

test('generation with nothing posted is named; too few scored days withholds reliability', () => {
  const observed = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  const r = scheduleReliability(versionsFor((day) => (day === '2026-10-22' ? null : 15)), observed)!;
  assert.deepEqual(r.ranUnpostedDays, ['2026-10-22']);
  assert.equal(scheduleReliability(versionsFor(() => 15).slice(0, 9), observed), null);
});

test('scheduled minimum flow is not a scheduled start', () => {
  const observed = observedDays(fortnight(() => null), FLOOR, { now: NOW });
  const versions = versionsFor(() => null).map((v) => ({ ...v, days: v.days.map((d) => ({ ...d, hours: hours(null, 0, true) })) }));
  assert.equal(scheduleReliability(versions, observed)!.matched, 14);
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
  assert.deepEqual(posted.days[0].windows.map((w) => w.label), ['2 PM – 9 PM']);
  assert.equal(posted.days[0].firstStartHour, 6, 'the whole day\'s first start, for the comparison row');
  assert.deepEqual(posted.days[1].windows.map((w) => w.label), ['1 PM – 6 PM']);
  assert.equal(postedSchedule([scheduleDay('2026-10-31', 15), scheduleDay('2026-11-02', 15)], NOW)!.days.length, 1);
  assert.equal(postedSchedule([scheduleDay('2026-11-01', 15)], NOW), null);
});

// ── Rows ───────────────────────────────────────────────────────────────────

function inputs(overrides: Partial<DamReadInputs> = {}): DamReadInputs {
  return {
    damId: 'swl-bull-shoals-dam',
    damName: 'Bull Shoals Dam',
    riverName: 'White River',
    tailwaterFishery: 'trout',
    floorCfs: FLOOR,
    reference: { units: 8, fullGenerationCfs: 26_400 },
    schedule: [scheduleDay('2026-10-31', 14, 7), scheduleDay('2026-11-01', 15, 4)],
    observed: fortnight((day, weekend) => (weekend ? 16 : day === '2026-10-19' ? 6 : 15)),
    scheduleVersions: versionsFor(() => 15),
    waterTempF: { value: 52.4, observedAt: new Date(NOW - HOUR).toISOString(), where: 'Corps tailwater sensor' },
    dissolvedOxygenMgL: { value: 6.12, observedAt: new Date(NOW - HOUR).toISOString(), where: 'White River at Bull Shoals Dam near Flippin' },
    now: NOW,
    ...overrides,
  };
}

test('every fact is a row rendered by code', () => {
  const rows = damReadRows(buildDamReadFacts(inputs()));
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  assert.deepEqual(values, {
    'posted-today': '2 PM – 9 PM',
    'posted-tomorrow': '3 PM – 7 PM',
    'today-vs-usual': 'Earlier start than recent weekends',
    'start-weekdays': 'Around 3 PM',
    'start-weekends': 'Around 4 PM',
    earliest: '6 AM',
    mornings: 'Off before noon on 13 of 14 days',
    run: 'About 4 hours',
    release: 'About 2 of 8 units',
    'schedule-held': 'First start within an hour on 13 of 14 days',
    'water-temp': '52°F',
    oxygen: '6.1 mg/L',
  });
  assert.equal(row(rows, 'earliest')!.detail, 'Mon, Oct 19');
  assert.equal(row(rows, 'run')!.detail, 'Usually off by 7 PM');
  assert.equal(row(rows, 'release')!.detail, 'About 5,000 cfs · estimated from flow');
  assert.equal(row(rows, 'schedule-held')!.detail, 'Came on earlier than posted: Mon, Oct 19');
});

test('each water reading keeps its own station (review case)', () => {
  const rows = damReadRows(buildDamReadFacts(inputs()));
  assert.equal(row(rows, 'water-temp')!.detail, 'Corps tailwater sensor, as of 11 AM');
  assert.equal(row(rows, 'oxygen')!.detail, 'White River at Bull Shoals Dam near Flippin, as of 11 AM');
  const stale = buildDamReadFacts(inputs({ waterTempF: { value: 50, observedAt: new Date(NOW - 30 * HOUR).toISOString(), where: 'x' } }));
  assert.equal(row(damReadRows(stale), 'water-temp'), undefined);
});

test('the posted rows and headline follow the CURRENT schedule when served', () => {
  const written = buildDamReadFacts(inputs());
  assert.equal(damReadHeadline(written), 'Generation scheduled 2 PM – 9 PM today at the dam.');
  // Served at 10 PM: the 2-9 PM window has ended.
  const late = centralDayStart('2026-10-31') + 22 * HOUR;
  const served = withCurrentSchedule(written, inputs().schedule, late);
  assert.equal(row(damReadRows(served), 'posted-today')!.value, 'Done for the day');
  assert.equal(damReadHeadline(served), 'Today\'s scheduled generation at the dam is done.');
});

test('without a posted schedule the headline leans on the pattern and says so', () => {
  const f = buildDamReadFacts(inputs({ schedule: [] }));
  assert.equal(row(damReadRows(f), 'posted-today')!.value, 'Not posted yet');
  assert.equal(damReadHeadline(f), 'No schedule posted yet. Recent weekends have usually started around 4 PM at the dam.');
});

test('a release with no reference pair is stated in cfs', () => {
  const rows = damReadRows(buildDamReadFacts(inputs({ reference: null })));
  assert.equal(row(rows, 'release')!.value, 'About 5,000 cfs');
});

// ── Prose: the model's part ────────────────────────────────────────────────

test('prose that restates or invents facts is rejected (review cases)', () => {
  const cases: Array<[string, RegExp]> = [
    ['No generation is scheduled for the rest of today at the dam.', /today|schedule/],
    ['Generation is planned from 6 AM to 9 PM at the dam lately.', /number|clock|schedule/],
    ['The schedule held on fourteen of fourteen days lately.', /number|schedule/],
    ['The units are generating right now at the dam.', /live state/],
    ['Lately the units will start in the afternoon.', /promise/],
    ['The water has been cold with good oxygen lately.', /measurement/],
    ['Afternoon runs lately, mornings quiet, by noon it is off.', /clock/],
  ];
  for (const [prose, reason] of cases) {
    const problems = damProseProblems(prose);
    assert.ok(problems.some((p) => reason.test(p)), `${prose} -> ${problems.join('; ')}`);
  }
});

test('interpretation without facts in it is served as written', () => {
  const f = buildDamReadFacts(inputs());
  const raw = '[READ]\nAfternoon runs have been the rule lately, with mornings mostly quiet. Weekends have tended to start a little later than weekdays, and now and then the units have come on well before the usual time.';
  const out = prepareDamProse(raw, f);
  assert.deepEqual(out.problems, []);
  assert.equal(out.usedFallback, false);
  assert.equal(prepareDamProse('Afternoon runs lately.', f).usedFallback, true, 'missing marker');
});

test('the fallback interpretation passes its own checks in every shape the facts take', () => {
  let i = 0;
  const spread = [5, 9, 13, 17, 21];
  const shapes: Partial<DamReadInputs>[] = [
    {},
    { schedule: [] },
    { schedule: [], observed: [] },
    { observed: fortnight(() => null), schedule: [scheduleDay('2026-10-31', null, 0, true)] },
    { observed: fortnight(() => (spread[i++ % spread.length])) },
    { observed: fortnight(() => 6, 14) },
    { waterTempF: null, dissolvedOxygenMgL: null, scheduleVersions: [], reference: null },
    { now: noonOn('2026-10-30'), schedule: [scheduleDay('2026-10-30', 15)] },
  ];
  for (const shape of shapes) {
    const f = buildDamReadFacts(inputs(shape));
    const prose = damProseFallback(f);
    assert.deepEqual(damProseProblems(prose), [], `${prose} (${Object.keys(shape).join(',')})`);
  }
});

test('the fallback names the early-start risk and the weekend difference', () => {
  const prose = damProseFallback(buildDamReadFacts(inputs()));
  assert.match(prose, /Afternoon runs have been the rule on recent weekends/);
  assert.match(prose, /well before the usual time/);
});

test('the prompt carries the rows and no live state', () => {
  const prompt = damReadFactsPrompt(buildDamReadFacts(inputs()));
  assert.match(prompt, /Posted today: 2 PM – 9 PM/);
  assert.doesNotMatch(prompt, /right now|currently|generating now/i);
  assert.equal(clockLabel(0), 'midnight');
  assert.equal(clockLabel(12), 'noon');
});

// ── Backtest on real history ───────────────────────────────────────────────
//
// What the pattern would have said on each day of Aug-Oct 2026, scored against
// what the units then did. A change that makes the stated pattern less often
// right fails here.

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
    if (actual.firstStartHour >= pattern.rangeFromHour - 1 && actual.firstStartHour <= pattern.rangeToHour + 1) within += 1;
    else if (actual.firstStartHour < pattern.rangeFromHour - 1) early += 1;
    assert.equal(window.at(-1)!.dayKey, previousDay(day));
  }
  return { stated, within, early, unstated, hitRate: within / stated, earlyRate: early / stated };
}

test('backtest: the stated pattern holds on most days at each tailwater', () => {
  // Measured on this fixture when the rules were written (days with a known
  // start, after the first 14):
  //
  //   Table Rock   stated 55, unstated 16; within range ±1h 80%, earlier 4%
  //   Norfork      stated 60, unstated  3; within range ±1h 82%, earlier 5%
  //   Bull Shoals  stated 36, unstated 34; within range ±1h 67%, earlier 14%
  //
  // Bull Shoals is the honest outlier: its starts move enough that the gate
  // withholds the pattern on half of days, and when stated it is still right
  // only two times in three. That is why the earliest recent start is a row of
  // its own. Floors sit a few points under the measurement.
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
