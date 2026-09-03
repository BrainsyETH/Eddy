import assert from 'node:assert/strict';
import test from 'node:test';
import { shareInFlight } from '../../../eddy-ios/src/lib/shareInFlight';

// Covers eddy-ios/src/lib/shareInFlight.ts, run from here because the app has
// no test runner. These EXECUTE the join rules the dam detail and the river
// outlook both depend on; request-timing.test.ts pins the call sites by text.
//
// The rules were once written out by hand in both places, and the copies
// drifted: the outlook's key omitted the river, so every river's primary-gauge
// request shared one entry and a screen re-pointed mid-request could cache one
// river's outlook under another's name. A textual test over the call site
// passed throughout. These would not have.

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('concurrent askers for one key share one request', async () => {
  const inFlight = new Map<string, Promise<string>>();
  let starts = 0;
  const first = deferred<string>();

  const a = shareInFlight(inFlight, 'k', () => {
    starts += 1;
    return first.promise;
  });
  const b = shareInFlight(inFlight, 'k', () => {
    starts += 1;
    return first.promise;
  });

  assert.equal(starts, 1, 'the second asker must join, not start');
  assert.equal(a, b, 'both askers hold the same promise');
  first.resolve('answer');
  assert.equal(await a, 'answer');
  assert.equal(await b, 'answer');
});

test('different keys are different requests', async () => {
  // The outlook bug: two rivers, one key. With the river in the key they
  // cannot share.
  const inFlight = new Map<string, Promise<string>>();
  const a = shareInFlight(inFlight, 'current|', async () => 'current');
  const b = shareInFlight(inFlight, 'niangua|', async () => 'niangua');
  assert.notEqual(a, b);
  assert.equal(await a, 'current');
  assert.equal(await b, 'niangua');
});

test('the entry is cleared before any downstream handler runs, on success and on failure', async () => {
  const inFlight = new Map<string, Promise<string>>();
  const ok = deferred<string>();
  const request = shareInFlight(inFlight, 'k', () => ok.promise);
  assert.ok(inFlight.has('k'));

  let seenInHandler: boolean | null = null;
  const observed = request.then(() => {
    seenInHandler = inFlight.has('k');
  });
  ok.resolve('x');
  await observed;
  assert.equal(seenInHandler, false, 'a handler chained by a caller must find the entry gone');

  const bad = deferred<string>();
  const failing = shareInFlight(inFlight, 'k', () => bad.promise);
  let seenOnFailure: boolean | null = null;
  const observedFailure = failing.catch(() => {
    seenOnFailure = inFlight.has('k');
  });
  bad.reject(new Error('down'));
  await observedFailure;
  assert.equal(seenOnFailure, false, 'a failed request must not be handed to the next asker');
});

test('after settling, the next ask starts a new request', async () => {
  const inFlight = new Map<string, Promise<number>>();
  let starts = 0;
  await shareInFlight(inFlight, 'k', async () => ++starts);
  await shareInFlight(inFlight, 'k', async () => ++starts);
  assert.equal(starts, 2);
});

test('a rejection reaches every joiner, and nobody else', async () => {
  const inFlight = new Map<string, Promise<string>>();
  const bad = deferred<string>();
  const a = shareInFlight(inFlight, 'k', () => bad.promise);
  const b = shareInFlight(inFlight, 'k', () => bad.promise);
  const other = shareInFlight(inFlight, 'j', async () => 'fine');
  bad.reject(new Error('down'));
  await assert.rejects(a, /down/);
  await assert.rejects(b, /down/);
  assert.equal(await other, 'fine');
});

test('a request settling late does not evict a newer one under its key', async () => {
  // Retry after a failure starts a new request; if the OLD one's cleanup ran
  // after that (it cannot, in practice — the entry is cleared first — but the
  // guard costs nothing), it must not delete the new entry.
  const inFlight = new Map<string, Promise<string>>();
  const slow = deferred<string>();
  const first = shareInFlight(inFlight, 'k', () => slow.promise);
  // Simulate a replacement while the first is still in flight.
  const replacement = new Promise<string>(() => {});
  inFlight.set('k', replacement);
  slow.resolve('late');
  await first;
  assert.equal(inFlight.get('k'), replacement, 'the newer entry survives the older settle');
});

test('no caller signal: the helper takes none and a start with none is the contract', () => {
  // The rule is structural — shareInFlight has no way to be handed an abort
  // signal — so a screen unmounting cannot cancel a request another is
  // awaiting. Pinned here so the signature cannot quietly grow one.
  assert.equal(shareInFlight.length, 3);
});
