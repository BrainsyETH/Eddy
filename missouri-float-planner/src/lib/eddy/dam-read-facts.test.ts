import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { centralDayStart } from '@/lib/data/dam-history';
import { nextDayKey } from '@shared/dam-schedule-copy';
import type { DamReadRow, DamScheduleDay, ScheduledHour } from '@shared/dam-types';
import {
  CONSISTENT_SPREAD_HOURS,
  DAM_READ_DAM_IDS,
  advancePosted,
  buildDamReadFacts,
  clockLabel,
  damReadDetailRows,
  damReadHeadline,
  damReadKeyRows,
  damReadStory,
  damReadTakeaway,
  observedDays,
  postedSchedule,
  recentShape,
  renderDamRead,
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

function noonOn(dayKey: string): number {
  return centralDayStart(dayKey) + 12 * HOUR;
}

// Saturday 2026-10-31. The 14 complete days behind it run Oct 17 (Sat) to Oct 30 (Fri).
const NOW = noonOn('2026-10-31');

/** Fourteen days of rows, one bit string per day. */
function fortnightBits(bitsOn: (dayKey: string, weekend: boolean) => string): ObservedHourRow[] {
  const rows: ObservedHourRow[] = [];
  let day = '2026-10-17';
  for (let i = 0; i < 14; i += 1) {
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    rows.push(...dayRows(day, bitsOn(day, dow === 0 || dow === 6)));
    day = nextDayKey(day);
  }
  return rows;
}

function fortnight(startFor: (dayKey: string, weekend: boolean) => number | null, length = 4): ObservedHourRow[] {
  return fortnightBits((day, weekend) => bitsFor(startFor(day, weekend), length));
}

const row = (rows: DamReadRow[], key: string) => rows.find((r) => r.key === key);

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
    assert.equal(d.runs, 1);
    assert.equal(d.endHour, 19);
    assert.equal(d.pastMidnight, false);
    assert.equal(d.morningOff, true);
  }
});

test('a run carried over from the night before is not a start; one still going at midnight is counted as such', () => {
  const [carried] = observedDays(dayRows('2026-10-30', '111000000000000000000000'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(carried.firstStartHour, null);
  assert.equal(carried.startUnknown, false);
  const [late] = observedDays(dayRows('2026-10-30', '000000000000000000000111'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(late.firstStartHour, 21);
  assert.equal(late.pastMidnight, true);
  assert.equal(late.endHour, null);
});

test('a gap before a start makes the first start UNKNOWN, not the later restart', () => {
  const [day] = observedDays(dayRows('2026-10-30', '00000..11000000111100000'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(day.complete, true);
  assert.equal(day.startUnknown, true);
  assert.equal(day.firstStartHour, null);
  assert.equal(day.morningOff, false, 'the observed morning run still counts');
  assert.equal(day.runs, null, 'not fully observed');
});

test('a gap anywhere on a day with no start leaves it unknown; a gap after a start does not', () => {
  const [quiet] = observedDays(dayRows('2026-10-30', '00000000000000.000000000'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(quiet.startUnknown, true);
  const [after] = observedDays(dayRows('2026-10-30', '000000000000000111100.00'), FLOOR, { now: NOW }).slice(-1);
  assert.equal(after.firstStartHour, 15);
  assert.equal(after.startUnknown, false);
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
  assert.equal(nov1.firstStartHour, 15);
  assert.equal(nov1.endHour, 19);
});

test('morning coverage counts both fall-back hours and only real spring-forward hours', () => {
  const fallback = (bits: string) => observedDays(dayRows('2026-11-01', bits), FLOOR,
    { days: 1, now: noonOn('2026-11-02') })[0];
  const secondHourRan = fallback('001' + '0'.repeat(22));
  assert.equal(secondHourRan.coverage, 25);
  assert.equal(secondHourRan.generatingHours, 1);
  assert.equal(secondHourRan.morningOff, false);
  assert.equal(recentShape([secondHourRan]).morningsOff, 0);
  assert.equal(fallback('00.' + '0'.repeat(22)).morningOff, null, 'missing repeated hour cannot establish quiet');
  assert.equal(fallback('01.' + '0'.repeat(22)).morningOff, false, 'any observed morning run settles it despite a gap');
  assert.equal(fallback('0'.repeat(25)).morningOff, true);
  const spring = observedDays(dayRows('2026-03-08', '0'.repeat(23)), FLOOR,
    { days: 1, now: noonOn('2026-03-09') })[0];
  assert.equal(spring.fullyObserved, true);
  assert.equal(spring.morningOff, true, 'the nonexistent 2 AM is not a feed gap');
});

// ── Patterns and shape ─────────────────────────────────────────────────────

test('a start exactly CONSISTENT_SPREAD_HOURS early counts as early', () => {
  const rows = fortnight((day) => (day === '2026-10-20' ? 15 - CONSISTENT_SPREAD_HOURS : 15));
  assert.equal(startPattern(observedDays(rows, FLOOR, { now: NOW }), 'weekday')!.earlyDays, 1);
});

test('days with an unknown start leave the pattern and the track record', () => {
  const rows = fortnight(() => 15).filter((r) => {
    const ms = Date.parse(r.observedHour);
    return ![centralDayStart('2026-10-20'), centralDayStart('2026-10-21')].some((s) => ms === s + 5 * HOUR || ms === s + 6 * HOUR);
  });
  const days = observedDays(rows, FLOOR, { now: NOW });
  assert.equal(startPattern(days, 'weekday')!.days, 8);
  assert.equal(scheduleReliability(versionsFor(() => 15), days)!.daysCompared, 12);
});

test('runs past midnight are counted, not dropped from the end time (review case)', () => {
  // Generating into midnight on 13 days; one day stops at 5 PM.
  const shape = recentShape(observedDays(fortnightBits((day) => (day === '2026-10-20' ? bitsFor(13) : bitsFor(18, 6))), FLOOR, { now: NOW }));
  assert.equal(shape.daysPastMidnight, 13);
  const typical = row(damReadDetailRows(buildDamReadFacts(inputs({ observed: fortnightBits((day) => (day === '2026-10-20' ? bitsFor(13) : bitsFor(18, 6))) }))), 'typical-day')!;
  assert.equal(typical.detail, 'Ran past midnight on 13 of 14 days');
  assert.doesNotMatch(JSON.stringify(typical), /done by 5 PM/);
});

test('a typical day counts all of its runs, not just the first (review case)', () => {
  // A one-hour morning run, then an eleven-hour afternoon run.
  const two = '000000100000111111111110';
  const f = buildDamReadFacts(inputs({ observed: fortnightBits(() => two) }));
  assert.equal(row(damReadDetailRows(f), 'typical-day')!.value, '2 runs, about 12 hours in all');
  assert.doesNotMatch(damReadStory(f).join(' '), /short/i);
});

test('quiet days posted quiet are not counted as starting on time (review case)', () => {
  const observed = observedDays(fortnight(() => null), FLOOR, { now: NOW });
  const r = scheduleReliability(versionsFor(() => null), observed);
  assert.equal(r, null, 'nothing posted or run on any day: no track record to state');
  const mixed = scheduleReliability(versionsFor(() => 15), observedDays(fortnight(() => 15), FLOOR, { now: NOW }))!;
  assert.equal(mixed.quietDaysKept, 0);
  assert.equal(mixed.onTime, 14);
});

test('sparse generation keeps its frequency instead of becoming "the rule" (review case)', () => {
  // Starts on three of ten weekdays, all in the afternoon; weekends quiet.
  const ran = new Set(['2026-10-19', '2026-10-22', '2026-10-27']);
  const f = buildDamReadFacts(inputs({ now: noonOn('2026-10-30'), schedule: [scheduleDay('2026-10-30', 15)], observed: fortnight((day) => (ran.has(day) ? 15 : null)) }));
  const story = damReadStory(f).join(' ');
  assert.match(story, /The dam's been quiet most weekdays lately, generating on 3 of the last \d+ weekdays\. When it did run, it started in the afternoon\./);
  assert.doesNotMatch(story, /usually started/);
});

test('every-morning generation never reads as quiet mornings (review case)', () => {
  // Generation each morning; weekend starts at 6 AM.
  const f = buildDamReadFacts(inputs({ observed: fortnight((_d, weekend) => (weekend ? 6 : 7), 6) }));
  const story = damReadStory(f).join(' ');
  assert.doesNotMatch(story, /[Mm]ornings have been quiet/);
  assert.match(story, /started in the morning/);
  assert.equal(row(damReadDetailRows(f), 'mornings')!.value, '0 of the last 14 days');
});

// ── Schedule track record ──────────────────────────────────────────────────

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

test('the track record names early starts and generation with nothing posted', () => {
  const observed = observedDays(fortnight((day) => (day === '2026-10-19' ? 6 : 15)), FLOOR, { now: NOW });
  const r = scheduleReliability(versionsFor((day) => (day === '2026-10-22' ? null : 15)), observed)!;
  assert.equal(r.daysCompared, 14);
  assert.equal(r.onTime, 12);
  assert.deepEqual(r.startedEarlyDays, ['2026-10-19']);
  assert.deepEqual(r.ranUnpostedDays, ['2026-10-22']);
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
  assert.equal(scheduleReliability(versions, observed)!.onTime, 14);
});

test('too few scored days withholds the track record', () => {
  const observed = observedDays(fortnight(() => 15), FLOOR, { now: NOW });
  assert.equal(scheduleReliability(versionsFor(() => 15).slice(0, 9), observed), null);
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
  assert.equal(posted.days[0].firstStartHour, 6);
  assert.deepEqual(posted.days[1].windows.map((w) => w.label), ['1 PM – 6 PM']);
  assert.equal(postedSchedule([scheduleDay('2026-10-31', 15), scheduleDay('2026-11-02', 15)], NOW)!.days.length, 1);
  assert.equal(postedSchedule([scheduleDay('2026-11-01', 15)], NOW), null);
});

test('missing-snapshot fallback advances saved windows without losing the whole-day start or tomorrow', () => {
  const written = centralDayStart('2026-10-31') + (11 + 47 / 60) * HOUR;
  const stored = buildDamReadFacts(inputs({ now: written,
    schedule: [scheduleDay('2026-10-31', 11, 1), scheduleDay('2026-11-01', 15)] }));
  const original = JSON.stringify(stored);
  for (const now of [NOW, NOW + HOUR / 3]) {
    const served = withCurrentSchedule(stored, null, now);
    assert.equal(served.now, now);
    assert.equal(served.posted!.days[0].firstStartHour, 11);
    assert.deepEqual(served.posted!.days[0].windows, []);
    assert.deepEqual(served.posted!.days[1], stored.posted!.days[1]);
    assert.equal(renderDamRead(served).takeaway.headline, 'No more generation scheduled today');
    assert.equal(renderDamRead(served).mayBeOutdated, true);
    assert.equal(served.shape, stored.shape, 'historical analysis stays cached');
  }
  assert.equal(JSON.stringify(stored), original, 'serving does not mutate the stored facts');
  assert.equal(advancePosted(stored.posted, centralDayStart('2026-11-01')), null, 'never roll yesterday into today');
  assert.equal(advancePosted(null, NOW), null);
  const current = withCurrentSchedule(stored, [scheduleDay('2026-10-31', 16)], NOW);
  assert.equal(current.posted!.days[0].firstStartHour, 16, 'a revised snapshot replaces saved windows');
  assert.equal(renderDamRead(current).mayBeOutdated, false);
  assert.equal(withCurrentSchedule(stored, [], NOW).posted, null, 'an empty snapshot schedule does not revive the fallback');
});

// ── The Read ───────────────────────────────────────────────────────────────

function inputs(overrides: Partial<DamReadInputs> = {}): DamReadInputs {
  return {
    damId: 'swl-table-rock-dam',
    damName: 'Table Rock Dam',
    floorCfs: FLOOR,
    reference: { units: 4, fullGenerationCfs: 15_100 },
    schedule: [scheduleDay('2026-10-31', 15, 2), scheduleDay('2026-11-01', 15, 5)],
    observed: fortnight((day, weekend) => (weekend ? 15 : day === '2026-10-21' ? 11 : 15)),
    scheduleVersions: versionsFor((day) => (day === '2026-10-24' ? null : 15)),
    now: NOW,
    ...overrides,
  };
}

test('a fragmented schedule yields one short takeaway, not a list of generation windows', () => {
  const scheduled = scheduleDay('2026-10-31', null);
  scheduled.hours = scheduled.hours.map((h) => ({ ...h, megawatts: [13, 16, 18, 20].includes(h.hourEnding) ? 50 : 0 }));
  const facts = buildDamReadFacts(inputs({
    schedule: [scheduled],
    observed: fortnight((day) => day === '2026-10-17' ? 14 : 15),
    scheduleVersions: [],
  }));
  assert.deepEqual(damReadTakeaway(facts), {
    headline: 'An earlier start today',
    summary: 'Today’s posted schedule starts at noon, about 2–3 hours earlier than recent weekends.',
  });
  assert.deepEqual(renderDamRead(facts).takeaway, damReadTakeaway(facts));
});

test('compact comparisons keep weekdays and weekends apart and describe a posted plan', () => {
  const facts = buildDamReadFacts(inputs({
    observed: fortnight((_, weekend) => weekend ? 15 : 8), scheduleVersions: [],
    schedule: [scheduleDay('2026-10-31', 18)],
  }));
  assert.deepEqual(damReadTakeaway(facts), {
    headline: 'A later start today',
    summary: 'Today’s posted schedule starts at 6 PM, about 3 hours later than recent weekends.',
  });
  const normal = buildDamReadFacts(inputs({ observed: fortnight(() => 15), scheduleVersions: [] }));
  assert.equal(damReadTakeaway(normal).headline, 'A familiar start time');
});

test('a finished schedule does not announce an upcoming start or claim the water is low', () => {
  const facts = buildDamReadFacts(inputs({ schedule: [scheduleDay('2026-10-31', 6, 2)] }));
  assert.deepEqual(damReadTakeaway(facts), {
    headline: 'No more generation scheduled today',
    summary: 'Today’s posted windows have ended; tomorrow’s schedule isn’t available yet.',
  });
  const withTomorrow = withCurrentSchedule(facts, [scheduleDay('2026-10-31', 6, 2), scheduleDay('2026-11-01', 15)], NOW);
  assert.equal(damReadTakeaway(withTomorrow).summary, 'Today’s posted windows have ended; tomorrow’s schedule starts at 3 PM.');
});

test('missing, minimum-flow and zero-generation schedules stay distinct in the takeaway', () => {
  const missing = damReadTakeaway(buildDamReadFacts(inputs({ schedule: [] })));
  assert.equal(missing.headline, 'Today’s schedule isn’t posted');
  assert.match(missing.summary, /Recent weekends usually started around 3 PM; today’s timing is still unconfirmed/);
  for (const minimum of [false, true]) {
    const read = damReadTakeaway(buildDamReadFacts(inputs({ schedule: [scheduleDay('2026-10-31', null, 4, minimum)] })));
    assert.equal(read.headline, minimum ? 'Only minimum flow scheduled' : 'No generation scheduled today');
    assert.match(read.summary, /generation ran without a posted start on 1 of 14 recently tracked days/);
  }
});

test('sparse, irregular and absent history never become a usual start in compact copy', () => {
  const sparse = damReadTakeaway(buildDamReadFacts(inputs({ observed: fortnight((day) => day === '2026-10-17' ? 15 : null), scheduleVersions: [] })));
  assert.match(sparse.summary, /generation ran on 1 of the last 4 weekend days/);
  const scattered: Record<string, number> = { '2026-10-17': 2, '2026-10-18': 8, '2026-10-24': 15, '2026-10-25': 21 };
  const irregular = damReadTakeaway(buildDamReadFacts(inputs({ observed: fortnight((day) => scattered[day] ?? 15), scheduleVersions: [] })));
  assert.equal(irregular.headline, 'Start times have varied lately');
  assert.match(irregular.summary, /recent weekend starts have been too scattered/);
  const absent = damReadTakeaway(buildDamReadFacts(inputs({ observed: [] })));
  assert.match(absent.summary, /recent history is too limited/);
});

test('compact copy stays concise and qualified even with old schedules or many historical exceptions', () => {
  for (const shape of [
    {},
    { observed: fortnight(() => 6) },
    { observed: fortnight(() => null) },
    { schedule: [] },
    { schedule: [scheduleDay('2026-10-31', null)] },
    { schedule: [scheduleDay('2026-10-31', null, 4, true)] },
    { schedule: [scheduleDay('2026-10-31', 6, 2)] },
    { schedule: [{ ...scheduleDay('2026-10-31', 15), retrievedAt: new Date(NOW - 8 * HOUR).toISOString() }] },
  ]) {
    const read = renderDamRead(buildDamReadFacts(inputs(shape)));
    const { headline, summary } = read.takeaway;
    assert.ok(headline.length <= 45, headline);
    assert.ok(summary.split(/\s+/).length <= 40, summary);
    assert.equal(summary.split(/[.!?]/).filter(Boolean).length, 1, summary);
    assert.doesNotMatch(`${headline} ${summary}`, /safe|will start|water is low|on time|units/i);
  }
});

test('the Read leads with today, then surprises, then the pattern (Table Rock shape)', () => {
  const read = renderDamRead(buildDamReadFacts(inputs()));
  assert.equal(read.headline, 'Generation\'s posted for 3 PM – 5 PM today, about when recent weekends have started.');
  assert.deepEqual(read.story, [
    'Heads up on two recent surprises: generation started more than an hour before the posted time on Wed, Oct 21, and the dam generated on Sat, Oct 24 with nothing on the schedule.',
    'On recent weekends, generation has usually started in the afternoon, around 3 PM.',
    'Mornings have been quiet, with no generation before noon on 13 of the last 14 days.',
  ]);
  assert.deepEqual(read.keyRows.map((r) => [r.label, r.value]), [
    ['Posted for tomorrow', '3 PM – 8 PM'],
    ['Earliest start lately', '11 AM'],
    ['Schedule track record', 'Started on time 12 of 14 days'],
  ]);
  assert.equal(row(read.keyRows, 'track-record')!.detail, 'On time means within an hour of the posted start');
});

test('the details hold the full breakdown, with generators\' worth from the dam page\'s own phrase', () => {
  const details = damReadDetailRows(buildDamReadFacts(inputs()));
  assert.deepEqual(details.map((r) => [r.label, r.value]), [
    ['Usual weekday start', 'Around 3 PM'],
    ['Usual weekend start', 'Around 3 PM'],
    ['Quiet mornings', '13 of the last 14 days'],
    ['Typical generating day', 'One run, about 4 hours'],
    ['Typical daily peak', 'About 1 of 4 generators’ worth'],
    ['Schedule track record', 'Started early: Wed, Oct 21 · Generated with nothing posted: Sat, Oct 24'],
  ]);
  assert.equal(row(details, 'typical-day')!.detail, 'Usually done by 7 PM');
  assert.equal(row(details, 'peak')!.detail, 'About 5,000 cfs, estimated from flow');
});

test('no water readings in the Read: they are free on the dam page', () => {
  const read = renderDamRead(buildDamReadFacts(inputs()));
  assert.doesNotMatch(JSON.stringify(read), /°F|mg\/L|oxygen|temperature/i);
});

test('the posted part follows the CURRENT schedule and day when served', () => {
  const written = buildDamReadFacts(inputs());
  const late = centralDayStart('2026-10-31') + 22 * HOUR;
  assert.equal(damReadHeadline(withCurrentSchedule(written, inputs().schedule, late)), 'Today\'s posted generation is done.');
  // Served the next morning against Sunday's sheet: still framed as a weekend.
  const sunday = withCurrentSchedule(written, [scheduleDay('2026-11-01', 6, 3)], noonOn('2026-11-01') - 6 * HOUR);
  assert.match(damReadHeadline(sunday), /earlier than recent weekends/);
});

test('headline when nothing is posted yet, and when today is quieter than usual', () => {
  assert.equal(damReadHeadline(buildDamReadFacts(inputs({ schedule: [] }))), 'Today\'s schedule isn\'t posted yet. Recent weekends have usually started around 3 PM.');
  assert.equal(damReadHeadline(buildDamReadFacts(inputs({ schedule: [scheduleDay('2026-10-31', null)] }))), 'No generation is posted for the rest of today, quieter than most recent weekends.');
});

test('minimum flow only reads as quiet, and tomorrow is compared with its own kind of day', () => {
  const f = buildDamReadFacts(inputs({ schedule: [scheduleDay('2026-10-31', null, 0, true), scheduleDay('2026-11-01', 6, 2)] }));
  assert.equal(damReadHeadline(f), 'Only minimum flow is posted for the rest of today, quieter than most recent weekends.');
  const tomorrow = row(damReadKeyRows(f), 'tomorrow')!;
  assert.equal(tomorrow.value, '6 AM – 8 AM');
  assert.equal(tomorrow.detail, 'Earlier than recent weekends');
  // Monday's sheet is compared with weekdays.
  const g = buildDamReadFacts(inputs({ now: noonOn('2026-11-01'), schedule: [scheduleDay('2026-11-01', 15), scheduleDay('2026-11-02', 15)] }));
  assert.equal(row(damReadKeyRows(g), 'tomorrow')!.detail, 'About when recent weekdays have started');
});

test('without a track record, an early outlier still gets a heads-up', () => {
  const f = buildDamReadFacts(inputs({ scheduleVersions: [], observed: fortnight((_d, weekend) => (weekend ? 11 : 15)) }));
  // Saturday: weekends start at 11 AM, no early weekend day; weekdays carry none either.
  assert.doesNotMatch(damReadStory(f).join(' '), /Heads up/);
  const g = buildDamReadFacts(inputs({ now: noonOn('2026-10-30'), schedule: [], scheduleVersions: [], observed: fortnight((day) => (day === '2026-10-21' ? 11 : 15)) }));
  assert.match(damReadStory(g)[0], /^Heads up: it doesn't always wait for the afternoon\. The earliest start lately was 11 AM on Wed, Oct 21\.$/);
});

// ── Eddy's voice ───────────────────────────────────────────────────────────
//
// src/lib/eddy/voice.ts: an outfitter at the counter, plain words. The dam
// page says "generation" and "generators' worth"; the Read does too. These are
// the phrasings review flagged as technical, plus the house rules every Eddy
// surface keeps (no company "we", no promises, no "always/never").

const NOT_EDDY = [
  /\bunits?\b/i,
  /\bfirst[- ]start\b/i,
  /\bcame on\b/i,
  /\baccuracy\b/i,
  /\b(?:we|our|us)\b/i,
  /\bwill (?:start|rise|run|generate|come)\b/i,
  /\b(?:always|never|guarantee)/i,
  /—/,
];

test('every rendered Read speaks in Eddy\'s voice, in every shape the facts take', () => {
  let i = 0;
  const spread = [5, 9, 13, 17, 21];
  const shapes: Partial<DamReadInputs>[] = [
    {},
    { schedule: [] },
    { schedule: [], observed: [] },
    { observed: fortnight(() => null), schedule: [scheduleDay('2026-10-31', null, 0, true)] },
    { observed: fortnight(() => spread[i++ % spread.length]) },
    { observed: fortnightBits(() => '000000100000111111111110') },
    { observed: fortnightBits(() => bitsFor(18, 6)) },
    { reference: null, scheduleVersions: [] },
    { now: noonOn('2026-10-30'), schedule: [scheduleDay('2026-10-30', 6)] },
  ];
  for (const shape of shapes) {
    const read = renderDamRead(buildDamReadFacts(inputs(shape)));
    const text = [read.headline, ...read.story, ...[...read.keyRows, ...read.detailRows].flatMap((r) => [r.label, r.value, r.detail ?? '']), read.caveat].join('\n');
    for (const pattern of NOT_EDDY) assert.doesNotMatch(text, pattern, `${pattern} in: ${text}`);
    assert.ok(read.story.length >= 1 && read.story.length <= 3, 'two or three points, never a list');
  }
});

test('clock labels match the schedule\'s', () => {
  assert.equal(clockLabel(0), 'midnight');
  assert.equal(clockLabel(12), 'noon');
  assert.equal(clockLabel(15), '3 PM');
  assert.ok(damReadKeyRows(buildDamReadFacts(inputs())).length <= 3);
});

// ── Backtest on real history ───────────────────────────────────────────────
//
// What the pattern would have said on each day of Aug-Oct 2026, scored against
// what the dam then did. A change that makes the stated pattern less often
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
  // Measured on this fixture (days with a known start, after the first 14):
  //
  //   Table Rock   stated 55, unstated 16; within range ±1h 80%, earlier 4%
  //   Norfork      stated 60, unstated  3; within range ±1h 82%, earlier 5%
  //   Bull Shoals  stated 36, unstated 34; within range ±1h 67%, earlier 14%
  //
  // Bull Shoals is the honest outlier, which is why the earliest start lately
  // is always shown and an early start leads the story. Floors sit a few
  // points under the measurement.
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


test('recent exceptions qualify generic timing with dates and counts', () => {
  const facts = buildDamReadFacts(inputs());
  assert.ok(facts.reliability);
  const reliability = { ...facts.reliability, startedEarlyDays: ['2026-10-29'], ranUnpostedDays: ['2026-10-30'] };
  const read = damReadTakeaway({ ...facts, reliability });
  assert.equal(read.headline, 'Early and unposted generation lately');
  assert.match(read.summary, /14 tracked days/);
  assert.match(read.summary, /over an hour early once/);
  assert.match(read.summary, /without a posted start once/);
  const earlyOnly = damReadTakeaway({ ...facts, reliability: { ...reliability, ranUnpostedDays: [] } });
  assert.match(earlyOnly.summary, /over an hour early on Thu, Oct 29/);
  const unpostedOnly = damReadTakeaway({ ...facts, reliability: { ...reliability, startedEarlyDays: [] } });
  assert.match(unpostedOnly.summary, /without a posted start on Fri, Oct 30/);
});

test('a single exception holds a generic headline for only three complete Central days', () => {
  const facts = buildDamReadFacts(inputs());
  assert.ok(facts.reliability);
  for (const kind of ['startedEarlyDays', 'ranUnpostedDays'] as const) {
    let held = 0;
    let day = '2026-10-31';
    for (let age = 1; age <= 14; age += 1) {
      day = previousDay(day);
      const reliability = { ...facts.reliability, startedEarlyDays: [], ranUnpostedDays: [], [kind]: [day] };
      const read = damReadTakeaway({ ...facts, reliability });
      const leads = read.headline !== 'A familiar start time';
      assert.equal(leads, age <= 3, `${kind}, age ${age}`);
      if (leads) held += 1;
    }
    assert.equal(held, 3);
  }
  // Across fall-back, the third complete day is still recent even though a
  // rolling 72-hour calculation would change its meaning as the clock moves.
  const november = withCurrentSchedule(facts, [scheduleDay('2026-11-04', 15)], noonOn('2026-11-04'));
  assert.match(damReadTakeaway({ ...november, reliability: { ...facts.reliability,
    startedEarlyDays: ['2026-11-01'], ranUnpostedDays: [] } }).summary, /Sun, Nov 1/);
});

test('earlier and later starts keep the headline when exceptions compete for attention', () => {
  const facts = buildDamReadFacts(inputs());
  assert.ok(facts.reliability);
  for (const start of [12, 18]) {
    const current = withCurrentSchedule(facts, [scheduleDay('2026-10-31', start)], NOW);
    for (const early of [['2026-10-18'], ['2026-10-29'], ['2026-10-18', '2026-10-19']]) {
      for (const unposted of [[], ['2026-10-30'], ['2026-10-20', '2026-10-21']]) {
        const read = damReadTakeaway({ ...current, reliability: { ...facts.reliability,
          startedEarlyDays: early, ranUnpostedDays: unposted } });
        assert.equal(read.headline, start === 12 ? 'An earlier start today' : 'A later start today');
        assert.ok(read.summary.split(/\s+/).length <= 40, read.summary);
        assert.equal(read.summary.split(/[.!?]/).filter(Boolean).length, 1);
        if (early.length > 1 || early[0] === '2026-10-29') assert.match(read.summary, /over an hour early/);
        else if (!unposted.length) assert.doesNotMatch(read.summary, /generation started/);
      }
    }
  }
  const repeated = { ...facts.reliability, startedEarlyDays: ['2026-10-18', '2026-10-19'], ranUnpostedDays: [] };
  assert.equal(damReadTakeaway({ ...facts, reliability: repeated }).headline, 'Generation has started early');
  assert.match(damReadTakeaway({ ...facts, reliability: repeated }).summary, /2 of 14 tracked days, most recently Mon, Oct 19/);
  const duplicates = { ...repeated, startedEarlyDays: ['2026-10-18', '2026-10-18'] };
  assert.equal(damReadTakeaway({ ...facts, reliability: duplicates }).headline, 'A familiar start time');
});
