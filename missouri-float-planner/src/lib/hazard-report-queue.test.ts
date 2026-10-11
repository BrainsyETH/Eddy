// missouri-float-planner/src/lib/hazard-report-queue.test.ts
//
// Covers eddy-ios/src/lib/hazardReportQueue.ts: hazard reports from Float Mode
// are saved on the phone first, sent when there is signal, and sent once.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORTS_KEY,
  createReportQueue,
  isFinalRefusal,
  newReportId,
  reportDescription,
  retryDelay,
  type HazardReport,
  type ReportStorage,
  type SendOutcome,
} from '../../../eddy-ios/src/lib/hazardReportQueue';

const T0 = Date.parse('2026-07-04T14:00:00Z');

function disk() {
  const data = new Map<string, string>();
  const storage: ReportStorage & { data: Map<string, string>; failWrites: boolean } = {
    data,
    failWrites: false,
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) {
      if (storage.failWrites) throw new Error('disk full');
      data.set(key, value);
    },
  };
  return storage;
}

const input = (id: string) => ({
  id,
  riverSlug: 'current',
  riverName: 'Current River',
  latitude: 37.2,
  longitude: -91.4,
  accuracyMeters: 12,
  capturedAt: new Date(T0).toISOString(),
  riverMile: 23.4,
  kind: 'strainer' as const,
  note: 'River left, past the gravel bar',
});

test('a report is saved on the phone before anything is sent, and waits with no signal', async () => {
  const storage = disk();
  let now = T0;
  const queue = createReportQueue(storage, async () => ({ kind: 'retry' }), () => {}, () => now);
  await queue.add(input('a'));
  await queue.flush();
  const [report] = queue.list();
  assert.equal(report.status, 'waiting');
  assert.equal(report.attempts, 1);
  assert.equal(report.nextAttemptAt, now + retryDelay(1));
  // On disk, so a relaunch still has it.
  const stored = JSON.parse(storage.data.get(REPORTS_KEY)!) as HazardReport[];
  assert.equal(stored[0].id, 'a');
  // Not retried before it is due.
  let calls = 0;
  const relaunched = createReportQueue(storage, async () => { calls += 1; return { kind: 'sent' }; }, () => {}, () => now);
  await relaunched.flush();
  assert.equal(calls, 0);
  now += retryDelay(1);
  await relaunched.flush();
  assert.equal(calls, 1);
  assert.equal(relaunched.list()[0].status, 'sent');
});

test('every attempt carries the same id, so a lost reply cannot file it twice', async () => {
  const ids: string[] = [];
  let now = T0;
  const outcomes: SendOutcome[] = [{ kind: 'retry' }, { kind: 'sent' }];
  const queue = createReportQueue(disk(), async (report) => { ids.push(report.id); return outcomes.shift()!; }, () => {}, () => now);
  await queue.add(input('same-id'));
  await queue.flush();
  now += retryDelay(1);
  await queue.flush();
  assert.deepEqual(ids, ['same-id', 'same-id']);
});

test('a refusal is final and keeps the server’s reason; network trouble is retried', async () => {
  assert.equal(isFinalRefusal(400), true);
  assert.equal(isFinalRefusal(undefined), false, 'no response at all is a network failure');
  assert.equal(isFinalRefusal(429), false, 'rate limited: try later');
  assert.equal(isFinalRefusal(408), false);
  assert.equal(isFinalRefusal(503), false);
  const queue = createReportQueue(disk(), async () => ({ kind: 'refused', message: 'Location must be within 2 km of the selected river' }), () => {}, () => T0);
  await queue.add(input('far'));
  await queue.flush();
  const [report] = queue.list();
  assert.equal(report.status, 'refused');
  assert.match(report.refusal!, /within 2 km/);
});

test('retries spread out and stop growing at half an hour', () => {
  assert.equal(retryDelay(1), 60_000);
  assert.equal(retryDelay(2), 120_000);
  assert.equal(retryDelay(3), 240_000);
  assert.equal(retryDelay(20), 30 * 60_000);
});

test('one send at a time, and a report added mid-send still goes out', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const sent: string[] = [];
  const storage = disk();
  const queue: ReturnType<typeof createReportQueue> = createReportQueue(storage, async (report) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (report.id === 'first') await queue.add(input('second'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    sent.push(report.id);
    return { kind: 'sent' };
  }, () => {}, () => T0);
  await queue.add(input('first'));
  await Promise.all([queue.flush(), queue.flush()]);
  await queue.flush();
  assert.equal(maxInFlight, 1);
  assert.deepEqual(sent, ['first', 'second']);
});

test('a report that cannot be saved is an error the sheet shows, not a silent loss', async () => {
  const storage = disk();
  storage.failWrites = true;
  const queue = createReportQueue(storage, async () => ({ kind: 'sent' }), () => {}, () => T0);
  await assert.rejects(queue.add(input('x')));
  assert.equal(queue.list().length, 0);
});

test('what a moderator reads, and ids that are valid UUIDs', () => {
  assert.equal(
    reportDescription({ kind: 'strainer', note: 'River left', riverMile: 23.44, accuracyMeters: 11.6 }),
    'Strainer or downed tree. River left. Reported from Float Mode (near river mile 23.4, GPS ±12 m).',
  );
  assert.equal(
    reportDescription({ kind: 'other', note: '', riverMile: null, accuracyMeters: null }),
    'Something else. Reported from Float Mode.',
  );
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (let i = 0; i < 50; i += 1) assert.match(newReportId(), uuid);
  assert.notEqual(newReportId(), newReportId());
});

test('a report is never sent before it is saved, and a failed save rolls back nothing else', async () => {
  // The reviewer's race: report B is added while report A is being sent. B's
  // save is slow and then fails. B must never be sent, and A must keep its
  // "sent" status.
  const data = new Map<string, string>();
  let releaseB: (() => void) | null = null;
  const storage: ReportStorage = {
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) {
      if (value.includes('"id":"B"') && !value.includes('"status":"sent"')) {
        await new Promise<void>((resolve) => { releaseB = resolve; });
        throw new Error('disk full');
      }
      data.set(key, value);
    },
  };
  const sent: string[] = [];
  let finishA: (() => void) | null = null;
  const queue = createReportQueue(storage, async (report) => {
    sent.push(report.id);
    if (report.id === 'A') await new Promise<void>((resolve) => { finishA = resolve; });
    return { kind: 'sent' };
  }, () => {}, () => T0);

  await queue.add(input('A'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sent, ['A']);
  // A is in flight; B is added and its save hangs.
  const addingB = queue.add(input('B'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(queue.list().some((r) => r.id === 'B'), false, 'not visible before it is on disk');
  finishA!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  releaseB!();
  await assert.rejects(addingB);
  await queue.flush();
  assert.deepEqual(sent, ['A'], 'B was never sent');
  assert.deepEqual(queue.list().map((r) => [r.id, r.status]), [['A', 'sent']]);
  const stored = JSON.parse(data.get(REPORTS_KEY)!) as HazardReport[];
  assert.deepEqual(stored.map((r) => [r.id, r.status]), [['A', 'sent']]);
});

test('background budget cancels a joined send without backoff or starting more reports', async () => {
  const storage = disk();
  const waiting = (id: string): HazardReport => ({ ...input(id), status: 'waiting', attempts: 0, nextAttemptAt: 0 });
  storage.data.set(REPORTS_KEY, JSON.stringify([waiting('first'), waiting('second')]));
  const sent: string[] = [];
  let abortSeen = false;
  let cancel = true;
  const queue = createReportQueue(storage, async (report, signal) => {
    sent.push(report.id);
    if (!cancel) return { kind: 'sent' };
    return new Promise<SendOutcome>((resolve) => {
      signal.addEventListener('abort', () => {
        abortSeen = true;
        resolve({ kind: 'retry' });
      }, { once: true });
    });
  }, () => {}, () => T0);
  const foregroundRun = queue.flush();
  await queue.flush(10);
  await foregroundRun;
  assert.equal(abortSeen, true);
  assert.deepEqual(sent, ['first']);
  assert.equal(queue.list()[0].attempts, 0);
  assert.equal(queue.list()[0].nextAttemptAt, 0);
  assert.equal(queue.list()[0].status, 'waiting');
  cancel = false;
  await queue.flush();
  assert.deepEqual(sent, ['first', 'first', 'second']);
  assert.ok(queue.list().every((report) => report.status === 'sent'));
});

test('a delivered response at the background deadline still records success', async () => {
  const queue = createReportQueue(disk(), async (_report, signal) => new Promise<SendOutcome>((resolve) => {
    signal.addEventListener('abort', () => resolve({ kind: 'sent' }), { once: true });
  }), () => {}, () => T0);
  await queue.add(input('landed'));
  await queue.flush(10);
  assert.equal(queue.list()[0].status, 'sent');
  assert.equal(queue.list()[0].attempts, 1);
});
