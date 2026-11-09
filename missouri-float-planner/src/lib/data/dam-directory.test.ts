import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseDirectoryFilters, DIRECTORY_QUERY_MAX_LENGTH } from './dam-directory';
import {
  createDirectoryRowReader,
  directorySnapshotsFromRows,
  DIRECTORY_READ_TIMEOUT_MS,
  DIRECTORY_ROWS_TTL_MS,
  type DirectoryRow,
} from './dam-directory-source';
import { MAX_AGE_MS } from './dam-snapshot-store';
import { conditionsDamCatalogue } from '@/lib/conditions/dam-catalogue';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';

const NOW = Date.parse('2026-11-09T16:00:00Z');
const STATES = ['MO', 'AR', 'OK', 'TX', 'KY', 'TN'];

// ── Shared /dams URLs ─────────────────────────────────────────────────────

test('shared filter URLs restore their search and state', () => {
  assert.deepEqual(parseDirectoryFilters({ q: 'bull shoals', state: 'ar' }, STATES), { query: 'bull shoals', state: 'AR' });
  assert.deepEqual(parseDirectoryFilters({}, STATES), { query: '', state: 'all' });
  assert.deepEqual(parseDirectoryFilters({ q: null, state: null }, STATES), { query: '', state: 'all' }, 'URLSearchParams.get misses');
});

test('a malformed filter URL renders the directory instead of failing the page', () => {
  // A repeated parameter arrives from Next as an array; it used to reach
  // .toUpperCase() and throw.
  assert.deepEqual(parseDirectoryFilters({ q: ['norfork', 'beaver'], state: ['AR', 'MO'] }, STATES), { query: 'norfork', state: 'AR' });
  assert.equal(parseDirectoryFilters({ state: 'ZZ' }, STATES).state, 'all', 'a state with no option falls back to all');
  assert.equal(parseDirectoryFilters({ state: 'all' }, STATES).state, 'all');
  assert.equal(parseDirectoryFilters({ q: 'x'.repeat(500) }, STATES).query.length, DIRECTORY_QUERY_MAX_LENGTH);
  assert.equal(parseDirectoryFilters({ q: '  table rock  ' }, STATES).query, 'table rock');
});

// ── Rows to snapshots, on the request's clock ─────────────────────────────

const reading = (value: number, unit: string, minutesAgo: number) => ({
  value, unit, at: new Date(NOW - minutesAgo * 60_000).toISOString(), staleness: 'fresh' as const,
});

function row(damId: string, builtMinutesAgo: number, metrics: unknown = {}, schedule: unknown = []): DirectoryRow {
  return { dam_id: damId, built_at: new Date(NOW - builtMinutesAgo * 60_000).toISOString(), metrics, schedule };
}

test('a stored row is rebuilt from the registry with its own readings and schedule', () => {
  const day = { scheduleDate: '2026-11-09', hours: [], idle: [], retrievedAt: null };
  const [tableRock] = directorySnapshotsFromRows([
    row('swl-table-rock-dam', 30, { poolElevation: reading(913.4, 'ft', 45), release: reading(9_100, 'cfs', 45) }, [day]),
  ], NOW);
  assert.equal(tableRock.name, 'Table Rock Dam', 'identity comes from the registry');
  assert.equal(tableRock.lakeName, 'Table Rock Lake');
  assert.equal(tableRock.hasTurbines, true);
  assert.ok(tableRock.generationReference, 'reference figures come from the registry too');
  assert.equal(tableRock.metrics.poolElevation?.value, 913.4);
  assert.equal(tableRock.metrics.release?.value, 9_100);
  assert.deepEqual(tableRock.schedule, [day]);
  assert.ok(tableRock.sources.includes('SWPA') && tableRock.sources.includes('USACE CWMS'));
});

test('each reading is re-banded on the request clock, whatever the stored row says', () => {
  const [dam] = directorySnapshotsFromRows([row('swl-table-rock-dam', 30, { release: reading(9_100, 'cfs', 4 * 60) })], NOW);
  assert.equal(dam.metrics.release?.staleness, 'lagging');
});

test('expired, unknown, duplicate and malformed rows never reach the page', () => {
  const kept = directorySnapshotsFromRows([
    row('swl-table-rock-dam', MAX_AGE_MS / 60_000 + 1, { release: reading(1, 'cfs', 5) }),
    row('not-a-registry-dam', 10),
    row('swl-bull-shoals-dam', 10, { release: reading(820, 'cfs', 10) }),
    row('swl-bull-shoals-dam', 10, { release: reading(999, 'cfs', 10) }),
    row('swl-norfork-dam', 10, null, null),
    row('swl-beaver-dam', 10, ['not', 'metrics'], 'not a schedule'),
  ], NOW);
  assert.deepEqual(kept.map(dam => dam.id), ['swl-bull-shoals-dam', 'swl-norfork-dam', 'swl-beaver-dam']);
  assert.equal(kept[0].metrics.release?.value, 820, 'the first row for a dam wins');
  assert.deepEqual(kept[1].metrics, {});
  assert.deepEqual(kept[2].schedule, []);
});

test('with no stored readings the directory still lists and links every dam, with nothing invented', () => {
  const { dams } = conditionsDamCatalogue(directorySnapshotsFromRows([], NOW));
  assert.equal(dams.length, Object.keys(USACE_DAMS).length);
  assert.ok(dams.every(dam => Object.keys(dam.metrics).length === 0 && dam.schedule.length === 0));
});

// ── The bounded read ──────────────────────────────────────────────────────

function fakeClock(start = NOW) {
  let at = start;
  return { now: () => at, advance: (ms: number) => { at += ms; } };
}

test('one database read serves the next minute, and never longer', async () => {
  const clock = fakeClock();
  let reads = 0;
  const read = createDirectoryRowReader(async () => { reads += 1; return [row('swl-table-rock-dam', 5)]; }, { clock: clock.now });
  assert.equal((await read()).length, 1);
  clock.advance(DIRECTORY_ROWS_TTL_MS - 1);
  await read();
  assert.equal(reads, 1, 'within the minute, no second read');
  clock.advance(1);
  await read();
  assert.equal(reads, 2, 'at the bound, a fresh read');
});

test('concurrent requests share the read in flight', async () => {
  let reads = 0;
  let release!: (rows: DirectoryRow[]) => void;
  const read = createDirectoryRowReader(() => { reads += 1; return new Promise(resolve => { release = resolve; }); });
  const both = Promise.all([read(), read()]);
  release([row('swl-table-rock-dam', 5)]);
  const [a, b] = await both;
  assert.equal(reads, 1);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
});

test('a failed read is not cached, and the page gets no rows rather than an error', async () => {
  let calls = 0;
  const read = createDirectoryRowReader(async () => {
    calls += 1;
    if (calls === 1) return null;
    if (calls === 2) throw new Error('network');
    return [row('swl-table-rock-dam', 5)];
  });
  assert.deepEqual(await read(), []);
  assert.deepEqual(await read(), []);
  assert.equal((await read()).length, 1);
  assert.equal(calls, 3, 'every failure was retried on the next request');
});

test('a read slower than the deadline is abandoned: the page renders without readings', async () => {
  let signal: AbortSignal | undefined;
  const read = createDirectoryRowReader(
    (s) => { signal = s; return new Promise<DirectoryRow[]>(() => {}); },
    { timeoutMs: 30 },
  );
  const started = Date.now();
  assert.deepEqual(await read(), []);
  assert.ok(Date.now() - started < 1_000, 'it did not wait for the database');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(signal?.aborted, true, 'and the database request itself is aborted');
});

test('the production deadline and cache bound are the reviewed values', () => {
  assert.equal(DIRECTORY_READ_TIMEOUT_MS, 2_500);
  assert.equal(DIRECTORY_ROWS_TTL_MS, 60_000);
  const source = readFileSync('src/lib/data/dam-directory-source.ts', 'utf8');
  assert.match(source, /createAdminClient\(signal\)/, 'the deadline reaches the database client');
  assert.match(source, /select\('dam_id, built_at, metrics:payload->metrics, schedule:payload->schedule'\)/, 'the read stays narrow');
  assert.doesNotMatch(source, /unstable_cache\(/, 'no cache without an age bound');
});

// ── The page ──────────────────────────────────────────────────────────────

test('the /dams page renders per request, reads through the bounded source, and adds no landmark of its own', () => {
  const page = readFileSync('src/app/dams/page.tsx', 'utf8');
  assert.match(page, /await connection\(\);/, 'today is the reader\'s day, not a cached render\'s');
  assert.match(page, /readDirectoryRows\(\)/);
  assert.match(page, /parseDirectoryFilters\(/);
  assert.doesNotMatch(page, /readStoredSnapshots\(/, 'not the whole-payload read');
  assert.doesNotMatch(page, /<main\b/, 'the root layout already provides <main id="main-content">');
  assert.doesNotMatch(page, /toUpperCase\(\)/, 'filters go through the parser');
});

test('a read that ignores its abort and never settles does not trap later requests', async () => {
  // The abandoned read used to stay `pending`, so every later request joined it
  // and timed out too, until the server instance restarted.
  let calls = 0;
  const read = createDirectoryRowReader(() => {
    calls += 1;
    return calls === 1 ? new Promise<DirectoryRow[]>(() => {}) : Promise.resolve([row('swl-table-rock-dam', 5)]);
  }, { timeoutMs: 30 });
  assert.deepEqual(await read(), [], 'the stuck read is abandoned');
  assert.equal((await read()).length, 1, 'the next request starts a fresh read and recovers');
  assert.equal(calls, 2);
});

test('a read that finishes after its deadline still fills the cache for the next request', async () => {
  let calls = 0;
  const read = createDirectoryRowReader(() => {
    calls += 1;
    return new Promise<DirectoryRow[]>(resolve => setTimeout(() => resolve([row('swl-table-rock-dam', 5)]), 60));
  }, { timeoutMs: 30 });
  assert.deepEqual(await read(), []);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal((await read()).length, 1);
  assert.equal(calls, 1, 'served from the late result, no second read');
});

// ── An open directory stays current ───────────────────────────────────────
//
// The Conditions explorer this page replaced refetched dam readings every five
// minutes and on focus. The directory first shipped with only a moving clock:
// opened at 9 AM, it showed the 9 AM schedule at noon while its now line moved.

test('the open directory re-renders from the server on focus and every five minutes', () => {
  const directory = readFileSync('src/components/dam/DamDirectory.tsx', 'utf8');
  assert.match(directory, /useDamPageClock\(renderedAt\)/, 'the dam page\'s refresh, not a clock alone');
  assert.doesNotMatch(directory, /setInterval\(/, 'no second, clock-only timer');
  const hook = readFileSync('src/components/dam/useDamPageClock.ts', 'utf8');
  assert.match(hook, /router\.refresh\(\)/);
  assert.match(hook, /setInterval\(refresh, 5 \* 60_000\)/);
  assert.match(hook, /addEventListener\('focus', refresh\)/);
  assert.match(hook, /addEventListener\('visibilitychange', refresh\)/);
});

test('an outage says so and offers a retry instead of a page of silent blanks', () => {
  assert.equal(conditionsDamCatalogue(directorySnapshotsFromRows([], NOW)).damsUnavailable, true);
  assert.equal(conditionsDamCatalogue(directorySnapshotsFromRows([row('swl-table-rock-dam', 5)], NOW)).damsUnavailable, false,
    'one dam with readings is not an outage; its neighbours show unavailable on their own cards');
  assert.equal(conditionsDamCatalogue(directorySnapshotsFromRows([row('swl-table-rock-dam', MAX_AGE_MS / 60_000 + 1)], NOW)).damsUnavailable, true,
    'every row expired is an outage too');
  const page = readFileSync('src/app/dams/page.tsx', 'utf8');
  assert.match(page, /readingsUnavailable=\{damsUnavailable\}/);
  const directory = readFileSync('src/components/dam/DamDirectory.tsx', 'utf8');
  assert.match(directory, /Dam readings couldn’t refresh\. You can still open individual dam reports\./);
  assert.match(directory, /onClick=\{refreshNow\}/);
});
