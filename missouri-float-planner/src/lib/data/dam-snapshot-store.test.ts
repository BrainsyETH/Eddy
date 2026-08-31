import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  decideWrites,
  isFresh,
  saysAnything,
  MAX_AGE_MS,
} from './dam-snapshot-store';
import { buildSnapshot } from './dams';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import type { DamSnapshot } from '@shared/dam-types';

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

test('an empty snapshot is written when nothing was stored before', () => {
  // The case a plain "never write an empty snapshot" rule gets wrong, and gets
  // wrong permanently: a district that publishes nothing would never acquire a
  // row, so /api/dams would read it live forever to learn the same nothing.
  const empty = snapshot('swl-clearwater-dam');
  assert.equal(saysAnything(empty), false);

  const { writable, keptOnOutage } = decideWrites([empty], new Map());
  assert.deepEqual(writable, [empty]);
  assert.equal(keptOnOutage, 0);
});

test('an empty snapshot does not overwrite a row that had readings', () => {
  // CWMS being down must not turn every dam page into "nothing is published".
  // The old row ages honestly and ages out on its own; see isFresh.
  const good = withReading('swl-table-rock-dam');
  const outage = snapshot('swl-table-rock-dam');

  const { writable, keptOnOutage } = decideWrites(
    [outage],
    new Map([['swl-table-rock-dam', good]]),
  );
  assert.deepEqual(writable, [], 'the good row must be left standing');
  assert.equal(keptOnOutage, 1);
});

test('a snapshot with readings always wins', () => {
  const good = withReading('swl-table-rock-dam');
  const { writable, keptOnOutage } = decideWrites(
    [good],
    new Map([['swl-table-rock-dam', snapshot('swl-table-rock-dam')]]),
  );
  assert.deepEqual(writable, [good]);
  assert.equal(keptOnOutage, 0);
});

test('a dam that could not be read at all contributes nothing either way', () => {
  const { writable, keptOnOutage } = decideWrites([null], new Map());
  assert.deepEqual(writable, []);
  assert.equal(keptOnOutage, 0);
});

test('a schedule alone is worth storing, with no readings at all', () => {
  // Stockton and Truman publish to SWPA and nothing to CWMS. A rule that wanted
  // metrics would refuse to store either of them.
  const scheduleOnly = snapshot('swl-table-rock-dam', {
    schedule: [{ scheduleDate: '2026-08-31', hours: [], idle: [], retrievedAt: null }],
  });
  assert.equal(saysAnything(scheduleOnly), true);
});

// ── the routes' side of the bargain ───────────────────────────────────────

test('neither dam route serves a snapshot past the freshness bound', () => {
  // includeStale exists for the cron, which asks a different question ("has
  // this project ever published"). A route passing it would serve a row the
  // bound exists to withhold — the one way this table can make the product
  // worse rather than faster.
  for (const path of [
    'src/app/api/dams/route.ts',
    'src/app/api/dams/[damId]/route.ts',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.ok(
      !source.includes('includeStale'),
      `${path} must not read past MAX_AGE_MS`,
    );
    // And a stored payload is re-banded on the serving clock rather than
    // carrying the staleness it was stamped with an hour ago.
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
