import assert from 'node:assert/strict';
import test from 'node:test';
import { isLowQuota, noteUsgsQuota, readUsgsQuota, resetUsgsQuotaLog } from './usgs-quota';

const NOW = Date.UTC(2026, 10, 11, 18, 0, 0);

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

test('reads the allowance api.data.gov reports', () => {
  assert.deepEqual(
    readUsgsQuota(
      headers({
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '742',
        date: new Date(NOW - 2_000).toUTCString(),
      }),
      NOW,
    ),
    { limit: 1000, remaining: 742 },
  );
});

test('a response without the headers reports nothing', () => {
  assert.equal(readUsgsQuota(headers({ date: new Date(NOW).toUTCString() }), NOW), null);
  assert.equal(readUsgsQuota(headers({ 'x-ratelimit-limit': 'lots', 'x-ratelimit-remaining': '1' }), NOW), null);
});

test('a replay from the fetch cache is not a reading', () => {
  // A stored response keeps the headers it was stored with, so its "remaining"
  // describes an hour that may be long over.
  assert.equal(
    readUsgsQuota(
      headers({
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '3',
        date: new Date(NOW - 10 * 60_000).toUTCString(),
      }),
      NOW,
    ),
    null,
  );
});

test('low means under a fifth of the allowance', () => {
  assert.equal(isLowQuota({ limit: 1000, remaining: 199 }), true);
  assert.equal(isLowQuota({ limit: 1000, remaining: 200 }), false);
});

function captureLogs(run: () => void): string[] {
  const lines: string[] = [];
  const original = { info: console.info, warn: console.warn, log: console.log };
  const push = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.info = push;
  console.warn = push;
  console.log = push;
  try {
    run();
  } finally {
    Object.assign(console, original);
  }
  return lines.filter((line) => line.includes('[usgs-quota]'));
}

function response(remaining: number, at = NOW, status = 200): Response {
  return new Response(null, {
    status,
    headers: {
      'x-ratelimit-limit': '1000',
      'x-ratelimit-remaining': String(remaining),
      date: new Date(at).toUTCString(),
    },
  });
}

test('routine readings are logged at most once a minute', () => {
  resetUsgsQuotaLog();
  const lines = captureLogs(() => {
    noteUsgsQuota(response(900), NOW);
    noteUsgsQuota(response(899), NOW + 1_000);
    noteUsgsQuota(response(880, NOW + 61_000), NOW + 61_000);
  });
  assert.equal(lines.length, 2);
});

test('the first low reading is logged at once', () => {
  resetUsgsQuotaLog();
  const lines = captureLogs(() => {
    noteUsgsQuota(response(900), NOW);
    noteUsgsQuota(response(50), NOW + 1_000);
    noteUsgsQuota(response(49), NOW + 2_000);
  });
  assert.equal(lines.length, 2);
  assert.match(lines[1], /allowance low/);
});

test('a 429 is logged even with no allowance headers', () => {
  resetUsgsQuotaLog();
  const lines = captureLogs(() => {
    noteUsgsQuota(new Response(null, { status: 429, headers: { 'retry-after': '30' } }), NOW);
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /allowance low/);
});
