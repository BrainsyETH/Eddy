import assert from 'node:assert/strict';
import test from 'node:test';
import { centralDayStart } from '@/lib/data/dam-history';
import type { DamScheduleDay, DamSnapshot } from '@shared/dam-types';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import { DAM_READ_DAM_IDS } from './dam-read-dams';
import {
  AT_THE_DAM_CAVEAT,
  RIVER_SUMMARY_MAX_CHARS,
  buildDamReadFacts,
  damRiverBlocks,
  withCurrentSchedule,
  type DamReadFacts,
  type ObservedHourRow,
} from './dam-read-facts';
import { damReadExpiresAt } from './dam-update-policy';
import { loadLatestEddyUpdate } from './latest-update';
import {
  TAILWATER_NOTES,
  loadTailwaterRiverRead,
  renderTailwaterRiverRead,
  tailwaterNote,
  tailwaterReadDamId,
  tailwaterReadRiverSlugs,
  withTailwaterSummaries,
} from './tailwater-river-read';

const HOUR = 3_600_000;
// Thursday 2026-11-19. The 14 complete days behind it run Nov 5 to Nov 18.
const DAY = '2026-11-19';
const at = (hour: number) => centralDayStart(DAY) + hour * HOUR;
const REFERENCE = { units: 8, fullGenerationCfs: 26_400, schedulingCapacityMw: 400 };

/** A schedule day from posted megawatts per hour ending; unlisted hours are idle. */
function day(scheduleDate: string, megawatts: Record<number, number>, retrievedAt = at(0)): DamScheduleDay {
  return {
    scheduleDate,
    idle: [],
    retrievedAt: new Date(retrievedAt).toISOString(),
    hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: megawatts[i + 1] ?? 0, cfs: null, isRamp: false })),
  };
}

function run(from: number, to: number, megawatts: number): Record<number, number> {
  return Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, megawatts]));
}

/** Fourteen days that each generate from `start` for `length` hours. */
function history(start: number, length: number): ObservedHourRow[] {
  const rows: ObservedHourRow[] = [];
  for (let d = 14; d >= 1; d -= 1) {
    const dayStart = centralDayStart(DAY) - d * 24 * HOUR;
    for (let h = 0; h < 24; h += 1) {
      rows.push({ observedHour: new Date(dayStart + h * HOUR).toISOString(), valueCfs: h >= start && h < start + length ? 5_000 : 20 });
    }
  }
  return rows;
}

function facts(schedule: DamScheduleDay[], now: number, damId = 'swl-bull-shoals-dam', damName = 'Bull Shoals Dam'): DamReadFacts {
  return buildDamReadFacts({ damId, damName, floorCfs: 100, reference: REFERENCE, schedule, observed: history(5, 6), scheduleVersions: [], now });
}

// ── Which rivers ───────────────────────────────────────────────────────────

test('the tailwater Read covers the rivers whose gauge is a Read dam\'s own release, and no other', () => {
  assert.deepEqual(tailwaterReadRiverSlugs().sort(), ['norfork-tailwater', 'taneycomo', 'white']);
  assert.equal(tailwaterReadDamId('white'), 'swl-bull-shoals-dam');
  assert.equal(tailwaterReadDamId('norfork-tailwater'), 'swl-norfork-dam');
  assert.equal(tailwaterReadDamId('taneycomo'), 'swl-table-rock-dam');
  // The Black below Clearwater is rated on a USGS gauge and keeps its river Read.
  assert.equal(tailwaterReadDamId('black'), null);
  assert.equal(tailwaterReadDamId('current'), null);

  // Every river a Read dam releases straight into has notes, so adding a dam
  // to the Read list cannot leave its river on the old fallback unnoticed.
  for (const id of DAM_READ_DAM_IDS) {
    const tailwater = USACE_DAMS[id].tailwater;
    if (!tailwater || tailwater.gaugeSiteId !== id || tailwater.sectionSlug) continue;
    assert.ok(TAILWATER_NOTES[tailwater.riverSlug], `${tailwater.riverSlug} has no tailwater notes`);
  }
  for (const slug of Object.keys(TAILWATER_NOTES)) assert.ok(tailwaterReadDamId(slug), `${slug} has notes and no dam`);
});

// ── The notes ──────────────────────────────────────────────────────────────

test('every note is short, plain, a pattern, and says nothing about wading or downstream arrival', () => {
  for (const [slug, notes] of Object.entries(TAILWATER_NOTES)) {
    for (const [state, note] of Object.entries(notes)) {
      const where = `${slug}.${state}: ${note}`;
      assert.ok(note.length <= 240, where);
      assert.ok(note.split(/[.!?](?:\s|$)/).filter(Boolean).length <= 2, where);
      assert.doesNotMatch(note, /\d/, `no numbers in Eddy's Read: ${where}`);
      assert.doesNotMatch(note, /wad(?:e|ing|eable)|safe|downstream|arriv|reach(?:es)? (?:the|you)|hours? (?:later|after)/i, where);
      assert.doesNotMatch(note, /\b(?:today|now|right now|currently|this morning|tonight)\b/i, `a pattern, not a reading: ${where}`);
      assert.doesNotMatch(note, /\b(?:units?|we|our|always|never|guarantee)\b|—/i, where);
    }
  }
  assert.equal(tailwaterNote('taneycomo', 'full'), TAILWATER_NOTES.taneycomo.full);
  assert.equal(tailwaterNote('white', 'full'), TAILWATER_NOTES.white.generating, 'near full power falls back to the generating note');
  assert.equal(tailwaterNote('white', null), null, 'no posted schedule, no state to choose by');
  assert.equal(tailwaterNote('current', 'idle'), null);
});

// ── The three blocks ───────────────────────────────────────────────────────

test('the summary names the dam and says what is posted next, with its size', () => {
  const schedule = [day(DAY, { ...run(6, 8, 100), ...run(12, 14, 200), ...run(18, 21, 380) })];
  const stored = facts(schedule, at(4));
  const served = (hour: number) => renderTailwaterRiverRead('white', withCurrentSchedule(stored, schedule, at(hour), REFERENCE));

  // The runs after it are dropped before the size when both will not fit a card.
  assert.equal(served(4).summaryText, 'At Bull Shoals Dam, generation is next posted from 5 AM to 8 AM at about a quarter of full power.');
  assert.equal(served(6.8).summaryText, 'At Bull Shoals Dam, generation is posted until 8 AM at about a quarter of full power, with 2 more runs after.');
  assert.equal(served(12.8).summaryText, 'At Bull Shoals Dam, generation is posted until 2 PM at about half power, and again from 5 PM to 9 PM.');
  assert.equal(served(15).summaryText, 'At Bull Shoals Dam, generation is next posted from 5 PM to 9 PM at close to full power.');
  assert.equal(served(22).summaryText, 'At Bull Shoals Dam, today’s posted generation is done.');
});

test('the local note follows what the posted schedule has the dam doing in the serving hour', () => {
  const schedule = [day(DAY, { ...run(6, 8, 100), ...run(18, 21, 380) })];
  const stored = facts(schedule, at(4), 'swl-table-rock-dam', 'Table Rock Dam');
  const served = (hour: number) => renderTailwaterRiverRead('taneycomo', withCurrentSchedule(stored, schedule, at(hour), REFERENCE));
  assert.equal(served(4).eddyRead, TAILWATER_NOTES.taneycomo.idle, 'before the first run');
  assert.equal(served(6).eddyRead, TAILWATER_NOTES.taneycomo.generating);
  assert.equal(served(12).eddyRead, TAILWATER_NOTES.taneycomo.idle, 'between runs');
  assert.equal(served(19).eddyRead, TAILWATER_NOTES.taneycomo.full, 'a run posted near full power');
  assert.equal(served(23).eddyRead, TAILWATER_NOTES.taneycomo.idle);
  const unposted = renderTailwaterRiverRead('taneycomo', withCurrentSchedule(stored, [], at(6), REFERENCE));
  assert.equal(unposted.eddyRead, null);
  assert.equal(unposted.summaryText, 'Table Rock Dam’s schedule for today couldn’t be verified.');
  const checked = renderTailwaterRiverRead('taneycomo', withCurrentSchedule(stored, [], at(6), REFERENCE, { checkedAt: new Date(at(5.5)).toISOString(), today: 'not_posted' }));
  assert.equal(checked.summaryText, 'At Table Rock Dam, no schedule is available for today as of 5:30 AM CT.');
  assert.equal(checked.eddyRead, null);
});

test('the full report is the recent pattern, how the schedule has held, and that times are at the dam', () => {
  const schedule = [day(DAY, run(6, 8, 100))];
  const read = renderTailwaterRiverRead('white', facts(schedule, at(4)));
  assert.equal(read.quoteText,
    `On recent weekdays generation has usually started around 5 AM, and it ran on each of the last 10. ${AT_THE_DAM_CAVEAT}`);
  const withRecord = renderTailwaterRiverRead('white', {
    ...facts(schedule, at(4)),
    reliability: { daysCompared: 14, onTime: 13, startedEarlyDays: [], startedLate: 1, ranUnpostedDays: [], otherMismatch: 0, quietDaysKept: 0 },
  });
  assert.match(withRecord.quoteText, /Generation has started within an hour of the posted time on 13 of 14 tracked days\. Times are at the dam\./);
  const early = renderTailwaterRiverRead('white', {
    ...facts(schedule, at(4)),
    reliability: { daysCompared: 14, onTime: 11, startedEarlyDays: ['2026-11-10', '2026-11-18'], startedLate: 1, ranUnpostedDays: [], otherMismatch: 0, quietDaysKept: 0 },
  });
  assert.match(early.quoteText, /Generation started over an hour early on 2 of 14 tracked days, most recently Wed, Nov 18\./);
});

test('quiet, minimum-flow and finished days each get a summary of their own', () => {
  const minimum = day(DAY, {});
  minimum.hours = minimum.hours.map((h) => ({ ...h, megawatts: 3, minimumFlow: true }));
  assert.equal(damRiverBlocks(facts([minimum], at(9))).summary, 'At Bull Shoals Dam, only minimum flow is posted today.');
  assert.equal(damRiverBlocks(facts([day(DAY, {})], at(9), 'swl-norfork-dam', 'Norfork Dam')).summary, 'At Norfork Dam, no generation is posted today.');
  assert.equal(damRiverBlocks(facts([day(DAY, {})], at(9))).state, 'idle');
  const done = [day(DAY, run(6, 8, 100)), day('2026-11-20', run(7, 9, 100))];
  assert.equal(damRiverBlocks(facts(done, at(20))).summary, 'At Bull Shoals Dam, today’s posted generation is done. Tomorrow’s starts at 6 AM.');
  const quietTomorrow = [day(DAY, run(6, 8, 100)), day('2026-11-20', {})];
  assert.equal(damRiverBlocks(facts(quietTomorrow, at(20))).summary, 'At Bull Shoals Dam, today’s posted generation is done. Tomorrow’s schedule lists no generation.');
});

test('every summary fits a card and every block keeps the dam Read\'s rules, at every hour', () => {
  const fragmented = { ...run(2, 3, 20), ...run(5, 8, 300), ...run(10, 10, 60), ...run(12, 14, 390), ...run(16, 17, 90), ...run(19, 24, 400) };
  const schedules: DamScheduleDay[][] = [
    [day(DAY, fragmented)],
    [day(DAY, fragmented), day('2026-11-20', fragmented)],
    [day(DAY, run(1, 24, 290))],
    [day(DAY, run(11, 23, 290))],
    [day(DAY, {})],
    [],
  ];
  for (const [damId, damName, slug] of [
    ['swl-bull-shoals-dam', 'Bull Shoals Dam', 'white'], ['swl-norfork-dam', 'Norfork Dam', 'norfork-tailwater'], ['swl-table-rock-dam', 'Table Rock Dam', 'taneycomo'],
    ['swl-greers-ferry-dam', 'Greers Ferry Dam', 'white'],
  ] as const) {
    for (const schedule of schedules) {
      const stored = facts(schedule, at(0.8), damId, damName);
      for (const hour of [0.8, 4, 6.8, 9, 12.8, 15, 17.5, 19.8, 23.5]) {
        const read = renderTailwaterRiverRead(slug, withCurrentSchedule(stored, schedule, at(hour), REFERENCE));
        const where = `${damName} ${hour}: ${read.summaryText}`;
        assert.ok(read.summaryText.length <= RIVER_SUMMARY_MAX_CHARS, `${read.summaryText.length} chars: ${where}`);
        assert.ok(read.summaryText.includes(damName), where);
        assert.match(read.summaryText, /\.$/, where);
        assert.match(read.quoteText, /Times are at the dam\./, where);
        const all = `${read.summaryText} ${read.eddyRead ?? ''} ${read.quoteText}`;
        assert.doesNotMatch(all, /undefined|null|NaN|\bunits?\b|\b(?:we|our)\b|will (?:start|rise|run|generate|come)|guarantee|light generation|heavy generation|—/i, where);
        // Only the standing caveat may mention wading or water downstream.
        assert.doesNotMatch(all.replace(AT_THE_DAM_CAVEAT, ''), /wad(?:e|ing)|downstream|arriv/i, where);
      }
    }
  }
});

// ── Serving ────────────────────────────────────────────────────────────────

function fakeSupabase(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const query = { select: () => query, eq: () => query, is: () => query, gt: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) };
      return query;
    },
  };
}

function damRow(stored: DamReadFacts, written: number) {
  return { facts: stored, sources_used: ['USACE turbine history', 'SWPA schedule'], generated_at: new Date(written).toISOString(), expires_at: damReadExpiresAt(written) };
}

const snapshotOf = (schedule: DamScheduleDay[]) => async () => ({ schedule, generationReference: { ...REFERENCE, source: '' } }) as unknown as DamSnapshot;

test('the Read is rendered against the current snapshot when served, not as it was stored', async () => {
  const written = at(4.8);
  const morning = [day(DAY, run(17, 21, 200))];
  const supabase = fakeSupabase({ dam_updates: damRow(facts(morning, written), written) });
  // The schedule was revised to start two hours sooner after the facts were stored.
  const revised = [day(DAY, run(15, 21, 200))];
  const read = await loadTailwaterRiverRead(supabase, 'white', { now: at(9), readSnapshot: snapshotOf(revised) });
  assert.ok(read);
  assert.equal(read.damId, 'swl-bull-shoals-dam');
  assert.equal(read.summaryText, 'At Bull Shoals Dam, generation is next posted from 2 PM to 9 PM at about half power.');
  assert.equal(read.generatedAt, new Date(written).toISOString());
  assert.deepEqual(read.sourcesUsed, ['USACE turbine history', 'SWPA schedule']);
});

test('no Read is served for another river, without stored facts, or past the dam Read\'s own limits', async () => {
  const written = at(4.8);
  const schedule = [day(DAY, run(17, 21, 200))];
  const supabase = fakeSupabase({ dam_updates: damRow(facts(schedule, written), written) });
  const readSnapshot = snapshotOf(schedule);
  assert.equal(await loadTailwaterRiverRead(supabase, 'current', { now: at(9), readSnapshot }), null);
  assert.equal(await loadTailwaterRiverRead(fakeSupabase({}), 'white', { now: at(9), readSnapshot }), null);
  // Yesterday's facts are not about today.
  assert.equal(await loadTailwaterRiverRead(supabase, 'white', { now: at(25), readSnapshot }), null);
  // Without a snapshot, facts older than three hours cannot be advanced.
  assert.equal(await loadTailwaterRiverRead(supabase, 'white', { now: at(9), readSnapshot: async () => null }), null);
  const young = await loadTailwaterRiverRead(supabase, 'white', { now: at(6), readSnapshot: async () => null });
  assert.equal(young?.summaryText, 'At Bull Shoals Dam, generation is next posted from 4 PM to 9 PM at about half power.');
});

test('the summary is public; the local note and the full report are Premium', async () => {
  const written = at(4.8);
  const schedule = [day(DAY, run(17, 21, 200))];
  const supabase = fakeSupabase({ dam_updates: damRow(facts(schedule, written), written) });
  const loadTailwater: typeof loadTailwaterRiverRead = (client, slug) => loadTailwaterRiverRead(client, slug, { now: at(9), readSnapshot: snapshotOf(schedule) });

  const open = await loadLatestEddyUpdate(supabase, 'white', { loadTailwater });
  assert.equal(open.state, 'ok');
  const publicUpdate = open.state === 'ok' ? open.update : null;
  assert.equal(publicUpdate?.summaryText, 'At Bull Shoals Dam, generation is next posted from 4 PM to 9 PM at about half power.');
  assert.equal(publicUpdate?.eddyRead, null);
  assert.equal(publicUpdate?.quoteText, null);
  assert.equal(publicUpdate?.conditionCode, 'unknown', 'a release is not a float verdict');

  const paid = await loadLatestEddyUpdate(supabase, 'white', { entitled: true, loadTailwater });
  const member = paid.state === 'ok' ? paid.update : null;
  assert.equal(member?.eddyRead, TAILWATER_NOTES.white.idle);
  assert.match(member?.quoteText ?? '', /Times are at the dam\./);

  // A reach of the river keeps its own stored Read.
  let asked = false;
  await loadLatestEddyUpdate(supabase, 'white', { sectionSlug: 'cotter', loadTailwater: async () => { asked = true; return null; } });
  assert.equal(asked, false);
});

// ── The batched summaries (Pulse and river cards) ──────────────────────────

test('batched summaries carry each active tailwater river with or without a stored row', async () => {
  const served = (summaryText: string) => ({ summaryText, eddyRead: null, quoteText: 'Q', damId: 'd', generatedAt: '2026-11-20T11:00:00Z', sourcesUsed: [] });
  const stored = {
    white: { summaryText: 'stored', conditionCode: 'unknown', gaugeHeightFt: 4.2, dischargeCfs: 3_340, readingTimestamp: '2026-11-20T12:00:00Z', snapshotId: 's1', generatedAt: '2026-11-20T10:00:00Z' },
    current: { summaryText: 'Current summary', conditionCode: 'good', gaugeHeightFt: 2.1, dischargeCfs: 800, readingTimestamp: null, snapshotId: null, generatedAt: '2026-11-20T10:00:00Z' },
  };
  const asked: string[] = [];
  const out = await withTailwaterSummaries(stored, ['white', 'taneycomo', 'norfork-tailwater', 'current'], async (slug) => {
    asked.push(slug);
    if (slug === 'norfork-tailwater') throw new Error('snapshot down');
    return served(`${slug} posted next`);
  });
  // Only tailwater-Read rivers are asked for.
  assert.deepEqual(asked.sort(), ['norfork-tailwater', 'taneycomo', 'white']);
  // A stored row keeps the reading the overlay attached; the summary is the dam's.
  assert.equal(out.white.summaryText, 'white posted next');
  assert.equal(out.white.dischargeCfs, 3_340);
  assert.equal(out.white.snapshotId, 's1');
  // No stored row (the morning pass failed): still served, unrated.
  assert.equal(out.taneycomo.summaryText, 'taneycomo posted next');
  assert.equal(out.taneycomo.conditionCode, 'unknown');
  assert.equal(out.taneycomo.dischargeCfs, null);
  // A dam with no servable Read leaves what was there, here nothing.
  assert.equal(out['norfork-tailwater'], undefined);
  assert.equal(out.current, stored.current);
  // The input is not modified.
  assert.equal(stored.white.summaryText, 'stored');
});
