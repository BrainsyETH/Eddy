// src/lib/usfs/limiter.ts
// A deliberately slow, serial request limiter for the two undocumented
// availability endpoints Eddy reads.
//
// ── Why this exists at all ─────────────────────────────────────────────────
//
// Neither endpoint documents a rate limit, and neither returns a rate-limit
// header — UseDirect answers with a bare `server: Kestrel`, Recreation.gov with
// CloudFront and nothing else. There is no signal to react to, so the budget
// has to be conservative by construction rather than tuned against a ceiling.
//
// Recreation.gov's robots.txt names the exact path we read:
//
//     Disallow: /api
//     Disallow: /api/*
//     Crawl-delay: 10
//
// robots.txt binds crawlers, and a nightly refresh of ~15 known resources is
// not crawling by most readings — but the disallow is explicit and 10s is the
// operator's stated pacing, so that is what the federal adapter passes in. The
// community tools that circulate 1/sec are ten times faster than what the site
// asks for.
//
// ── The properties worth protecting ────────────────────────────────────────
//
// Serial, spaced, capped, and self-silencing. In particular SERIAL: a future
// refactor to `Promise.all(facilities.map(...))` would produce identical data
// and identical tests-that-check-output while turning a polite sync into a
// burst. `maxObservedConcurrency` exists so a test can assert the property
// directly rather than infer it.
//
// Jitter is ADDITIVE, never ±. Spacing may drift above the stated minimum but
// must never fall below it — a ±1s jitter on a 10s crawl-delay would spend half
// its requests in violation of the number it claims to honor.

/** Backoff schedule after a retryable failure, in ms. */
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000];

/** Statuses worth trying again. Everything else is the server saying "no". */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Thrown when a run would exceed its request ceiling. Aborts the source. */
export class BudgetExceededError extends Error {
  constructor(name: string, ceiling: number) {
    super(`${name}: request ceiling of ${ceiling} reached — aborting this run`);
    this.name = 'BudgetExceededError';
  }
}

/** Thrown once the breaker has tripped. Every later call fails immediately. */
export class CircuitOpenError extends Error {
  constructor(name: string, failures: number) {
    super(`${name}: circuit open after ${failures} consecutive failures`);
    this.name = 'CircuitOpenError';
  }
}

export interface LimiterOptions {
  /** Source name, used in error messages and logs. */
  name: string;
  /** Floor on the gap between two request starts. Never undercut. */
  minSpacingMs: number;
  /** Extra 0..jitterMs added to each gap so retries do not synchronize. */
  jitterMs?: number;
  /** Hard ceiling on attempts (retries included) for the whole run. */
  maxRequests: number;
  /** Consecutive task failures that trip the breaker. */
  breakerThreshold?: number;
  /** Attempts per task, including the first. */
  maxAttempts?: number;
  // Seams for deterministic tests. Production uses the real clock.
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface LimiterStats {
  /** Attempts actually made against the host, retries included. */
  attempts: number;
  /** Tasks that exhausted their retries. */
  failures: number;
  /** Highest number of simultaneously in-flight tasks. Must stay 1. */
  maxObservedConcurrency: number;
  open: boolean;
}

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
  stats(): LimiterStats;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return RETRYABLE_STATUS.has(err.status);
  // Network resets and AbortSignal.timeout both surface as plain errors here,
  // and both are exactly the case retrying was invented for.
  return true;
}

function retryAfterOf(err: unknown): number | null {
  return err instanceof HttpError ? err.retryAfterMs : null;
}

export function createLimiter(options: LimiterOptions): Limiter {
  const {
    name,
    minSpacingMs,
    jitterMs = 0,
    maxRequests,
    breakerThreshold = 3,
    maxAttempts = 3,
    sleep = realSleep,
    now = Date.now,
    random = Math.random,
  } = options;

  let chain: Promise<unknown> = Promise.resolve();
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let attempts = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  let open = false;
  let inFlight = 0;
  let maxObservedConcurrency = 0;

  async function execute<T>(task: () => Promise<T>): Promise<T> {
    if (open) throw new CircuitOpenError(name, consecutiveFailures);

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempts >= maxRequests) throw new BudgetExceededError(name, maxRequests);

      const gap = minSpacingMs + random() * jitterMs;
      const wait = lastStartedAt + gap - now();
      if (wait > 0) await sleep(wait);

      lastStartedAt = now();
      attempts++;
      inFlight++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, inFlight);

      try {
        const result = await task();
        inFlight--;
        consecutiveFailures = 0;
        return result;
      } catch (err) {
        inFlight--;
        lastError = err;
        if (!isRetryable(err) || attempt === maxAttempts) break;
        // The server's own number wins over ours whenever it gives one.
        await sleep(retryAfterOf(err) ?? BACKOFF_MS[attempt - 1] ?? 16_000);
      }
    }

    failures++;
    consecutiveFailures++;
    if (consecutiveFailures >= breakerThreshold) open = true;
    throw lastError;
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      // Queue behind whatever is already pending, in both directions, so one
      // rejected task cannot break the chain and let the next one start early.
      const next = chain.then(
        () => execute(task),
        () => execute(task),
      );
      chain = next.catch(() => undefined);
      return next;
    },
    stats: () => ({ attempts, failures, maxObservedConcurrency, open }),
  };
}

/** Parse `Retry-After`, which is either delta-seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

/**
 * The User-Agent both adapters send.
 *
 * Both endpoints answer a plain client — verified — so there is no reason to
 * impersonate a browser. If Eddy ever does cause load, whoever is looking at
 * the logs should be able to reach us rather than only block us.
 */
export const EDDY_USER_AGENT = 'Eddy/1.0 (+https://eddy.guide)';

/** Fetch JSON, converting a non-2xx into a typed, classifiable HttpError. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, headers, ...rest } = init;

  const response = await fetch(url, {
    ...rest,
    headers: { Accept: 'application/json', 'User-Agent': EDDY_USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new HttpError(
      response.status,
      parseRetryAfter(response.headers.get('retry-after'), Date.now()),
      `${url} responded ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}
