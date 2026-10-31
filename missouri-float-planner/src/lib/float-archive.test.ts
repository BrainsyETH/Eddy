import { uploadFloatArchive } from '../../../eddy-ios/src/lib/floatArchiveUpload';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { accumulateFloat, addCoveredInterval, EMPTY_FLOAT_TOTALS, finishFloatTotals, MAX_COVERED_INTERVALS, MAX_CREDITED_GAP_MS, movingPace, type FloatTotals, type PaceSample } from '@eddy/geo';
import { createFloatArchive, uploadBatches, ARCHIVE_KEY, ARCHIVE_RECOVERY_KEY, TOO_LARGE_REASON, UPLOAD_MAX_CHARS, UPLOAD_MAX_ROWS, type ArchiveTransport } from '../../../eddy-ios/src/lib/floatArchiveCore';
import { recapFloat } from '../../../eddy-ios/src/lib/floatRecap';
import { createFloatSessionStore, ENDED_KEY, STORAGE_KEY } from '../../../eddy-ios/src/lib/floatSessionStoreCore';
import { routeFromRiver, startSession } from '../../../eddy-ios/src/lib/floatSession';
import type { ArchiveRow, CompletedFloat } from '@shared/float-archive';
import { archiveBatch } from './float-archive/validation';
import { writeArchiveBatch } from './float-archive/write';
import { waterAtStart } from './float-archive/water';
import type { SupabaseClient } from '@supabase/supabase-js';
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
      return batch.map(() => ({ status: 'accepted' as const }));
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

test('published total pace never seeds River Mode; moving model remains condition aware', () => {
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

/** Paddle continuously from one mile to another, 0.003 mi every 10 s (about 1 mph). */
function paddle(totals: FloatTotals, at: number, from: number, to: number): { totals: FloatTotals; at: number } {
  const steps = Math.round(Math.abs(to - from) / 0.003);
  for (let i = 1; i <= steps; i++) {
    at += 10000;
    totals = accumulateFloat(totals, { timestamp: at, riverMile: from + ((to - from) * i) / steps, continuous: true });
  }
  return { totals, at };
}
function start(mile: number): { totals: FloatTotals; at: number } {
  return { totals: accumulateFloat({ ...EMPTY_FLOAT_TOTALS }, { timestamp: 0, riverMile: mile, continuous: false }), at: 0 };
}
const crosses = (covered: readonly [number, number][] | null | undefined, low: number, high: number) =>
  (covered ?? []).some(([a, b]) => a < high && b > low);

test('covered miles: a gap the tracker refuses adds no river, though the last mile moves', () => {
  for (const [label, jump] of [
    ['a three-hour gap', { timestamp: 0, riverMile: 5, continuous: false, reacquired: true as const }],
    ['a relocation', { timestamp: 0, riverMile: 5, continuous: false }],
  ] as const) {
    let { totals, at } = paddle(start(0).totals, 0, 0, 1);
    at += label === 'a three-hour gap' ? MAX_CREDITED_GAP_MS + 60 * 60000 : 60000;
    totals = accumulateFloat(totals, { ...jump, timestamp: at });
    ({ totals, at } = paddle(totals, at, 5, 5.5));
    assert.ok(totals.last!.riverMile - totals.firstMile! >= 5, `${label}: last − first still spans the jump`);
    assert.ok(!crosses(totals.coveredMiles, 1.01, 4.99), `${label}: no interval across the jump`);
    assert.equal(totals.coveredMiles!.length, 2, label);
  }
});

test('covered miles: a credited gap joins the river either side; an out-and-back counts once', () => {
  let { totals, at } = paddle(start(0).totals, 0, 0, 1);
  // 0.5 mi in ten minutes is within the tracker's top river speed.
  totals = accumulateFloat(totals, { timestamp: at + 600000, riverMile: 1.5, continuous: false, reacquired: true });
  ({ totals } = paddle(totals, at + 600000, 1.5, 2));
  assert.equal(totals.coveredMiles!.length, 1);
  assert.equal(totals.coveredMiles![0][0], 0);
  assert.ok(totals.coveredMiles![0][1] > 1.9);

  ({ totals, at } = paddle(start(0).totals, 0, 0, 1));
  ({ totals } = paddle(totals, at, 1, 0));
  const final = finishFloatTotals(totals, at * 2);
  assert.ok(final.distanceMiles > 1.9, 'distance is gross');
  assert.equal(totals.coveredMiles!.length, 1, 'river covered is not');
  assert.ok(totals.coveredMiles![0][1] - totals.coveredMiles![0][0] <= 1);
});

test('covered miles: a stop adds no river, and a legacy session is never measured from the middle', () => {
  let totals = { ...EMPTY_FLOAT_TOTALS };
  for (let i = 0; i <= 360; i++)
    totals = accumulateFloat(totals, { timestamp: i * 10000, riverMile: i % 2 ? 0.003 : 0, continuous: i > 0 });
  totals = accumulateFloat(totals, { timestamp: 3700000, riverMile: 10, continuous: false });
  assert.deepEqual(totals.coveredMiles, []);

  const legacy: FloatTotals = { ...EMPTY_FLOAT_TOTALS };
  delete legacy.coveredMiles;
  assert.equal(paddle(accumulateFloat(legacy, { timestamp: 0, riverMile: 0, continuous: false }), 0, 0, 1).totals.coveredMiles, undefined);
});

test('covered intervals merge only when they overlap or touch, and give up past the cap', () => {
  assert.deepEqual(addCoveredInterval([[0, 1]], 1, 2), [[0, 2]]);
  assert.deepEqual(addCoveredInterval([[0, 1], [3, 4]], 0.5, 3.5), [[0, 4]]);
  assert.deepEqual(addCoveredInterval([[0, 1]], 1.01, 2), [[0, 1], [1.01, 2]], 'a gap a few metres wide stays out');
  assert.deepEqual(addCoveredInterval([[2, 3]], 1, 0), [[0, 1], [2, 3]], 'either direction, kept sorted');
  const full = Array.from({ length: MAX_COVERED_INTERVALS }, (_, i) => [i * 2, i * 2 + 1] as [number, number]);
  assert.equal(addCoveredInterval(full, 100, 101), null);
  assert.equal(addCoveredInterval(null, 0, 1), null, 'null stays null');
  const before = [[0, 1]] as [number, number][];
  addCoveredInterval(before, 2, 3);
  assert.deepEqual(before, [[0, 1]], 'never mutates');
});

test('recap has no trace, and a legacy session is unknown instead of inferred from a truncated buffer', () => {
  const active = session();
  delete active.totals;
  const trip = recapFloat(active, active.startedAt + 60000);
  assert.equal(trip.unknownMs, 60000);
  assert.equal(trip.distanceMiles, 0);
  for (const field of ['route', 'samples', 'position', 'gpsPosition', 'track', 'coordinates']) assert.ok(!(field in trip));
  assert.equal(trip.reachedTakeOut, false);
});

test('confirmed stops add no GPS wobble distance; movement, upstream travel and gaps remain distinct', () => {
  let totals = { ...EMPTY_FLOAT_TOTALS };
  for (let i = 0; i <= 360; i++)
    totals = accumulateFloat(totals, { timestamp: i * 10000, riverMile: i % 2 ? 0.003 : 0, continuous: i > 0 });
  const stopped = finishFloatTotals(totals, 3600000);
  assert.equal(stopped.distanceMiles, 0);
  assert.equal(stopped.movingMs, 0);
  assert.equal(stopped.stoppedMs, 3600000);
  // A continuity break closes the stop; no miles are invented across that gap.
  totals = accumulateFloat(totals, { timestamp: 3700000, riverMile: 10, continuous: false });
  for (let i = 1; i <= 30; i++) {
    const sample = { timestamp: 3700000 + i * 10000, riverMile: 10 + i * 0.01, continuous: true };
    const restored = accumulateFloat(JSON.parse(JSON.stringify(totals)), sample);
    totals = accumulateFloat(totals, sample);
    assert.deepEqual(restored, totals, 'pending distance survives a restart');
  }
  for (let i = 1; i <= 10; i++)
    totals = accumulateFloat(totals, { timestamp: 4000000 + i * 10000, riverMile: 10.3 - i * 0.01, continuous: true });
  totals = accumulateFloat(totals, { timestamp: 4200000, riverMile: 20, continuous: false });
  const final = finishFloatTotals(totals, 4200000);
  assert.ok(Math.abs(final.distanceMiles - 0.4) < 1e-9, 'downstream and upstream movement count; gap and stop do not');
  assert.equal(final.stoppedMs, 3600000);
  assert.equal(final.movingMs, 400000);
  assert.equal(final.unknownMs, 200000);
});

test('distance across a reacquired GPS gap counts; its time, relocations and impossible crossings do not', () => {
  // Twenty minutes moving to mile 0.6, a gap ending at `gap`, then ten minutes moving on.
  const before = Array.from({ length: 121 }, (_, i): PaceSample => ({ timestamp: i * 10000, riverMile: i * 0.005, continuous: i > 0 }));
  const after = (gap: PaceSample) => Array.from({ length: 60 }, (_, i): PaceSample =>
    ({ timestamp: gap.timestamp + (i + 1) * 10000, riverMile: gap.riverMile + (i + 1) * 0.005, continuous: true }));
  const run = (gap: PaceSample) => {
    let totals = { ...EMPTY_FLOAT_TOTALS };
    for (const sample of [...before, gap, ...after(gap)]) totals = accumulateFloat(totals, sample);
    return finishFloatTotals(totals, gap.timestamp + 600000);
  };
  // Lost under a bluff at 1,200 s, found again 15 minutes later 0.5 mi on.
  const found = run({ timestamp: 2100000, riverMile: 1.1, continuous: false, reacquired: true });
  // The same jump as a relocation: a wrong match corrected, no distance (as before).
  const corrected = run({ timestamp: 2100000, riverMile: 1.1, continuous: false });
  assert.ok(Math.abs(found.distanceMiles - corrected.distanceMiles - 0.5) < 1e-9, 'the river between the two confirmed positions was covered');
  assert.ok(corrected.distanceMiles > 0.8, 'movement either side counts in both');
  assert.equal(found.movingMs, corrected.movingMs, 'the gap is not moving time');
  assert.equal(found.unknownMs, corrected.unknownMs, 'it stays a GPS gap');
  assert.ok(found.unknownMs >= 900000);
  assert.equal(found.movingMph, corrected.movingMph, 'moving speed is unchanged');
  // Faster than the tracker's top river speed (about 9 mph) is not paddling.
  const impossible = run({ timestamp: 2100000, riverMile: 4.6, continuous: false, reacquired: true });
  const impossibleCorrected = run({ timestamp: 2100000, riverMile: 4.6, continuous: false });
  assert.ok(Math.abs(impossible.distanceMiles - impossibleCorrected.distanceMiles) < 1e-9);
  // Restored from storage mid-float, the same sample counts the same.
  let totals = { ...EMPTY_FLOAT_TOTALS };
  for (const sample of before) totals = accumulateFloat(totals, sample);
  const gap: PaceSample = { timestamp: 2100000, riverMile: 1.1, continuous: false, reacquired: true };
  assert.deepEqual(accumulateFloat(JSON.parse(JSON.stringify(totals)), gap), accumulateFloat(totals, gap));
});

test('a gap credits no miles when it is too long to have been paddled, or is only drift at a stop', () => {
  const before = Array.from({ length: 121 }, (_, i): PaceSample => ({ timestamp: i * 10000, riverMile: 8 + i * 0.005, continuous: i > 0 }));
  // Miles the gap itself credited: against the same jump as a relocation,
  // which closes the run before it the same way and credits nothing.
  const across = (gap: PaceSample) => {
    let totals = { ...EMPTY_FLOAT_TOTALS };
    for (const sample of before) totals = accumulateFloat(totals, sample);
    return accumulateFloat(totals, gap).distanceMiles - accumulateFloat(totals, { ...gap, reacquired: undefined }).distanceMiles;
  };
  const last = before[before.length - 1];
  // Stopped without Finish, phone off overnight, pushed off six miles on: slow
  // enough for the speed bound, too long to have been paddled.
  assert.equal(across({ timestamp: last.timestamp + 12 * 3_600_000, riverMile: last.riverMile + 6, continuous: false, reacquired: true }), 0);
  // Just past the limit credits nothing; just inside it still does.
  assert.equal(across({ timestamp: last.timestamp + MAX_CREDITED_GAP_MS + 1, riverMile: last.riverMile + 3, continuous: false, reacquired: true }), 0);
  assert.ok(Math.abs(across({ timestamp: last.timestamp + MAX_CREDITED_GAP_MS, riverMile: last.riverMile + 3, continuous: false, reacquired: true }) - 3) < 1e-9);
  // Reacquired 15 m upstream after a gap at a stop: GPS drift, not travel.
  assert.equal(across({ timestamp: last.timestamp + 20 * 60_000, riverMile: last.riverMile - 15 / 1609.344, continuous: false, reacquired: true }), 0);
  // Real travel upstream across a gap still counts, like upstream movement does.
  assert.ok(Math.abs(across({ timestamp: last.timestamp + 20 * 60_000, riverMile: last.riverMile - 0.3, continuous: false, reacquired: true }) - 0.3) < 1e-9);
});

test('corrupt current and legacy history is copied before recovery, and cloud history can still restore', async () => {
  for (const [key, raw] of [
    [ARCHIVE_KEY, '{broken'],
    [ARCHIVE_KEY, JSON.stringify({ version: 1, owner: 'A', guestKey: 'guest', accounts: { A: { rows: null } } })],
    ['eddy.savedFloats.v1', '{broken legacy'],
    ['eddy.savedFloats.v1', JSON.stringify([null])],
  ]) {
    const storage = disk();
    storage.data.set(key, raw);
    const local = createFloatArchive(storage);
    await local.select('guest');
    assert.equal(local.snapshot().ready, true);
    assert.equal(local.snapshot().recovered, true);
    assert.deepEqual(JSON.parse(storage.data.get(ARCHIVE_RECOVERY_KEY)!), [{ source: key, raw }]);
    await local.addCompleted(summary('new'));
    const restarted = createFloatArchive(storage);
    await restarted.select('A');
    const remote = server();
    await remote.api.write([{ id: 'restored', kind: 'completed', payload: summary('restored'), deleted: false, contributionVersion: null }]);
    await restarted.sync('A', remote.api);
    assert.deepEqual(restarted.snapshot().rows.map((r) => r.id).sort(), ['new', 'restored']);
    assert.equal(restarted.snapshot().recovered, true);
    await restarted.remove('new', 'A');
    assert.equal(storage.data.has(ARCHIVE_RECOVERY_KEY), false, 'deleting a trip also removes unreadable copies');
    assert.equal(restarted.snapshot().recovered, false);
  }
});

test('forgetting a saved route keeps the recovery copy; a scope mismatch deletes nothing and says so', async () => {
  const storage = disk();
  storage.data.set(ARCHIVE_KEY, '{broken');
  const local = createFloatArchive(storage);
  await local.select('A');
  assert.equal(local.snapshot().recovered, true);
  await local.putSaved({ shortCode: 'abc', url: 'https://eddy.guide/float/abc', riverName: 'Current River', riverSlug: 'current',
    putInName: 'Akers', takeOutName: 'Pulltite', distanceLabel: '6 mi', savedAt: new Date(0).toISOString() }, 'A');
  const savedId = local.snapshot().rows[0].id;
  assert.equal(await local.remove(savedId, 'A'), true);
  assert.ok(storage.data.has(ARCHIVE_RECOVERY_KEY), 'a saved route is not what the unreadable copy could resurrect');
  assert.equal(local.snapshot().recovered, true);
  await local.addCompleted(summary('trip'), 'A');
  assert.equal(await local.remove('trip', 'wrong-scope'), false);
  assert.equal(local.snapshot().rows.find((r) => r.id === 'trip')?.deleted, false, 'nothing deleted on a scope mismatch');
  assert.equal(await local.remove('missing', 'A'), false);
  assert.ok(storage.data.has(ARCHIVE_RECOVERY_KEY));
  assert.equal(await local.remove('trip', 'A'), true);
  assert.equal(storage.data.has(ARCHIVE_RECOVERY_KEY), false, 'deleting a trip removes the unreadable copy, after its tombstone');
  assert.equal(local.snapshot().recovered, false);
});

test('uploads are batched by size as well as count, and a 413 isolates the oversized row', async () => {
  const sized = (n: number) => ({ id: `r${n}`, chars: n });
  const rows = [sized(1), sized(2), sized(UPLOAD_MAX_CHARS + 1), sized(3), ...Array.from({ length: UPLOAD_MAX_ROWS + 1 }, (_, i) => sized(100 + i))];
  const batches = uploadBatches(rows, (row) => row.chars);
  assert.deepEqual(batches.map((b) => b.length), [2, 1, UPLOAD_MAX_ROWS, 2]);
  assert.equal(batches[1][0].id, `r${UPLOAD_MAX_CHARS + 1}`, 'too large for any batch: alone, so a 413 names it');

  const local = createFloatArchive(disk());
  await local.select('A');
  for (const id of ['small-1', 'huge', 'small-2']) await local.addCompleted({ ...summary(id), startNote: id === 'huge' ? 'x'.repeat(200) : undefined }, 'A');
  const remote = server();
  const written: string[][] = [];
  const api: ArchiveTransport = { ...remote.api, write: async (batch) => {
    written.push(batch.map((r) => r.id));
    // The server refuses any body carrying the oversized row.
    if (batch.some((r) => r.id === 'huge')) throw Object.assign(new Error('Batch too large'), { status: 413 });
    return remote.api.write(batch);
  } };
  await local.sync('A', api);
  const synced = new Map(local.snapshot().rows.map((r) => [r.id, r]));
  assert.equal(synced.get('small-1')?.dirty, false);
  assert.equal(synced.get('small-2')?.dirty, false, 'rows behind the oversized one still upload');
  assert.equal(synced.get('huge')?.backupError, TOO_LARGE_REASON);
  assert.equal(synced.get('huge')?.dirty, false, 'not resent every fifteen minutes');
  assert.equal(local.snapshot().error, null);
  assert.ok(written.some((ids) => ids.length === 1 && ids[0] === 'huge'), 'halved down to the one row');
});

test('a backup failure stays visible through later local saves; one unreadable server row is skipped, not kept', async () => {
  const storage = disk();
  const local = createFloatArchive(storage);
  await local.select('A');
  await local.addCompleted(summary('first'), 'A');
  const remote = server();
  await local.sync('A', { ...remote.api, write: async () => { throw new Error('offline'); } });
  assert.equal(local.snapshot().error, 'offline');
  await local.addCompleted(summary('second'), 'A');
  assert.equal(local.snapshot().error, 'offline', 'a local save does not clear a backup failure');
  await remote.api.write([{ id: 'odd', kind: 'completed', payload: { nonsense: true } as unknown as CompletedFloat, deleted: false, contributionVersion: null }]);
  await local.sync('A', remote.api, true);
  assert.equal(local.snapshot().error, null, 'a successful backup clears it');
  assert.deepEqual(local.snapshot().rows.map((r) => r.id).sort(), ['first', 'second']);
  const restarted = createFloatArchive(storage);
  await restarted.select('A');
  assert.equal(restarted.snapshot().recovered, false, 'history still readable at the next launch');
  assert.equal(restarted.locate('first'), 'current');
  await restarted.select('B');
  assert.equal(restarted.locate('first'), 'elsewhere');
  assert.equal(restarted.locate('nothing'), null);
});

test('a sync without a read uploads changes but does not download history', async () => {
  const local = createFloatArchive(disk());
  await local.select('A');
  await local.addCompleted(summary('mine'), 'A');
  const remote = server();
  await remote.api.write([{ id: 'theirs', kind: 'completed', payload: summary('theirs'), deleted: false, contributionVersion: null }]);
  let reads = 0;
  const api: ArchiveTransport = { ...remote.api, read: async () => { reads += 1; return remote.api.read(); } };
  await local.sync('A', api, false, false);
  assert.equal(reads, 0);
  assert.equal(local.snapshot().rows.find((r) => r.id === 'mine')?.dirty, false);
  assert.equal(local.snapshot().rows.some((r) => r.id === 'theirs'), false);
  await local.sync('A', api);
  assert.equal(reads, 1);
  assert.equal(local.snapshot().rows.some((r) => r.id === 'theirs'), true);
});

test('recovery never overwrites data if preservation fails, and temporary read errors can retry', async () => {
  const storage = disk();
  storage.data.set(ARCHIVE_KEY, '{original');
  storage.fail = true;
  const local = createFloatArchive(storage);
  await assert.rejects(local.select('guest'), /full/);
  assert.equal(local.snapshot().ready, false);
  assert.equal(storage.data.get(ARCHIVE_KEY), '{original');
  storage.fail = false;
  await local.select('guest');
  await local.addCompleted(summary());
  const valid = storage.data.get(ARCHIVE_KEY);
  let unavailable = true;
  const restarted = createFloatArchive({ ...storage, getItem: async (key) => {
    if (unavailable) throw new Error('temporarily unavailable');
    return storage.getItem(key);
  } });
  await assert.rejects(restarted.select('guest'), /temporarily unavailable/);
  assert.equal(storage.data.get(ARCHIVE_KEY), valid);
  unavailable = false;
  await restarted.select('guest');
  assert.equal(restarted.snapshot().rows[0].id, 'trip');
  await restarted.clear('guest');
  assert.equal(storage.data.has(ARCHIVE_RECOVERY_KEY), false);
  storage.data.set(ARCHIVE_KEY, JSON.stringify({ version: 2 }));
  await assert.rejects(createFloatArchive(storage).select('guest'), /Update Eddy/);
  assert.equal(storage.data.get(ARCHIVE_KEY), JSON.stringify({ version: 2 }));
});

test('later corruption preserves earlier recovery copies instead of overwriting them', async () => {
  const storage = disk();
  storage.data.set(ARCHIVE_KEY, '{first');
  await createFloatArchive(storage).select('guest');
  storage.data.set(ARCHIVE_KEY, '{second');
  await createFloatArchive(storage).select('guest');
  assert.deepEqual(JSON.parse(storage.data.get(ARCHIVE_RECOVERY_KEY)!).map((v: { raw: string }) => v.raw), ['{first', '{second']);
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

test('a recap deleted on another device tells this one to drop its raw track, exactly once', async () => {
  // The recording phone keeps the float's GPS journal; the recap is the only
  // screen that deletes it. When the recap is tombstoned from elsewhere the
  // phone must still hear which track to remove, after the tombstone is on
  // disk and never for a row it had already tombstoned itself.
  const dropped: string[][] = [];
  const recorder = createFloatArchive(disk(), Date.now, (ids) => dropped.push([...ids]));
  const remote = server();
  await recorder.select('A');
  await recorder.addCompleted(summary(), 'A');
  await recorder.sync('A', remote.api);
  const other = createFloatArchive(disk());
  await other.select('A');
  await other.sync('A', remote.api);
  await other.remove('trip', 'A');
  await other.sync('A', remote.api);
  assert.deepEqual(dropped, []);
  await recorder.sync('A', remote.api);
  assert.deepEqual(dropped, [['trip']]);
  assert.equal(recorder.snapshot().rows[0].deleted, true);
  // Already a tombstone here: nothing new to drop on the next read.
  await recorder.sync('A', remote.api);
  assert.deepEqual(dropped, [['trip']]);
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

test('oversized archive batches stop before validating individual trips', () => {
  const trip = Object.defineProperty({}, 'id', {
    get() { throw new Error('An oversized batch must not validate individual rows'); },
  });
  const result = archiveBatch.safeParse({ rows: Array(21).fill(trip) });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, 'too_big');
    assert.deepEqual(result.error.issues[0].path, ['rows']);
  }
});

test('summary validation rejects raw GPS, unknown fields, inconsistent times and foreign ids', () => {
  const row = { id: 'trip', kind: 'completed', deleted: false, contributionVersion: null, payload: summary() };
  assert.equal(archiveBatch.safeParse({ rows: [row] }).success, true);
  for (const payload of [
    { ...summary(), positions: [[1, 2]] },
    { ...summary(), movingMs: 99999999 },
    { ...summary(), id: 'different' },
    { ...summary(), startNote: ['raw', 'data'] },
    { ...summary(), startNote: '' },
    { ...summary(), startNote: 'x'.repeat(241) },
  ])
    assert.equal(archiveBatch.safeParse({ rows: [{ ...row, payload }] }).success, false);
});

test('a refused trip does not block later batches or restores, and retries only on request', async () => {
  const storage = disk();
  const local = createFloatArchive(storage);
  await local.select('A');
  for (let i = 0; i < 25; i++) await local.addCompleted(summary(`trip-${i}`), 'A');
  const remote = server();
  remote.rows.set('remote', { id: 'remote', kind: 'completed', payload: summary('remote'), deleted: false, contributionVersion: null });
  const attempted: string[] = [];
  let reject = true;
  const api: ArchiveTransport = { ...remote.api, write: async (batch) => {
    attempted.push(...batch.map((r) => r.id));
    return Promise.all(batch.map(async (row) => {
      if (row.id === 'trip-22' && reject) return { status: 'rejected' as const, reason: 'Unsupported trip details.' };
      return (await remote.api.write([row]))[0];
    }));
  } };
  await local.sync('A', api);
  assert.equal(attempted.length, 25);
  assert.equal(remote.rows.size, 25, 'all 24 valid local trips uploaded');
  assert.equal(local.snapshot().rows.length, 26, 'remote trip restored despite refusal');
  assert.equal(local.snapshot().rows.find((r) => r.id === 'trip-22')!.backupError, 'Unsupported trip details.');
  const restarted = createFloatArchive(storage);
  await restarted.select('A');
  await restarted.sync('A', api);
  assert.equal(attempted.length, 25, 'refusal survives restart without endless retries');
  assert.ok(restarted.snapshot().rows.find((r) => r.id === 'trip-22')!.payload, 'local trip stays visible');
  reject = false;
  await restarted.retryRejected('A');
  await restarted.sync('A', api, true);
  assert.deepEqual(attempted.slice(25), ['trip-22']);
  assert.equal(restarted.snapshot().rows.find((r) => r.id === 'trip-22')!.backupError, undefined);
});

test('accepted batches stay acknowledged after later network failures; retries back off and manual sync bypasses', async () => {
  let now = 1000000;
  const local = createFloatArchive(disk(), () => now);
  await local.select('A');
  for (let i = 0; i < 25; i++) await local.addCompleted(summary(`trip-${i}`), 'A');
  const remote = server();
  let writes = 0;
  const api: ArchiveTransport = { ...remote.api, write: async (batch) => {
    writes++;
    if (writes > 1) throw new Error('offline');
    return remote.api.write(batch);
  } };
  await local.sync('A', api);
  assert.equal(local.snapshot().rows.filter((r) => r.dirty).length, 5);
  assert.equal(local.snapshot().retryAt, now + 60000);
  await local.sync('A', api);
  assert.equal(writes, 2);
  for (const delay of [120000, 240000, 480000, 900000, 900000]) {
    now = local.snapshot().retryAt!;
    await local.sync('A', api);
    assert.equal(local.snapshot().retryAt, now + delay);
  }
  const remaining: string[] = [];
  await local.sync('A', { ...remote.api, write: async (batch) => {
    remaining.push(...batch.map((r) => r.id));
    return remote.api.write(batch);
  } }, true);
  assert.equal(remaining.length, 5, 'successful first batch is never resent');
  assert.equal(local.snapshot().retryAt, null);
  assert.equal(local.snapshot().error, null);
  assert.equal(local.snapshot().rows.filter((r) => r.dirty).length, 0);
});

test('an unconfirmed protocol response retries, while a failed restore does not resend acknowledged uploads', async () => {
  const local = createFloatArchive(disk());
  await local.select('A');
  await local.addCompleted(summary(), 'A');
  const remote = server();
  await local.sync('A', { ...remote.api, write: async () => [] });
  assert.equal(local.snapshot().rows[0].dirty, true);
  assert.match(local.snapshot().error!, /could not be confirmed/);
  await local.sync('A', { ...remote.api, read: async () => { throw new Error('read unavailable'); } }, true);
  assert.equal(local.snapshot().rows[0].dirty, false);
  await local.sync('A', { ...remote.api, write: async () => { throw new Error('must not resend'); } }, true);
  assert.equal(local.snapshot().error, null);
});

test('an upload acknowledgement cannot clear a deletion made while that upload is in flight', async () => {
  const local = createFloatArchive(disk());
  await local.select('A');
  await local.addCompleted(summary(), 'A');
  const remote = server();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const start = new Promise<void>((r) => { started = r; });
  const pending = local.sync('A', { ...remote.api, write: async (batch) => {
    started();
    await gate;
    return remote.api.write(batch);
  } });
  await start;
  await local.remove('trip', 'A');
  release();
  await pending;
  assert.equal(local.snapshot().rows[0].deleted, true);
  assert.equal(local.snapshot().rows[0].dirty, true);
  await local.sync('A', remote.api);
  assert.equal(remote.rows.get('trip')!.deleted, true);
});

test('server returns per-row refusals, enriches only new owned trips, and leaves infrastructure failures retryable', async () => {
  const persisted: ArchiveRow[] = [];
  const enriched: string[] = [];
  const filters: unknown[][] = [];
  let lookupFailure = false;
  let writeFailure = false;
  const db = {
    from(table: string) { assert.equal(table, 'float_archive'); return this; },
    select(fields: string) { assert.equal(fields, 'id'); return this; },
    eq(field: string, user: string) { filters.push([field, user]); return this; },
    async in(field: string, ids: string[]) {
      assert.equal(field, 'id');
      assert.deepEqual(ids, ['existing', 'new']);
      return { data: [{ id: 'existing' }], error: lookupFailure ? { message: 'offline' } : null };
    },
    async rpc(name: string, args: { p_user: string; p_rows: ArchiveRow[] }) {
      assert.equal(name, 'write_float_archive');
      assert.equal(args.p_user, 'owner');
      if (!writeFailure) persisted.push(...args.p_rows);
      return { error: writeFailure ? { message: 'offline' } : null };
    },
  } as unknown as SupabaseClient;
  const water = async (_db: SupabaseClient, trip: CompletedFloat) => { enriched.push(trip.id); return null; };
  const row = (id: string): ArchiveRow => ({ id, kind: 'completed', payload: summary(id), deleted: false, contributionVersion: null });
  const input = [row('existing'), { ...row('bad-clock'), payload: { ...summary('bad-clock'), startedAt: Date.now() + 172800000 } },
    { ...row('new'), payload: { ...summary('new'), putInId: null, putInName: null, startNote: 'Recording started 3.2 mi below Akers' } }];
  const results = await writeArchiveBatch(db, 'owner', input, water);
  assert.deepEqual(results.map((r) => r.status), ['accepted', 'rejected', 'accepted']);
  assert.deepEqual(persisted.map((r) => r.id), ['existing', 'new']);
  assert.deepEqual(enriched, ['new']);
  assert.equal((persisted[1].payload as CompletedFloat).startNote, 'Recording started 3.2 mi below Akers');
  assert.equal((persisted[1].payload as CompletedFloat).putInId, null);
  assert.deepEqual(filters, [['user_id', 'owner']], 'existing IDs must be scoped to authenticated owner');
  lookupFailure = true;
  await assert.rejects(writeArchiveBatch(db, 'owner', input, water), /check existing/);
  lookupFailure = false;
  writeFailure = true;
  await assert.rejects(writeArchiveBatch(db, 'owner', input, water), /Archive write failed/);
  assert.equal(persisted.length, 2);
});

test('SQL isolates accounts, serializes opt-out, preserves tombstones and cascades deletion', async () => {
  const db = new PGlite();
  const user = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const guest = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to authenticated,service_role;
      create table auth.users(id uuid primary key,is_anonymous boolean default false,
        email text, encrypted_password text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function public.is_permanent_user() returns boolean language sql stable as $$ select coalesce(current_setting('test.guest',true),'false') <> 'true' $$;
      insert into auth.users(id,is_anonymous) values ('${user}',false),('${other}',false),('${guest}',true);`);
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
    // Reproduce the deployed permissions, rather than quietly supplying a
    // broad auth.users grant only in the test fixture.
    await assert.rejects(call([row]), { code: '42501' });
    await assert.rejects(consent(true), { code: '42501' });
    const grant = readdirSync(path).find(f => f.endsWith('_float_archive_account_read_grant.sql'))!;
    await db.exec(readFileSync(new URL(grant, path), 'utf8'));
    await db.exec('set role service_role');
    await db.query('select id,is_anonymous from auth.users');
    await assert.rejects(db.query('select email from auth.users'), { code: '42501' });
    await assert.rejects(db.query('select encrypted_password from auth.users'), { code: '42501' });
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated']) {
      const access = await db.query<{ allowed: boolean }>(
        `select has_any_column_privilege('${role}', 'auth.users', 'SELECT') allowed`);
      assert.equal(access.rows[0].allowed, false);
    }
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


test('start notes survive disk, backup and reinstall; an older server leaves them pending without dropping data', async () => {
  const storage = disk();
  const local = createFloatArchive(storage);
  await local.select('A');
  const trip = { ...summary(), putInId: null, putInName: null, startNote: 'Recording started 3.2 mi below Akers' };
  await local.addCompleted(trip, 'A');
  const remote = server();
  let supportsNotes = false;
  let writes = 0;
  const api: ArchiveTransport = { ...remote.api, write: rows => uploadFloatArchive(rows, {
    capabilities: async () => supportsNotes ? { startNote: true } : null,
    write: async batch => {
      writes += 1;
      assert.equal(archiveBatch.safeParse({ rows: batch }).success, true);
      return remote.api.write(batch);
    },
  }) };
  await local.sync('A', api);
  assert.equal(writes, 0, 'Do not send unsupported fields or a summary stripped of its note');
  assert.equal(local.snapshot().rows[0].dirty, true);
  assert.equal(local.snapshot().rows[0].backupError, undefined, 'Not a permanent row rejection');
  assert.match(local.snapshot().error!, /saved on this phone/);
  const restarted = createFloatArchive(storage);
  await restarted.select('A');
  assert.deepEqual(restarted.snapshot().rows[0].payload, trip);
  supportsNotes = true;
  await restarted.sync('A', api, true);
  assert.equal(restarted.snapshot().rows[0].dirty, false);
  assert.deepEqual(remote.rows.get('trip')!.payload, trip);
  const reinstalled = createFloatArchive(disk());
  await reinstalled.select('A');
  await reinstalled.sync('A', api);
  assert.deepEqual(reinstalled.snapshot().rows[0].payload, trip);
});

test('on an older server a noted recap waits alone; other recaps and deletions still back up', async () => {
  // A recap with a start note sat in the first batch (newest first) and the
  // capability refusal aborted the whole sync, so a deletion and an ordinary
  // recap behind it waited for the backend upgrade too.
  const local = createFloatArchive(disk());
  await local.select('A');
  const remote = server();
  await local.addCompleted(summary('old-trip'), 'A');
  await local.sync('A', remote.api);
  await local.remove('old-trip', 'A');
  await local.addCompleted(summary('plain-trip'), 'A');
  await local.addCompleted({ ...summary('noted-trip'), putInId: null, putInName: null, startNote: 'Recording started 3.2 mi below Akers' }, 'A');
  // A clock past the module's capability cache, which an earlier test filled
  // with a positive answer.
  const later = () => Date.now() + 60 * 60_000;
  const api: ArchiveTransport = { ...remote.api, write: rows => uploadFloatArchive(rows, {
    capabilities: async () => null,
    write: batch => remote.api.write(batch),
  }, later) };
  await local.sync('A', api, true);
  const row = (id: string) => local.snapshot().rows.find(r => r.id === id)!;
  assert.equal(row('plain-trip').dirty, false, 'an ordinary recap is not held behind the noted one');
  assert.equal(row('old-trip').dirty, false, 'nor is a deletion');
  assert.equal(remote.rows.get('old-trip')!.deleted, true);
  assert.equal(row('noted-trip').dirty, true, 'the noted recap waits for a server that takes the note');
  assert.equal(remote.rows.has('noted-trip'), false);
  assert.match(local.snapshot().error!, /saved on this phone/);
});

test('old recaps and deletions keep their upload contract without a capability request', async () => {
  const old = summary();
  const rows: ArchiveRow[] = [
    { id: old.id, kind: 'completed', payload: old, deleted: false, contributionVersion: null },
    { id: 'deleted', kind: 'completed', payload: null, deleted: true, contributionVersion: null },
  ];
  let sent: ArchiveRow[] = [];
  await uploadFloatArchive(rows, {
    capabilities: async () => { throw new Error('Old records must not need a capability check'); },
    write: async batch => { sent = batch; return batch.map(() => ({ status: 'accepted' })); },
  });
  assert.deepEqual(sent, rows);
  const stored = createFloatArchive(disk());
  await stored.select('A');
  await stored.sync('A', { read: async () => ({ rows: sent, preference: { enabled: false, version: null } }),
    write: async () => [], consent: async () => ({ enabled: false, version: null }) });
  assert.deepEqual(stored.snapshot().rows.find(row => row.id === old.id)!.payload, old);
});

/** Just enough of a PostgREST client for waterAtStart: one canned answer per table. */
function waterDb(tables: Record<string, unknown>) {
  return {
    from(table: string) {
      const answer = { data: tables[table] ?? null, error: null };
      const chain = {
        select: () => chain, eq: () => chain, lte: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => answer,
        then: (resolve: (v: typeof answer) => unknown) => Promise.resolve(answer).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

test('server fallback labels the anchor reading with its own ladder, flood stage first', async () => {
  const startedAt = Date.parse('2026-10-26T15:00:00Z');
  const trip = { riverSlug: 'current', firstMile: 10, startedAt } as CompletedFloat;
  const link = {
    gauge_station_id: 'station-uuid', threshold_unit: 'ft', level_too_low: 1, level_low: 2, level_optimal_min: 3,
    level_optimal_max: 5, level_high: 6, level_dangerous: 9, flood_stage_ft: 7,
    gauge_stations: { name: 'Current River at Akers', usgs_site_id: '07064533' },
  };
  const reading = (ft: number) => [{ reading_timestamp: '2026-10-26T14:50:00Z', gauge_height_ft: ft, discharge_cfs: 400, qualifiers: [] }];
  const flowing = await waterAtStart(waterDb({ rivers: { id: 'r' }, river_gauges: link, gauge_readings: reading(4) }), trip);
  assert.equal(flowing?.conditionCode, 'flowing');
  assert.equal(flowing?.usgsSiteId, '07064533');
  assert.equal(flowing?.gaugeStationId, 'station-uuid');
  const flood = await waterAtStart(waterDb({ rivers: { id: 'r' }, river_gauges: link, gauge_readings: reading(7.5) }), trip);
  assert.equal(flood?.conditionCode, 'dangerous', 'NWS flood stage outranks the ladder');
  const unrated = await waterAtStart(waterDb({
    rivers: { id: 'r' },
    river_gauges: { ...link, level_too_low: null, level_low: null, level_optimal_min: null, level_optimal_max: null, level_high: null, level_dangerous: null, flood_stage_ft: null },
    gauge_readings: reading(4),
  }), trip);
  assert.ok(unrated && !('conditionCode' in unrated), 'an unrated gauge keeps its reading, unlabelled');
});

const recapContext = {
  startCondition: {
    code: 'flowing' as const, gaugeName: 'Current River at Akers', usgsSiteId: '07064533', heightFt: 2.31,
    dischargeCfs: 412, observedAt: '2026-10-26T14:30:00.000Z', accuracyWarning: false,
  },
  riverSpan: { firstMile: 0, lastMile: 134, firstName: 'Baptist Camp', lastName: 'Big Spring', calibration: 'deadbeef' },
  coveredMiles: [[10, 14.5], [15, 19.8]] as [number, number][],
  startWeather: { tempF: 61, precipIn1h: 0, observedAt: '2026-10-26T14:00:00.000Z' },
};
const completedRow = (payload: unknown) => ({ rows: [{ id: 'trip', kind: 'completed', deleted: false, contributionVersion: null, payload }] });

test('recap context: accepted with bounds, rejected when malformed', () => {
  assert.equal(archiveBatch.safeParse(completedRow({ ...summary(), ...recapContext })).success, true);
  assert.equal(archiveBatch.safeParse(completedRow({ ...summary(), startCondition: null, riverSpan: null, coveredMiles: null, startWeather: null })).success, true);
  assert.equal(
    archiveBatch.safeParse(completedRow({ ...summary(), ...recapContext, startCondition: { ...recapContext.startCondition, usgsSiteId: null } })).success,
    true,
    'a USACE station has no USGS id',
  );
  const bad: Record<string, unknown>[] = [
    { startCondition: { ...recapContext.startCondition, code: 'unknown' } },
    { startCondition: { ...recapContext.startCondition, extra: 1 } },
    { startCondition: { ...recapContext.startCondition, dischargeCfs: -5 } },
    { riverSpan: { ...recapContext.riverSpan, lastMile: 0 } },
    { riverSpan: { ...recapContext.riverSpan, calibration: 'DEADBEEF' } },
    { riverSpan: { firstMile: 0, lastMile: 134, firstName: 'Baptist Camp', lastName: 'Big Spring' } },
    { coveredMiles: [[10, 15], [14, 20]] },
    { coveredMiles: [[15, 10]] },
    { coveredMiles: Array.from({ length: 33 }, (_, i) => [i * 2, i * 2 + 1]) },
    { startWeather: { ...recapContext.startWeather, precipIn1h: 50 } },
    { startWeather: { ...recapContext.startWeather, lat: 37 } },
  ];
  for (const fields of bad) assert.equal(archiveBatch.safeParse(completedRow({ ...summary(), ...fields })).success, false, JSON.stringify(fields));
});

test('recap context waits for a server that names it; deletions do not', async () => {
  const later = () => Date.now() + 2 * 60 * 60_000;
  const rows: ArchiveRow[] = [{ id: 'trip', kind: 'completed', payload: { ...summary(), ...recapContext }, deleted: false, contributionVersion: null }];
  let writes = 0;
  const write = async (batch: ArchiveRow[]) => {
    writes += 1;
    assert.equal(archiveBatch.safeParse({ rows: batch }).success, true);
    return batch.map(() => ({ status: 'accepted' as const }));
  };
  await assert.rejects(uploadFloatArchive(rows, { capabilities: async () => ({ startNote: true }), write }, later), /saved on this phone/);
  assert.equal(writes, 0, 'a notes-only server is not asked to take the recap context, nor sent it stripped');
  await uploadFloatArchive(rows, { capabilities: async () => ({ startNote: true, recapContext: true }), write }, later);
  assert.equal(writes, 1);

  const local = createFloatArchive(disk());
  await local.select('A');
  const remote = server();
  await local.addCompleted(summary('old-trip'), 'A');
  await local.sync('A', remote.api);
  await local.remove('old-trip', 'A');
  await local.addCompleted({ ...summary('recap-trip'), ...recapContext }, 'A');
  const api: ArchiveTransport = { ...remote.api, write: batch => uploadFloatArchive(batch, {
    capabilities: async () => ({ startNote: true }),
    write: b => remote.api.write(b),
  }, () => Date.now() + 4 * 60 * 60_000) };
  await local.sync('A', api, true);
  const row = (id: string) => local.snapshot().rows.find(r => r.id === id)!;
  assert.equal(remote.rows.get('old-trip')!.deleted, true, 'the deletion is not held behind the recap');
  assert.equal(row('recap-trip').dirty, true);
  assert.deepEqual(row('recap-trip').payload, { ...summary('recap-trip'), ...recapContext }, 'nothing stripped on the phone');
});

test('route/weather recap additions are bounded summaries, never coordinates or a trace', () => {
  const routeSnapshot = { startMile: 10, takeOutMile: 20, startName: 'Akers', calibration: 'deadbeef' };
  const startWeather = { ...recapContext.startWeather, conditionIcon: '02d' };
  const base = { ...summary(), routeSnapshot, startWeather };
  assert.equal(archiveBatch.safeParse(completedRow(base)).success, true);
  for (const fields of [
    { routeSnapshot: { ...routeSnapshot, takeOutMile: 10 } },
    { routeSnapshot: { ...routeSnapshot, startMile: NaN } },
    { routeSnapshot: { ...routeSnapshot, calibration: 'no' } },
    { routeSnapshot: { ...routeSnapshot, coordinates: [[-91, 37]] } },
    { startWeather: { ...startWeather, conditionIcon: 'https://example.com/icon.png' } },
  ]) assert.equal(archiveBatch.safeParse(completedRow({ ...base, ...fields })).success, false);
});

test('new recap details wait for server support without silently losing fields', async () => {
  const payload = { ...summary(), routeSnapshot: { startMile: 10, takeOutMile: 20, startName: 'Akers', calibration: 'deadbeef' },
    startWeather: { ...recapContext.startWeather, conditionIcon: '02d' } };
  const rows: ArchiveRow[] = [{ id: 'trip', kind: 'completed', deleted: false, contributionVersion: null, payload }];
  const now = () => Date.now() + 10 * 60 * 60_000;
  let writes = 0;
  const write = async (batch: ArchiveRow[]) => {
    writes++;
    assert.deepEqual(batch[0].payload, payload);
    assert.equal(archiveBatch.safeParse({ rows: batch }).success, true);
    return [{ status: 'accepted' as const }];
  };
  await assert.rejects(uploadFloatArchive(rows, { capabilities: async () => ({ recapContext: true }), write }, now), /saved on this phone/);
  assert.equal(writes, 0);
  await uploadFloatArchive(rows, { capabilities: async () => ({ recapContext: true, recapRouteWeather: true }), write }, now);
  assert.equal(writes, 1);
  await uploadFloatArchive([{ ...rows[0], payload: null, deleted: true }], {
    capabilities: async () => { throw new Error('Deletion must not wait for new capabilities'); },
    write: async () => [{ status: 'accepted' as const }],
  }, now);
});

test('historical map calibration is bounded, strict and coordinate-free', () => {
  const routeSnapshot = { startMile: 10, takeOutMile: 20, startName: 'Akers', calibration: 'deadbeef',
    downloadKey: 'saved-package', mapAnchors: [{ id: 'akers', riverMile: 10 }, { id: 'pulltite', riverMile: 20 }] };
  const base = { ...summary(), routeSnapshot };
  assert.equal(archiveBatch.safeParse(completedRow(base)).success, true);
  for (const mapAnchors of [[], [routeSnapshot.mapAnchors[0]],
    [{ id: 'akers', riverMile: 10 }, { id: 'akers', riverMile: 20 }],
    [...routeSnapshot.mapAnchors].reverse(),
    [{ id: 'akers', riverMile: 10, lngLat: [-91, 37] }, routeSnapshot.mapAnchors[1]],
    Array.from({ length: 129 }, (_, i) => ({ id: 'a-' + i, riverMile: i })),
  ]) assert.equal(archiveBatch.safeParse(completedRow({ ...base, routeSnapshot: { ...routeSnapshot, mapAnchors } })).success, false);
  assert.equal(archiveBatch.safeParse(completedRow({ ...base,
    routeSnapshot: { ...routeSnapshot, downloadKey: 'https://example.com/route' } })).success, false);
});

test('calibration metadata waits for its own server capability, while deletions still sync', async () => {
  const payload = { ...summary(), routeSnapshot: { startMile: 10, takeOutMile: 20, startName: 'Akers', calibration: 'deadbeef',
    downloadKey: 'saved-package', mapAnchors: [{ id: 'akers', riverMile: 10 }, { id: 'pulltite', riverMile: 20 }] } };
  const rows: ArchiveRow[] = [{ id: 'trip', kind: 'completed', deleted: false, contributionVersion: null, payload }];
  const now = () => Date.now() + 20 * 60 * 60_000;
  let writes = 0;
  const write = async (batch: ArchiveRow[]) => {
    writes++;
    assert.deepEqual(batch[0].payload, payload);
    assert.equal(archiveBatch.safeParse({ rows: batch }).success, true);
    return [{ status: 'accepted' as const }];
  };
  await assert.rejects(uploadFloatArchive(rows, { capabilities: async () => ({ recapRouteWeather: true }), write }, now), /saved on this phone/);
  assert.equal(writes, 0);
  await uploadFloatArchive(rows, { capabilities: async () => ({ recapRouteWeather: true, recapMapCalibration: true }), write }, now);
  assert.equal(writes, 1);
  await uploadFloatArchive([{ ...rows[0], payload: null, deleted: true }], {
    capabilities: async () => { throw new Error('Deletion must not wait for map support'); },
    write: async () => [{ status: 'accepted' as const }],
  }, now);
});
