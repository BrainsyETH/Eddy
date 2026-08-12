import assert from 'node:assert/strict';
import test from 'node:test';
import { bucketedNow, changeOver, WINDOW_BUCKET_MS, type TimeseriesPoint } from './cda';

// changeOver reads a window the caller already holds — fetchLatestValue fetches
// eight hours and returns one point — and turns it into the movement figure the
// dam card shows beside the tailwater stage. Every case below is about the one
// way it can lie: reporting a change measured over a different span than the
// label claims.

const HOUR = 3_600_000;

/** An hourly series, oldest first, ending at `end`. */
function hourly(end: number, values: number[]): TimeseriesPoint[] {
  return values.map((value, i) => ({
    timestamp: end - (values.length - 1 - i) * HOUR,
    value,
  }));
}

const END = Date.parse('2026-08-12T18:00:00Z');

test('the change is measured over the window asked for', () => {
  // Table Rock's real shape on 2026-08-12: the stage falling as units wind
  // down. The 3-hour change is the last point minus the point three hours back,
  // not the full span of the series.
  const points = hourly(END, [710.79, 710.5, 709.2, 708.4, 708.21]);
  const change = changeOver(points, 3);
  assert.equal(change?.hours, 3);
  assert.ok(Math.abs(change!.delta - (708.21 - 710.5)) < 1e-9);
});

test('a rise is positive and a fall is negative', () => {
  // The sign is the whole message on a card someone wades against, so it is
  // pinned in both directions rather than assumed from one.
  assert.ok(changeOver(hourly(END, [700, 702, 704, 706]), 3)!.delta > 0);
  assert.ok(changeOver(hourly(END, [706, 704, 702, 700]), 3)!.delta < 0);
});

test('a series too short for the window yields nothing, not a shorter window', () => {
  // Silently measuring a "3-hour change" over 1 hour would understate a ramp by
  // two thirds at exactly the moment the water is coming up.
  assert.equal(changeOver(hourly(END, [700, 702]), 3), null);
  assert.equal(changeOver([], 3), null);
  assert.equal(changeOver(hourly(END, [700]), 3), null);
});

test('a gappy series yields nothing rather than a mislabelled span', () => {
  // Two points four hours apart cannot answer a 3-hour question. The nearest
  // point is an hour past the tolerance, so there is no honest answer to give.
  const gappy: TimeseriesPoint[] = [
    { timestamp: END - 4 * HOUR, value: 700 },
    { timestamp: END, value: 706 },
  ];
  assert.equal(changeOver(gappy, 3), null);
});

test('sub-hourly series still resolve the window exactly', () => {
  // CWMS publishes 30Minutes and 15Minutes series too, and both land on the
  // 3-hour mark exactly — the tolerance exists for publication slack, not to
  // let a coarse series through.
  const half: TimeseriesPoint[] = Array.from({ length: 7 }, (_, i) => ({
    timestamp: END - (6 - i) * (HOUR / 2),
    value: 700 + i,
  }));
  const change = changeOver(half, 3);
  assert.equal(change?.hours, 3);
  assert.equal(change?.delta, 6, 'exactly the span, not the whole series');
});

test('point order is not assumed', () => {
  // CDA returns oldest-first today. Nothing here depends on that continuing.
  const points = hourly(END, [700, 701, 702, 703]);
  const forwards = changeOver(points, 3);
  const backwards = changeOver([...points].reverse(), 3);
  assert.deepEqual(forwards, backwards);
});

test('a flat series reports zero rather than nothing', () => {
  // Clearwater measured -0.01 ft over 3 hours on 2026-08-12 — it is flood
  // control with no powerhouse, and its release holds for days. "No movement"
  // is a real answer and must not be confused with "could not measure".
  const change = changeOver(hourly(END, [453.46, 453.46, 453.45, 453.45]), 3);
  assert.notEqual(change, null);
  assert.ok(Math.abs(change!.delta) < 0.02);
});

// ── The window that made every request unique ──────────────────────────────

test('a live window floors to the bucket so repeat reads share a URL', () => {
  // begin/end are serialised by toISOString() at millisecond precision, so a
  // window built from a bare `new Date()` produced a URL nobody would ever
  // request twice — and `next: { revalidate }` had nothing to match against.
  const base = Date.parse('2026-08-12T18:06:31.412Z');
  // 90 seconds later is still inside the 18:05 bucket — which is the point.
  const a = bucketedNow(base);
  const b = bucketedNow(base + 90_000);
  assert.equal(a.toISOString(), b.toISOString(), 'same bucket, same URL');
  assert.equal(a.toISOString(), '2026-08-12T18:05:00.000Z');
  assert.equal(a.getTime() % WINDOW_BUCKET_MS, 0, 'lands on a bucket boundary');
});

test('the bucket advances, so readings do not freeze', () => {
  // The other failure: a window so coarse the data stops moving. Crossing a
  // boundary has to produce a new URL or the cache becomes the source of truth.
  const base = Date.parse('2026-08-12T18:07:31.412Z');
  assert.notEqual(
    bucketedNow(base).toISOString(),
    bucketedNow(base + WINDOW_BUCKET_MS).toISOString()
  );
});

test('flooring never reaches forward past the real clock', () => {
  // `end` bounds what counts as "latest". Rounding it UP would ask CDA for a
  // window ending in the future and could admit a point that has not been
  // published, so the rounding is deliberately one-directional.
  for (const offset of [0, 1, 61_000, 299_999]) {
    const now = Date.parse('2026-08-12T18:00:00.000Z') + offset;
    assert.ok(bucketedNow(now).getTime() <= now, `bucket ran ahead at +${offset}ms`);
    assert.ok(now - bucketedNow(now).getTime() < WINDOW_BUCKET_MS, 'and never lags a full bucket');
  }
});
