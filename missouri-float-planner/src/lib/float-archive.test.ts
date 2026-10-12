import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { accumulateFloat, EMPTY_FLOAT_TOTALS, finishFloatTotals, movingPace, type PaceSample } from '@eddy/geo';
import { createFloatArchive, ARCHIVE_KEY, type ArchiveTransport } from '../../../eddy-ios/src/lib/floatArchiveCore';
import { recapFloat } from '../../../eddy-ios/src/lib/floatRecap';
import { createFloatSessionStore, ENDED_KEY, STORAGE_KEY } from '../../../eddy-ios/src/lib/floatSessionStoreCore';
import { routeFromRiver, startSession } from '../../../eddy-ios/src/lib/floatSession';
import type { ArchiveRow, CompletedFloat } from '@shared/float-archive';
import { archiveBatch } from './float-archive/validation';
import { calculateTripDuration } from './calculations/trip-duration';

function disk() {
  const data = new Map<string, string>();
  return {
    data,
    fail: false,
    async getItem(k: string) {
      return data.get(k) ?? null;
    },
    async setItem(k: string, v: string) {
      if (this.fail) throw new Error('full');
      data.set(k, v);
    },
    async removeItem(k: string) {
      if (this.fail) throw new Error('full');
      data.delete(k);
    },
  };
}
const summary = (id = 'trip'): CompletedFloat => ({
  version: 1,
  id,
  riverSlug: 'current',
  riverName: 'Current River',
  putInId: 'akers',
  putInName: 'Akers',
  takeOutId: 'pulltite',
  takeOutName: 'Pulltite',
  boatType: 'canoe',
  startedAt: 1000000,
  endedAt: 4600000,
  elapsedMs: 3600000,
  movingMs: 3000000,
  stoppedMs: 300000,
  unknownMs: 300000,
  distanceMiles: 2,
  movingMph: 2.4,
  plannerMph: 2,
  firstMile: 1,
  lastMile: 3,
  reachedTakeOut: true,
  measurementVersion: 1,
});
const version = '11111111-1111-4111-8111-111111111111';
function server() {
  const rows = new Map<string, ArchiveRow>();
  let preference = { enabled: false, version: null as string | null };
  const api: ArchiveTransport = {
    async read() {
      return { rows: [...rows.values()], preference };
    },
    async write(batch) {
      for (const row of batch) if (!rows.get(row.id)?.deleted) rows.set(row.id, { ...row });
    },
    async consent(enabled) {
      preference = { enabled, version };
      return preference;
    },
  };
  return { rows, api };
}
function session() {
  const prepared = routeFromRiver(
    {
      slug: 'current',
      name: 'Current',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-91, 37],
          [-90.99, 37],
          [-90.98, 37],
        ],
      },
    },
    [
      { id: 'start', name: 'Start', riverMile: 0, type: 'access', isPublic: true, coordinates: { lng: -91, lat: 37 } },
      { id: 'end', name: 'End', riverMile: 1.1, type: 'access', isPublic: true, coordinates: { lng: -90.98, lat: 37 } },
    ],
    null,
  );
  assert.ok(prepared.ok);
  const made = startSession({
    id: 'trip',
    kind: 'saved',
    route: prepared.route,
    index: prepared.index,
    putInId: 'start',
    takeOutId: 'end',
    now: 1000000,
  });
  assert.ok(made.ok);
  return made.session;
}

test('published total pace never seeds Float Mode; moving model remains condition aware', () => {
  const result = calculateTripDuration({
    miles: 6,
    speeds: { speedLowWater: 1, speedNormal: 3, speedHighWater: 4 },
    condition: 'flowing',
    published: { min: 180, max: 300, minutes: 240 },
  });
  assert.equal(result?.speedMph, 1.5);
  assert.equal(result?.movingSpeedMph, 3);
  assert.equal(result?.minutes, 240);
  assert.equal(
    calculateTripDuration({
      miles: 6,
      speeds: { speedLowWater: 1, speedNormal: 3, speedHighWater: 4 },
      condition: 'unknown',
    })?.movingSpeedMph,
    null,
  );
});

test('durable totals match pace classification across movement, stops, upstream travel and gaps', () => {
  let totals = { ...EMPTY_FLOAT_TOTALS };
  const samples: PaceSample[] = [];
  for (let i = 0; i < 4000; i++) {
    const riverMile = i < 1000 ? i * 0.003 : i < 1100 ? 3 : i < 1300 ? 3 - (i - 1100) * 0.002 : 5 + (i - 1300) * 0.003;
    const sample = { timestamp: i * 10000, riverMile, continuous: i !== 0 && i !== 1300 };
    samples.push(sample);
    totals = accumulateFloat(totals, sample);
    if (i % 97 === 0) assert.equal(totals.movingMs, movingPace(samples, 1).movingMs);
  }
  assert.equal(totals.movingMs, movingPace(samples, 1).movingMs);
  assert.ok(totals.movingMs > movingPace(samples.slice(-2500), 1).movingMs);
  const final = finishFloatTotals(totals, 4000 * 10000);
  assert.equal(final.movingMs + final.stoppedMs + final.unknownMs, 4000 * 10000);
  assert.ok(final.stoppedMs >= 6 * 60000);
  assert.ok(final.unknownMs >= 20000, 'jump and trailing unobserved interval are not stops');
  assert.deepEqual(accumulateFloat(totals, samples[0]), totals, 'out of order cannot double count');
  assert.deepEqual(
    accumulateFloat(JSON.parse(JSON.stringify(totals)), { timestamp: 40010000, riverMile: 14, continuous: false }),
    accumulateFloat(totals, { timestamp: 40010000, riverMile: 14, continuous: false }),
  );
});

test('recap has no trace, and a legacy session is unknown instead of inferred from a truncated buffer', () => {
  const active = session();
  delete active.totals;
  const trip = recapFloat(active, active.startedAt + 60000);
  assert.equal(trip.unknownMs, 60000);
  assert.equal(trip.distanceMiles, 0);
  for (const field of ['route', 'samples', 'position', 'track', 'coordinates']) assert.ok(!(field in trip));
  assert.equal(trip.reachedTakeOut, false);
});

test('end journal replays the same summary after an interrupted archive write and never resumes', async () => {
  const storage = disk();
  let fail = true;
  const saved = new Map<string, CompletedFloat>();
  const finish = async (active: ReturnType<typeof session>, at: number) => {
    if (fail) throw new Error('full');
    saved.set(active.id, recapFloat(active, at));
  };
  const store = createFloatSessionStore(storage, () => {}, undefined, finish);
  await store.begin(session());
  const end = store.end();
  assert.equal(store.get(), null, 'tracking stops before IO');
  assert.equal(await end, false);
  assert.ok(storage.data.has(ENDED_KEY));
  assert.ok(storage.data.has(STORAGE_KEY));
  fail = false;
  const restored = createFloatSessionStore(storage, () => {}, undefined, finish);
  await restored.ensureLoaded();
  assert.equal(restored.get(), null);
  assert.equal(saved.size, 1);
  const endedAt = saved.get('trip')!.endedAt;
  await store.retryPendingEnd();
  assert.equal(saved.size, 1);
  assert.equal(saved.get('trip')!.endedAt, endedAt);
  assert.ok(!storage.data.has(STORAGE_KEY));
});

test('legacy saved routes migrate once; guest history follows Apple sign-in and survives reinstall', async () => {
  const storage = disk();
  storage.data.set(
    'eddy.savedFloats.v1',
    JSON.stringify([
      {
        shortCode: 'abc',
        url: 'https://eddy.guide/float/abc',
        riverSlug: 'current',
        riverName: 'Current',
        putInName: 'A',
        takeOutName: 'B',
        distanceLabel: '3 mi',
        savedAt: '2026-01-01T00:00:00.000Z',
        logistics: { savedAt: 'date' },
      },
    ]),
  );
  const local = createFloatArchive(storage);
  await local.select('guest');
  const guestScope = local.scope();
  await local.addCompleted(summary(), guestScope);
  await local.select('accountA');
  assert.equal(local.snapshot().rows.length, 2);
  assert.ok(!('logistics' in local.snapshot().rows.find((r) => r.kind === 'saved')!.payload!));
  await local.addCompleted(summary('late'), guestScope); // journal from before sign-in
  const remote = server();
  await local.sync('accountA', remote.api);
  const restored = createFloatArchive(disk());
  await restored.select('accountA');
  await restored.sync('accountA', remote.api);
  assert.equal(restored.snapshot().rows.length, 3);
  assert.equal(restored.snapshot().preference.enabled, false);
  assert.equal(storage.data.has('eddy.savedFloats.v1'), false);
});

test('switching accounts never imports another signed-in history; late guest journal retains original owner', async () => {
  const local = createFloatArchive(disk());
  await local.select('guest');
  const guestScope = local.scope();
  await local.select('A');
  await local.addCompleted(summary('A'), 'A');
  await local.select('guest');
  await local.select('B');
  await local.addCompleted(summary('late'), guestScope);
  assert.equal(local.snapshot().rows.length, 0);
  await local.select('A');
  assert.deepEqual(
    local
      .snapshot()
      .rows.map((r) => r.id)
      .sort(),
    ['A', 'late'],
  );
});

test('offline deletion beats old cloud copies and stale devices cannot resurrect it', async () => {
  const local = createFloatArchive(disk());
  const remote = server();
  await local.select('A');
  await local.addCompleted(summary(), 'A');
  await local.sync('A', remote.api);
  const other = createFloatArchive(disk());
  await other.select('A');
  await other.sync('A', remote.api);
  await local.remove('trip', 'A');
  await local.sync('A', remote.api);
  await other.sync('A', remote.api);
  assert.equal(other.snapshot().rows[0].deleted, true);
  assert.equal(other.snapshot().rows[0].payload, null);
  await other.addCompleted(summary(), 'A');
  assert.equal(other.snapshot().rows[0].deleted, true);
});

test('local edits made during sync survive the response; switching scope drops an old response', async () => {
  const local = createFloatArchive(disk());
  await local.select('A');
  await local.addCompleted(summary(), 'A');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const remote = server();
  const api = {
    ...remote.api,
    read: async () => {
      await gate;
      return remote.api.read();
    },
  };
  const syncing = local.sync('A', api);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await local.remove('trip', 'A');
  release();
  await syncing;
  assert.equal(local.snapshot().rows[0].deleted, true);
  assert.equal(local.snapshot().rows[0].dirty, true);
  await local.select('B');
  await local.sync('A', remote.api);
  assert.equal(local.snapshot().rows.length, 0);
});

test('failed local writes never replace the durable history and account deletion blocks late saves', async () => {
  const storage = disk();
  const local = createFloatArchive(storage);
  await local.select('A');
  storage.fail = true;
  await assert.rejects(local.addCompleted(summary(), 'A'));
  assert.equal(local.snapshot().rows.length, 0);
  storage.fail = false;
  await local.addCompleted(summary(), 'A');
  await local.clear('A');
  await local.addCompleted(summary('late'), 'A');
  assert.equal(local.snapshot().rows.length, 0);
  assert.ok(!storage.data.get(ARCHIVE_KEY)!.includes('Current River'));
});

test('opt-in applies at completion, never retroactively; failed withdrawal stays off and retries', async () => {
  const local = createFloatArchive(disk());
  const remote = server();
  await local.select('A');
  await local.addCompleted(summary('before'), 'A');
  await local.setConsent('A', true, remote.api);
  await local.addCompleted(summary('after'), 'A', local.contributionVersion('A'));
  assert.equal(local.snapshot().rows.find((r) => r.id === 'before')!.contributionVersion, null);
  assert.equal(local.snapshot().rows.find((r) => r.id === 'after')!.contributionVersion, version);
  await assert.rejects(
    local.setConsent('A', false, {
      ...remote.api,
      consent: async () => {
        throw new Error('offline');
      },
    }),
  );
  assert.equal(local.snapshot().preference.enabled, false);
  await local.sync('A', remote.api);
  assert.equal((await remote.api.read()).preference.enabled, false);
});

test('summary validation rejects raw GPS, unknown fields, inconsistent times and foreign ids', () => {
  const row = { id: 'trip', kind: 'completed', deleted: false, contributionVersion: null, payload: summary() };
  assert.equal(archiveBatch.safeParse({ rows: [row] }).success, true);
  for (const payload of [
    { ...summary(), positions: [[1, 2]] },
    { ...summary(), movingMs: 99999999 },
    { ...summary(), id: 'different' },
  ])
    assert.equal(archiveBatch.safeParse({ rows: [{ ...row, payload }] }).success, false);
});

test('SQL isolates accounts, serializes opt-out, preserves tombstones and cascades deletion', async () => {
  const db = new PGlite();
  const user = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const guest = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to authenticated,service_role;
      create table auth.users(id uuid primary key,is_anonymous boolean default false);
      grant select on auth.users to service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function public.is_permanent_user() returns boolean language sql stable as $$ select coalesce(current_setting('test.guest',true),'false') <> 'true' $$;
      insert into auth.users values ('${user}',false),('${other}',false),('${guest}',true);`);
    const path = new URL('../../supabase/migrations/', import.meta.url);
    const file = readdirSync(path).find((f) => f.endsWith('_float_archive.sql'))!;
    await db.exec(readFileSync(new URL(file, path), 'utf8'));
    const call = async (rows: ArchiveRow[], owner = user) => {
      await db.exec('set role service_role');
      try {
        await db.query('select public.write_float_archive($1,$2)', [owner, JSON.stringify(rows)]);
      } finally {
        await db.exec('reset role');
      }
    };
    const consent = async (enabled: boolean) => {
      await db.exec('set role service_role');
      try {
        return (
          await db.query<{ pref: { enabled: boolean; version: string } }>(
            'select public.set_float_contribution($1,$2) pref',
            [user, enabled],
          )
        ).rows[0].pref;
      } finally {
        await db.exec('reset role');
      }
    };
    const row: ArchiveRow = {
      id: 'trip',
      kind: 'completed',
      payload: summary(),
      deleted: false,
      contributionVersion: null,
    };
    await call([row]);
    await call([{ ...row, id: 'other', payload: summary('other') }], other);
    await assert.rejects(call([row], guest));
    await db.exec(`set role authenticated; set test.uid='${other}'; set test.guest='false';`);
    assert.deepEqual((await db.query<{ id: string }>('select id from public.float_archive')).rows, [{ id: 'other' }]);
    await assert.rejects(db.exec('delete from public.float_archive'));
    await db.exec("set test.guest='true';");
    assert.equal((await db.query('select * from public.float_archive')).rows.length, 0);
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated']) {
      assert.equal(
        (
          await db.query<{ allowed: boolean }>(
            `select has_function_privilege('${role}','public.write_float_archive(uuid,jsonb)','EXECUTE') allowed`,
          )
        ).rows[0].allowed,
        false,
      );
    }
    const pref = await consent(true);
    await call([{ ...row, id: 'shared', payload: summary('shared'), contributionVersion: pref.version }]);
    assert.equal((await db.query('select * from public.float_archive where contributing')).rows.length, 1);
    await consent(false);
    assert.equal((await db.query('select * from public.float_archive where contributing')).rows.length, 0);
    await consent(true);
    await call([{ ...row, id: 'stale', payload: summary('stale'), contributionVersion: pref.version }]);
    assert.equal(
      (await db.query('select * from public.float_archive where contributing')).rows.length,
      0,
      'old consent does not reactivate',
    );
    await call([{ ...row, deleted: true, payload: null }]);
    await call([row]);
    assert.deepEqual(
      (
        await db.query<{ payload: unknown; deleted: boolean }>(
          "select payload,deleted from public.float_archive where user_id=$1 and id='trip'",
          [user],
        )
      ).rows,
      [{ payload: null, deleted: true }],
    );
    await db.query('delete from auth.users where id=$1', [user]);
    assert.equal((await db.query('select * from public.float_archive where user_id=$1', [user])).rows.length, 0);
    assert.equal(
      (await db.query('select * from public.float_archive_preferences where user_id=$1', [user])).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
