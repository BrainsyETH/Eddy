import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  decideWrites,
  isFresh,
  saysAnything,
  MAX_AGE_MS,
} from './dam-snapshot-store';
import { buildSnapshot, declaresNoSources } from './dams';
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
