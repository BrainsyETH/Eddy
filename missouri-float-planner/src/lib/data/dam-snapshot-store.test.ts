import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  carryFromPrevious,
  decideWrites,
  isFresh,
  pruneStoredSnapshots,
  readStoredSnapshot,
  readStoredSnapshots,
  saysAnything,
  withStoredFallback,
  writeStoredSnapshots,
  MAX_AGE_MS,
} from './dam-snapshot-store';
import {
  buildSnapshot,
  carryForwardMetrics,
  carryForwardSchedule,
  CARRY_FORWARD_MAX_HOURS,
  declaresNoSources,
  SCHEDULE_CARRY_MAX_HOURS,
} from './dams';
import { forecastHistoryRows } from './dam-forecast-history';
import { generationNow, generationStatusLabel } from '@shared/dam-generation';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import type { DamMetricValue, DamPatternDay, DamScheduleDay, DamSnapshot } from '@shared/dam-types';

// The two decisions behind storing an assembled dam page — is a row still worth
// serving, and is a payload worth writing.
//
// Both are pure, and both are the kind of rule that fails silently when it is
// wrong: the routes keep answering correctly either way, just slowly, or with a
// snapshot older than they should trust. Nothing downstream would report it.

const NOW = Date.parse('2026-08-31T12:00:00Z');

function snapshot(id: string, over?: Partial<DamSnapshot>): DamSnapshot {
  return { ...buildSnapshot(USACE_DAMS[id], {}, []), ...over };
}

function withReading(id: string): DamSnapshot {
  return buildSnapshot(
    USACE_DAMS[id],
    {
      release: { value: 1_200, unit: 'cfs', at: new Date(NOW).toISOString(), staleness: 'fresh' },
    },
    [],
  );
}

// ── is a row still worth serving ──────────────────────────────────────────

test('a row is served until it is three hours old and not after', () => {
  const builtAt = new Date(NOW).toISOString();
  assert.equal(isFresh(builtAt, NOW), true);
  assert.equal(isFresh(builtAt, NOW + MAX_AGE_MS - 1), true);
  assert.equal(isFresh(builtAt, NOW + MAX_AGE_MS), false, 'the bound is exclusive');
  assert.equal(isFresh(builtAt, NOW + 24 * 3_600_000), false);
});

test('a row from the future is not thrown away', () => {
  // A clock disagreeing between the cron's host and this one is not a reason to
  // discard a snapshot that was, by every other measure, just written.
  assert.equal(isFresh(new Date(NOW + 60_000).toISOString(), NOW), true);
});

test('a row this code cannot date is not served', () => {
  // "Probably fine" is the wrong default for a bound whose whole job is to stop
  // a dead cron serving last week's schedule.
  assert.equal(isFresh('not a timestamp', NOW), false);
  assert.equal(isFresh('', NOW), false);
});

// ── is a payload worth writing ────────────────────────────────────────────

test('an empty read of a dam with declared sources is NEVER stored', () => {
  // THE load-bearing one, and the one an earlier draft of decideWrites got
  // wrong. It stored an empty snapshot whenever no row existed yet — which on a
  // FIRST DEPLOY, an empty table by definition, means a cron pass during a CWMS
  // outage writes twenty empty rows and the routes serve them as authoritative
  // for three hours: every dam screen saying the Corps publishes no readings
  // for a project that was generating the whole time.
  //
  // A cache may be out of date. It may not invent an absence.
  const outage = snapshot('swl-table-rock-dam');
  assert.equal(saysAnything(outage), false);

  const { writable, keptOnOutage } = decideWrites([outage]);
  assert.deepEqual(writable, [], 'nothing may be written from a failed read');
  assert.equal(keptOnOutage, 1);
});

test('what was stored before has no bearing on it', () => {
  // The previous rule's test. Storing nothing is correct whether or not a good
  // row is already there: with one, that row stands and ages out on its own;
  // with none, the routes read through, which is what the product did before
  // this table existed.
  const outage = snapshot('swl-table-rock-dam');
  assert.deepEqual(decideWrites([outage]).writable, []);
});

test('a snapshot with readings is always written', () => {
  const good = withReading('swl-table-rock-dam');
  const { writable, keptOnOutage } = decideWrites([good]);
  assert.deepEqual(writable, [good]);
  assert.equal(keptOnOutage, 0);
});

test('a dam that could not be read at all contributes nothing either way', () => {
  const { writable, keptOnOutage } = decideWrites([null]);
  assert.deepEqual(writable, []);
  assert.equal(keptOnOutage, 0);
});

test('every dam in the registry declares a source, so no empty is storable', () => {
  // The premise the rule above rests on, asserted rather than assumed. If a
  // project is ever added with no CWMS path, no SWPA column and no Ameren feed,
  // this fails and whoever added it has to decide deliberately whether an empty
  // snapshot is the true answer for it — which, for such a dam, it would be.
  const sourceless = Object.values(USACE_DAMS).filter(declaresNoSources).map((d) => d.id);
  assert.deepEqual(
    sourceless,
    [],
    'a sourceless dam is storable-when-empty; decideWrites handles it, but say so on purpose',
  );
});

test('a schedule alone is worth storing, with no readings at all', () => {
  // Stockton publishes to SWPA and nothing to CWMS. A rule that wanted metrics
  // would refuse to store it on every pass.
  const scheduleOnly = snapshot('nwk-stockton-dam', {
    schedule: [{ scheduleDate: '2026-08-31', hours: [], idle: [], retrievedAt: null }],
  });
  assert.equal(saysAnything(scheduleOnly), true);
  assert.deepEqual(decideWrites([scheduleOnly]).writable, [scheduleOnly]);
});

test('a SWPA-only dam with an empty schedule is an outage, not an answer', () => {
  // The tempting mistake for Stockton and Truman: they publish nothing to CWMS,
  // so an empty read LOOKS like their normal state. It is not — SWPA is between
  // publications, or the file moved — and storing it would have the dam screen
  // announce that no schedule exists for a project that runs on one.
  const empty = snapshot('nwk-stockton-dam');
  assert.deepEqual(decideWrites([empty]).writable, []);
  assert.equal(decideWrites([empty]).keptOnOutage, 1);
});

// ── the routes' side of the bargain ───────────────────────────────────────

test('the freshness bound has no way around it', () => {
  // There is no option, on either reader, that returns a row past MAX_AGE_MS.
  // One existed briefly for a version of decideWrites that decided what to
  // store by looking at what was stored; that rule was wrong on a first deploy
  // and both it and the escape hatch are gone. Serving a stale snapshot is the
  // one way this table can make the product worse rather than faster.
  const store = readFileSync('src/lib/data/dam-snapshot-store.ts', 'utf8');
  assert.ok(!store.includes('includeStale'), 'no caller may opt out of the bound');
  assert.match(
    store,
    /if \(!isFresh\(row\.built_at, now\)\) continue;/,
    'the index read must filter unconditionally',
  );
});

test('both dam routes re-band what they serve on the serving clock', () => {
  // A stored payload carries the staleness it was stamped with when the cron
  // assembled it, which can be an hour ago — the one field where storing a
  // snapshot makes it say something untrue rather than merely old.
  for (const path of [
    'src/app/api/dams/route.ts',
    'src/app/api/dams/[damId]/route.ts',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /refreshStaleness\(/, `${path} must re-band what it serves`);
  }
});

test('the dam index falls back per dam, not all or nothing', () => {
  // A rule of "stored only when every dam has a row" has a cliff in it: one
  // project that never stores puts all twenty back on the live path
  // indefinitely, and the route keeps answering correctly the whole time, so
  // nothing reports it.
  const source = readFileSync('src/app/api/dams/route.ts', 'utf8');
  assert.match(
    source,
    /fetchDamSummaries\(ids\.filter\(\(id\) => !fromStore\.has\(id\)\)\)/,
    'the index must read live only the dams it has no stored row for',
  );
});

// ── the readers and writers, executed against a fake client ──────────────
//
// The rules above are pure; these are the functions that carry them to the
// table. They used to be pinned by regex over this file's source, which a
// rename keeps green and a behaviour change can too. A fake client that
// records what it was asked is enough to run them.

type Call = { method: string; args: unknown[] };

function fakeClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return chain;
  };
  for (const method of ['from', 'select', 'eq', 'delete', 'not', 'upsert']) chain[method] = record(method);
  chain.maybeSingle = async () => ({ data: result.data ?? null, error: result.error ?? null });
  // Awaiting the chain resolves the query, as PostgREST's builder does.
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve);
  return { client: chain as unknown as Parameters<typeof writeStoredSnapshots>[0], calls };
}

function withoutAdminEnv<T>(run: () => Promise<T>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return run().finally(() => {
    if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  });
}

test('a reader that cannot build a client answers empty, and the routes read through', async () => {
  // createAdminClient throws without credentials, which is the same shape as a
  // table that is not there: the reader must catch it and answer nothing, so
  // the routes fall back to the live read rather than failing the dam layer.
  await withoutAdminEnv(async () => {
    const all = await readStoredSnapshots({ now: NOW });
    assert.equal(all.size, 0);
    assert.equal(await readStoredSnapshot('swl-table-rock-dam', { now: NOW }), null);
  });
});

test('writing sends one upsert with one row per snapshot, keyed on dam_id', async () => {
  const { client, calls } = fakeClient();
  const a = withReading('swl-table-rock-dam');
  const b = withReading('swl-bull-shoals-dam');
  const wrote = await writeStoredSnapshots(client, [a, b], NOW);
  assert.equal(wrote, 2);
  const upsert = calls.find((call) => call.method === 'upsert');
  assert.ok(upsert, 'one upsert');
  const [rows, options] = upsert!.args as [Array<Record<string, unknown>>, { onConflict: string }];
  assert.equal(options.onConflict, 'dam_id');
  assert.deepEqual(rows.map((row) => row.dam_id), ['swl-table-rock-dam', 'swl-bull-shoals-dam']);
  assert.equal(rows[0].built_at, new Date(NOW).toISOString(), 'built_at is when it was assembled');
  assert.equal(rows[0].payload, a, 'the payload is the snapshot, whole');
});

test('writing nothing sends nothing, and a failed write reports zero rows', async () => {
  const empty = fakeClient();
  assert.equal(await writeStoredSnapshots(empty.client, [], NOW), 0);
  assert.equal(empty.calls.length, 0);

  const failing = fakeClient({ error: { message: 'relation does not exist' } });
  assert.equal(await writeStoredSnapshots(failing.client, [withReading('swl-table-rock-dam')], NOW), 0);
});

test('pruning deletes every row the registry no longer names, and never everything', async () => {
  const { client, calls } = fakeClient();
  await pruneStoredSnapshots(client, ['swl-table-rock-dam', 'swl-bull-shoals-dam']);
  assert.deepEqual(
    calls.map((call) => call.method),
    ['from', 'delete', 'not'],
  );
  assert.deepEqual(calls[2].args, ['dam_id', 'in', '("swl-table-rock-dam","swl-bull-shoals-dam")']);

  // "No registry" must never read as "delete every row".
  const none = fakeClient();
  await pruneStoredSnapshots(none.client, []);
  assert.equal(none.calls.length, 0);
});

// ── carrying a reading over a failed request ──────────────────────────────
//
// 2026-11-08: one failed CWMS request for Table Rock's turbine flow rendered
// "Release status unavailable" over the dam page while the Corps was publishing
// the reading the whole time. These pin the fallback that fills such a hole
// from the last good snapshot without ever making a reading look newer.

const HOUR = 3_600_000;
const TABLE_ROCK = 'swl-table-rock-dam';

function reading(value: number, hoursAgo: number, over?: Partial<DamMetricValue>): DamMetricValue {
  return {
    value,
    unit: 'cfs',
    at: new Date(NOW - hoursAgo * HOUR).toISOString(),
    staleness: 'fresh',
    ...over,
  };
}

function tableRock(
  metrics: DamSnapshot['metrics'],
  schedule: DamSnapshot['schedule'] = [],
): DamSnapshot {
  return buildSnapshot(USACE_DAMS[TABLE_ROCK], metrics, schedule);
}

test('a turbine flow the live read dropped is carried, and the hero has a status again', () => {
  const live = tableRock({ release: reading(20, 0.5) });
  const previous = tableRock({ release: reading(20, 1.5), generationFlow: reading(646, 1.5) });

  assert.equal(generationStatusLabel(generationNow(live, NOW)), 'Release status unavailable');

  const merged = carryForwardMetrics(live, previous, NOW);
  assert.equal(merged.metrics.generationFlow?.value, 646);
  assert.equal(merged.metrics.generationFlow?.at, previous.metrics.generationFlow!.at, 'keeps its own observation time');
  assert.equal(merged.metrics.release?.value, 20);
  assert.equal(merged.metrics.release?.at, live.metrics.release!.at, 'the live reading wins');
  assert.equal(merged.generating, true, 'generating is re-derived from the carried flow');
  assert.equal(generationStatusLabel(generationNow(merged, NOW)), 'Generating now');
});

test('a carried reading is banded by its own age, never as fresh as the read that carried it', () => {
  const live = tableRock({ release: reading(20, 0) });
  const previous = tableRock({ generationFlow: reading(646, 4, { staleness: 'fresh' }) });
  const merged = carryForwardMetrics(live, previous, NOW);
  assert.equal(merged.metrics.generationFlow?.staleness, 'lagging');
  assert.equal(generationStatusLabel(generationNow(merged, NOW)), 'Generating at last reading');
});

test('nothing older than the stale line is carried, so re-storing cannot keep a reading alive', () => {
  const live = tableRock({ release: reading(20, 0) });
  const justInside = tableRock({ generationFlow: reading(646, CARRY_FORWARD_MAX_HOURS) });
  const tooOld = tableRock({ generationFlow: reading(646, CARRY_FORWARD_MAX_HOURS + 0.01) });
  assert.ok(carryForwardMetrics(live, justInside, NOW).metrics.generationFlow);
  assert.equal(carryForwardMetrics(live, tooOld, NOW), live);
  assert.equal(carryForwardMetrics(live, tableRock({ generationFlow: reading(646, 1, { at: 'garbage' }) }), NOW), live);
});

test('a carried reading drops its trend, which described the hours before the old reading', () => {
  const live = tableRock({ release: reading(20, 0) });
  const previous = tableRock({
    tailwaterElevation: reading(703, 1, { unit: 'ft', trend: { delta: 0.5, hours: 3 } }),
  });
  const merged = carryForwardMetrics(live, previous, NOW);
  assert.equal(merged.metrics.tailwaterElevation?.value, 703);
  assert.equal('trend' in merged.metrics.tailwaterElevation!, false);
});

test('a different dam, or no previous snapshot, carries nothing', () => {
  const live = tableRock({ release: reading(20, 0) });
  const other = { ...tableRock({ generationFlow: reading(646, 1) }), id: 'swl-bull-shoals-dam' };
  assert.equal(carryForwardMetrics(live, other, NOW), live);
  assert.equal(carryForwardMetrics(live, null, NOW), live);
});

test('the page serves the stored snapshot when the live read came back empty', () => {
  const empty = tableRock({});
  const stored = tableRock({ generationFlow: reading(646, 1.5, { staleness: 'fresh' }) });
  const served = withStoredFallback(empty, stored, NOW);
  assert.equal(served?.metrics.generationFlow?.value, 646);
  assert.equal(served?.metrics.generationFlow?.staleness, 'fresh');
  assert.equal(withStoredFallback(null, stored, NOW)?.id, TABLE_ROCK);
});

test('with no stored row the page is exactly the live read', () => {
  const live = tableRock({ release: reading(20, 0) });
  assert.equal(withStoredFallback(live, null, NOW), live);
  assert.equal(withStoredFallback(null, null, NOW), null);
});

test('the cron carries only onto what decideWrites accepted, so an outage keeps the old row whole', () => {
  const previous = new Map([[TABLE_ROCK, tableRock({ generationFlow: reading(646, 1) })]]);
  const outage = tableRock({});
  const partial = tableRock({ release: reading(20, 0) });

  const decided = decideWrites([outage]);
  assert.equal(decided.writable.length, 0, 'an empty read is still not written');
  assert.equal(carryFromPrevious(decided.writable, previous, NOW).snapshots.length, 0);

  const carried = carryFromPrevious(decideWrites([partial]).writable, previous, NOW);
  assert.equal(carried.carriedDams, 1);
  assert.equal(carried.snapshots[0].metrics.generationFlow?.value, 646);
});

test('the cron reads the previous rows before it writes over them', () => {
  const source = readFileSync('src/app/api/cron/sync-dam-snapshots/route.ts', 'utf8');
  const carry = source.indexOf('carryFromPrevious(decided.writable');
  assert.ok(carry > source.indexOf('decideWrites(snapshots)'), 'carry after decideWrites');
  assert.ok(carry < source.indexOf('writeStoredSnapshots(supabase'), 'carry before the write');
});

// ── carrying a posted schedule over a failed SWPA read ────────────────────
//
// The 2026-11-09 audit's first P1. readSchedule answers [] whenever a SWPA file
// fails or fails closed, CWMS usually still answers, so the snapshot "said
// something" and was written: the stored row with this morning's schedule was
// replaced by one with none, every stored-first reader showed "schedule
// unavailable" for an hour, and the dam Read was rewritten as "not posted".
// NOW is 07:00 CDT on Mon 2026-08-31, so today is 08-31.

function postedDay(scheduleDate: string, retrievedAt: string | null, on: [number, number] = [14, 18]): DamScheduleDay {
  const hours = Array.from({ length: 24 }, (_, i) => {
    const hourEnding = i + 1;
    const megawatts = hourEnding >= on[0] && hourEnding <= on[1] ? 150 : 0;
    return { hourEnding, megawatts, cfs: megawatts ? 9_000 : null, isRamp: hourEnding === on[0] || hourEnding === on[1] + 1 };
  });
  return { scheduleDate, hours, idle: [], retrievedAt };
}

const FETCHED_EARLIER = new Date(NOW - 3 * HOUR).toISOString();

test('the observed pattern alone is not a read, so a total upstream outage keeps the stored row', () => {
  // The pattern comes from dam_metric_readings, Eddy's own table: present
  // whenever Supabase is up, whatever CWMS and SWPA did.
  const pattern: DamPatternDay[] = [{
    scheduleDate: '2026-08-30', startUtc: '2026-08-30T05:00:00.000Z',
    turbineCfs: Array(24).fill(0), totalReleaseCfs: Array(24).fill(20),
  }];
  const patternOnly = { ...tableRock({}), pattern };
  assert.equal(saysAnything(patternOnly), false);
  assert.deepEqual(decideWrites([patternOnly]), { writable: [], keptOnOutage: 1 });
});

test('posted days a failed SWPA read lost are carried, still dated by the read that fetched them', () => {
  const live = tableRock({ release: reading(20, 0) });
  const previous = tableRock({ release: reading(20, 1) }, [
    postedDay('2026-08-30', FETCHED_EARLIER),
    postedDay('2026-08-31', FETCHED_EARLIER),
    postedDay('2026-09-01', FETCHED_EARLIER),
  ]);
  assert.deepEqual(live.schedule, []);

  const merged = carryForwardSchedule(live, previous, NOW);
  assert.deepEqual(merged.schedule.map((day) => day.scheduleDate), ['2026-08-31', '2026-09-01'], 'yesterday is not carried');
  assert.ok(merged.schedule.every((day) => day.retrievedAt === FETCHED_EARLIER), 'carried days keep their own retrievedAt');
  assert.ok(merged.sources.includes('SWPA'), 'attribution follows the schedule it now carries');
  assert.equal(merged.scheduleTimeZone, 'America/Chicago');
  assert.equal(merged.metrics.release?.at, live.metrics.release!.at, 'the live readings are untouched');
});

test('a carried schedule is the same version to forecast history and to the dam Read', () => {
  // The hash ignores retrievedAt, so a carried day neither mints a schedule
  // version nor trips the Read's hash-mismatch withholding.
  const previous = tableRock({}, [postedDay('2026-08-31', FETCHED_EARLIER), postedDay('2026-09-01', FETCHED_EARLIER)]);
  const merged = carryForwardSchedule(tableRock({ release: reading(20, 0) }), previous, NOW);
  const hashOf = (snapshot: DamSnapshot) =>
    forecastHistoryRows(snapshot).find((row) => row.source === 'swpa_schedule')?.content_hash;
  assert.ok(hashOf(previous));
  assert.equal(hashOf(merged), hashOf(previous));
});

test('a day the live read has always wins, and an empty or duplicate day is never carried', () => {
  const liveToday = postedDay('2026-08-31', new Date(NOW).toISOString(), [6, 9]);
  const live = tableRock({ release: reading(20, 0) }, [liveToday]);
  const previous = tableRock({}, [
    postedDay('2026-08-31', FETCHED_EARLIER),
    postedDay('2026-09-01', FETCHED_EARLIER),
    postedDay('2026-09-01', FETCHED_EARLIER, [1, 2]),
    { ...postedDay('2026-09-02', FETCHED_EARLIER), hours: [] },
  ]);
  const merged = carryForwardSchedule(live, previous, NOW);
  assert.deepEqual(merged.schedule.map((day) => day.scheduleDate), ['2026-08-31', '2026-09-01']);
  assert.equal(merged.schedule[0], liveToday, 'a revision the live read fetched is never overwritten');
  assert.equal(merged.schedule[1].hours[13].megawatts, 150, 'the first copy of a duplicated day is the one kept');
});

test('a posted day is carried for six hours after its own fetch and not a moment longer', () => {
  const live = tableRock({ release: reading(20, 0) });
  const fetchedAt = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();
  const atBound = tableRock({}, [postedDay('2026-08-31', fetchedAt(SCHEDULE_CARRY_MAX_HOURS))]);
  const pastBound = tableRock({}, [postedDay('2026-08-31', new Date(NOW - SCHEDULE_CARRY_MAX_HOURS * HOUR - 1).toISOString())]);
  assert.equal(carryForwardSchedule(live, atBound, NOW).schedule.length, 1);
  assert.equal(carryForwardSchedule(live, pastBound, NOW), live);
});

test('a posted day with no fetch time cannot be bounded, so it is never carried', () => {
  const live = tableRock({ release: reading(20, 0) });
  assert.equal(carryForwardSchedule(live, tableRock({}, [postedDay('2026-08-31', null)]), NOW), live);
  assert.equal(carryForwardSchedule(live, tableRock({}, [postedDay('2026-08-31', 'garbage')]), NOW), live);
});

test('hour after hour of SWPA failures carries the schedule, then lets it go as unavailable', () => {
  // The cron's real loop: each pass reads metrics but no schedule, and the row
  // it writes becomes the next pass's previous row. Tomorrow's sheet was
  // fetched the evening before, the case the calendar window alone would carry
  // all day. A carry never refreshes retrievedAt, so the chain cannot extend
  // the bound; at the next pass after it the dam shows no schedule.
  const fetched = NOW - 2 * HOUR;
  let row = tableRock({ release: reading(20, 2) }, [
    postedDay('2026-08-31', new Date(fetched).toISOString()),
    postedDay('2026-09-01', new Date(fetched).toISOString()),
  ]);
  const carriedAt: number[] = [];
  for (let pass = 1; pass <= 8; pass += 1) {
    const now = NOW + pass * HOUR;
    const swpaFailed = buildSnapshot(USACE_DAMS[TABLE_ROCK], {
      release: { value: 20, unit: 'cfs', at: new Date(now).toISOString(), staleness: 'fresh' },
    }, []);
    const written = carryFromPrevious(decideWrites([swpaFailed]).writable, new Map([[TABLE_ROCK, row]]), now);
    row = written.snapshots[0];
    if (written.scheduleCarriedDams === 1) carriedAt.push(pass);
    for (const day of row.schedule) assert.equal(day.retrievedAt, new Date(fetched).toISOString(), 'never re-dated');
  }
  // Fetched 2 h before NOW, so passes 1-4 are within six hours of the fetch.
  assert.deepEqual(carriedAt, [1, 2, 3, 4]);
  assert.deepEqual(row.schedule, [], 'past the bound the schedule is unavailable, not carried indefinitely');
  assert.equal(row.sources.includes('SWPA'), false);
});

test('a dam with no SWPA column, a different dam, or no previous row carries no schedule', () => {
  const clearwater = USACE_DAMS['swl-clearwater-dam'];
  const live = buildSnapshot(clearwater, { release: reading(3_000, 0) }, []);
  const stray = { ...buildSnapshot(clearwater, {}, []), schedule: [postedDay('2026-08-31', FETCHED_EARLIER)] };
  assert.equal(carryForwardSchedule(live, stray, NOW), live);

  const tableRockLive = tableRock({ release: reading(20, 0) });
  const bullShoals = { ...tableRock({}, [postedDay('2026-08-31', FETCHED_EARLIER)]), id: 'swl-bull-shoals-dam' };
  assert.equal(carryForwardSchedule(tableRockLive, bullShoals, NOW), tableRockLive);
  assert.equal(carryForwardSchedule(tableRockLive, null, NOW), tableRockLive);
});

test('the cron keeps a stored schedule through a SWPA failure and counts it', () => {
  const previous = new Map([[TABLE_ROCK, tableRock({ release: reading(20, 1) }, [postedDay('2026-08-31', FETCHED_EARLIER)])]]);
  const swpaFailed = tableRock({ release: reading(20, 0) });
  const carried = carryFromPrevious(decideWrites([swpaFailed]).writable, previous, NOW);
  assert.equal(carried.scheduleCarriedDams, 1);
  assert.equal(carried.carriedDams, 0, 'no metric needed carrying');
  assert.deepEqual(carried.snapshots[0].schedule.map((day) => day.scheduleDate), ['2026-08-31']);
});

test('the page net carries a lost schedule as well as lost readings', () => {
  const stored = tableRock({ release: reading(20, 1) }, [postedDay('2026-08-31', FETCHED_EARLIER)]);
  const served = withStoredFallback(tableRock({ release: reading(20, 0) }), stored, NOW);
  assert.deepEqual(served?.schedule.map((day) => day.scheduleDate), ['2026-08-31']);
});

test('the cron records the snapshots it served in forecast history, carried days included', () => {
  const source = readFileSync('src/app/api/cron/sync-dam-snapshots/route.ts', 'utf8');
  assert.match(source, /recordForecastHistory\(supabase, carried\.snapshots,/);
  assert.match(source, /scheduleCarried,/, 'the count is in the cron response');
});

// The dam detail page's own data path is held by dam-page-snapshot.test.ts,
// which checks the requirement (no cache without an age limit in front of the
// HTML) rather than which wrapper supplies it.
