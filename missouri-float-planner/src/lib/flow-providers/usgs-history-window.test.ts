import assert from 'node:assert/strict';
import test from 'node:test';
import { HISTORY_BUCKET_MS, UsgsProvider, rollingHistoryStart } from './usgs';

// The rolling-history window is the URL Next's fetch cache keys on. It used to
// be built from a bare Date.now(), so every request was its own URL and the
// cache never matched. These tests hold the two halves of the fix together:
// the URL is stable inside a bucket, and the answer is still the window the
// caller asked for.

const DAY = 24 * 60 * 60 * 1000;
// Mid-bucket on purpose, so flooring has something to do.
const NOW = Date.UTC(2026, 10, 11, 18, 47, 12, 345);

test('two requests inside one bucket share a start', () => {
  assert.equal(
    rollingHistoryStart(7, NOW).toISOString(),
    rollingHistoryStart(7, NOW + 90_000).toISOString(),
  );
});

test('the start moves on the bucket boundary, not later', () => {
  const start = rollingHistoryStart(7, NOW).getTime();
  assert.equal(start % HISTORY_BUCKET_MS, 0);
  assert.ok(start <= NOW - 7 * DAY, 'never asks for less than the window');
  assert.ok(NOW - 7 * DAY - start < HISTORY_BUCKET_MS, 'and never reaches back a full bucket');
  assert.notEqual(
    rollingHistoryStart(7, NOW).toISOString(),
    rollingHistoryStart(7, NOW + HISTORY_BUCKET_MS).toISOString(),
  );
});

interface Captured {
  urls: URL[];
  inits: Array<RequestInit | undefined>;
}

/** Run `fn` with the clock pinned and USGS answering `times` as 15-min points. */
async function withUsgs<T>(now: number, times: number[], fn: () => Promise<T>): Promise<{ result: T } & Captured> {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalMode = process.env.USGS_FLOW_API;
  const urls: URL[] = [];
  const inits: Array<RequestInit | undefined> = [];
  process.env.USGS_FLOW_API = 'modern-only';
  Date.now = () => now;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(new URL(typeof input === 'string' ? input : input.toString()));
    inits.push(init);
    return new Response(
      JSON.stringify({
        features: times.map((t) => ({
          properties: {
            monitoring_location_id: 'USGS-07019000',
            parameter_code: '00060',
            time: new Date(t).toISOString(),
            value: '100',
          },
        })),
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    return { result: await fn(), urls, inits };
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalMode === undefined) delete process.env.USGS_FLOW_API;
    else process.env.USGS_FLOW_API = originalMode;
  }
}

test('a rolling request asks USGS for the same URL a moment later', async () => {
  const first = await withUsgs(NOW, [NOW - DAY], () => new UsgsProvider().fetchHistory('07019000', 7));
  const second = await withUsgs(NOW + 90_000, [NOW - DAY], () => new UsgsProvider().fetchHistory('07019000', 7));
  assert.equal(first.urls.length, 1);
  assert.equal(first.urls[0].toString(), second.urls[0].toString());
  // The end stays open: flooring the start must not cut off anything recent.
  assert.match(first.urls[0].searchParams.get('datetime')!, /\/\.\.$/);
});

test('the extra reach of the floored start is trimmed back off', async () => {
  const exactStart = NOW - 7 * DAY;
  const { result } = await withUsgs(
    NOW,
    // One reading inside the floored-but-not-requested sliver, the boundary
    // itself, and the newest point USGS has.
    [exactStart - 60_000, exactStart, NOW - 30_000],
    () => new UsgsProvider().fetchHistory('07019000', 7),
  );
  assert.deepEqual(
    result?.readings.map((r) => r.timestamp),
    [new Date(exactStart).toISOString(), new Date(NOW - 30_000).toISOString()],
  );
});

test('an explicit window is sent exactly as asked', async () => {
  // Rounding a window someone typed would move the data they asked for.
  const from = new Date(NOW - 3 * DAY + 1234);
  const to = new Date(NOW - DAY + 567);
  const { urls } = await withUsgs(NOW, [NOW - 2 * DAY], () =>
    new UsgsProvider().fetchHistory('07019000', 7, { from, to }),
  );
  assert.equal(urls[0].searchParams.get('datetime'), `${from.toISOString()}/${to.toISOString()}`);
});

test('a history request carries a deadline', async () => {
  // fetchOgcItems had none, so a stalled USGS held the function open.
  const { inits } = await withUsgs(NOW, [NOW - DAY], () => new UsgsProvider().fetchHistory('07019000', 7));
  assert.ok(inits[0]?.signal instanceof AbortSignal);
});
