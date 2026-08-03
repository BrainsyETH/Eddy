import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BudgetExceededError,
  CircuitOpenError,
  HttpError,
  createLimiter,
  parseRetryAfter,
  type LimiterOptions,
} from './limiter';

// ── Why these tests are about behaviour, not output ────────────────────────
//
// Every assertion here guards a property that a refactor could destroy while
// leaving the availability data byte-for-byte identical. Swapping the serial
// chain for `Promise.all` still returns the right numbers; so does dropping the
// spacing to zero, or removing the ceiling. Only a test that watches HOW the
// requests were made can catch that, so this file watches a virtual clock and
// a concurrency counter rather than any fetched value.
//
// The clock is virtual because the real spacing is ten seconds. A faithful
// test of a 15-facility federal run would otherwise take two and a half
// minutes.

/** A limiter wired to a virtual clock. Returns the clock for assertions. */
function harness(overrides: Partial<LimiterOptions> = {}) {
  let clock = 0;
  const sleeps: number[] = [];

  const limiter = createLimiter({
    name: 'test',
    minSpacingMs: 1_000,
    maxRequests: 100,
    random: () => 0,
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...overrides,
  });

  return {
    limiter,
    sleeps,
    now: () => clock,
    /** Let time pass without a request, as a slow task would. */
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test('requests are spaced by at least the configured minimum', async () => {
  const h = harness({ minSpacingMs: 10_000 });
  const startedAt: number[] = [];

  for (let i = 0; i < 4; i++) {
    await h.limiter.run(async () => {
      startedAt.push(h.now());
    });
  }

  assert.equal(startedAt.length, 4);
  for (let i = 1; i < startedAt.length; i++) {
    const gap = startedAt[i] - startedAt[i - 1];
    assert.ok(gap >= 10_000, `gap ${i} was ${gap}ms, expected >= 10000ms`);
  }
});

test('jitter only ever adds to the gap, never subtracts', async () => {
  // A +/- jitter on a stated crawl-delay would spend half its requests below
  // the number it claims to honor. Worst case here is random() === 0.
  const h = harness({ minSpacingMs: 10_000, jitterMs: 1_000, random: () => 0 });
  const startedAt: number[] = [];

  for (let i = 0; i < 3; i++) {
    await h.limiter.run(async () => {
      startedAt.push(h.now());
    });
  }

  assert.ok(startedAt[1] - startedAt[0] >= 10_000);
  assert.ok(startedAt[2] - startedAt[1] >= 10_000);
});

test('a task that takes longer than the spacing does not incur extra delay', async () => {
  const h = harness({ minSpacingMs: 1_000 });

  await h.limiter.run(async () => h.advance(5_000));
  const before = h.sleeps.length;
  await h.limiter.run(async () => undefined);

  assert.equal(h.sleeps.length, before, 'should not sleep when already past the gap');
});

test('tasks run strictly one at a time even when queued together', async () => {
  // The regression this exists for: Promise.all over facilities.
  const h = harness({ minSpacingMs: 0 });

  await Promise.all(
    Array.from({ length: 8 }, () =>
      h.limiter.run(async () => {
        await Promise.resolve();
        await Promise.resolve();
      }),
    ),
  );

  assert.equal(h.limiter.stats().maxObservedConcurrency, 1);
  assert.equal(h.limiter.stats().attempts, 8);
});

test('a rejected task does not let the next one start early', async () => {
  const h = harness({ minSpacingMs: 1_000, maxAttempts: 1, breakerThreshold: 99 });
  const startedAt: number[] = [];

  await assert.rejects(
    h.limiter.run(async () => {
      startedAt.push(h.now());
      throw new HttpError(500, null, 'boom');
    }),
  );
  await h.limiter.run(async () => {
    startedAt.push(h.now());
  });

  assert.ok(startedAt[1] - startedAt[0] >= 1_000);
});

test('retryable statuses are retried, then surface the last error', async () => {
  const h = harness({ maxAttempts: 3, breakerThreshold: 99 });
  let calls = 0;

  const value = await h.limiter.run(async () => {
    calls++;
    if (calls < 3) throw new HttpError(503, null, 'unavailable');
    return 'ok';
  });

  assert.equal(value, 'ok');
  assert.equal(calls, 3);
  assert.equal(h.limiter.stats().attempts, 3, 'retries count against the budget');
});

test('non-retryable statuses fail on the first attempt', async () => {
  const h = harness({ maxAttempts: 3, breakerThreshold: 99 });
  let calls = 0;

  await assert.rejects(
    h.limiter.run(async () => {
      calls++;
      throw new HttpError(404, null, 'gone');
    }),
    /gone/,
  );

  assert.equal(calls, 1, '404 means the resource is absent, not busy');
});

test('Retry-After from the server wins over our backoff schedule', async () => {
  const h = harness({ maxAttempts: 2, breakerThreshold: 99 });
  let calls = 0;

  await h.limiter.run(async () => {
    calls++;
    if (calls === 1) throw new HttpError(429, 45_000, 'slow down');
    return 'ok';
  });

  assert.ok(h.sleeps.includes(45_000), `expected a 45s sleep, saw ${h.sleeps.join(',')}`);
});

test('the breaker opens after the configured consecutive failures', async () => {
  const h = harness({ maxAttempts: 1, breakerThreshold: 3 });
  const fail = () =>
    h.limiter.run(async () => {
      throw new HttpError(500, null, 'boom');
    });

  await assert.rejects(fail());
  await assert.rejects(fail());
  assert.equal(h.limiter.stats().open, false, 'still closed at two failures');

  await assert.rejects(fail());
  assert.equal(h.limiter.stats().open, true);

  // Once open, later work fails without touching the host at all.
  const attemptsWhenOpen = h.limiter.stats().attempts;
  await assert.rejects(fail(), CircuitOpenError);
  assert.equal(h.limiter.stats().attempts, attemptsWhenOpen, 'no further requests');
});

test('a success resets the consecutive-failure count', async () => {
  const h = harness({ maxAttempts: 1, breakerThreshold: 3 });

  await assert.rejects(
    h.limiter.run(async () => {
      throw new HttpError(500, null, 'boom');
    }),
  );
  await assert.rejects(
    h.limiter.run(async () => {
      throw new HttpError(500, null, 'boom');
    }),
  );
  await h.limiter.run(async () => 'ok');
  await assert.rejects(
    h.limiter.run(async () => {
      throw new HttpError(500, null, 'boom');
    }),
  );

  assert.equal(h.limiter.stats().open, false);
});

test('the request ceiling aborts the run rather than slowing it', async () => {
  // The guard for someone adding forty parks to the link table: fail loudly
  // instead of quietly becoming a hammer.
  const h = harness({ maxRequests: 3, breakerThreshold: 99 });

  for (let i = 0; i < 3; i++) await h.limiter.run(async () => undefined);
  await assert.rejects(h.limiter.run(async () => undefined), BudgetExceededError);
  assert.equal(h.limiter.stats().attempts, 3);
});

test('parseRetryAfter handles both delta-seconds and HTTP dates', () => {
  const now = Date.parse('2026-08-02T12:00:00Z');

  assert.equal(parseRetryAfter('30', now), 30_000);
  assert.equal(parseRetryAfter('Sun, 02 Aug 2026 12:01:00 GMT', now), 60_000);
  assert.equal(parseRetryAfter(null, now), null);
  assert.equal(parseRetryAfter('not-a-date', now), null);
  assert.equal(parseRetryAfter('-5', now), 0, 'never negative');
});
