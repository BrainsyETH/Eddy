// src/lib/rate-limit.ts
// Rate limiter for API routes.
//
// Backend selection:
// - When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, limits are
//   enforced in Upstash Redis (fixed window via INCR + PEXPIRE NX), so they
//   hold globally across all serverless instances.
// - Otherwise falls back to a per-instance in-memory Map. On Vercel this is
//   best-effort only (each lambda instance has its own store), which is why
//   the Redis path exists — configure Upstash in production.
//
// Failure policy (audit F14): read-mostly routes fail open — a limiter outage
// must not take down public condition data. Costly/storage/auth routes (login,
// upload, reports, feedback, subscribe, chat) pass { failClosed: true } and get
// a 503 when Redis is configured but erroring, because unlimited access to
// those endpoints is worse than a brief write outage.

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leak (in-memory
// fallback only; harmless no-op churn when Redis is configured). unref() so
// this housekeeping timer never holds the process (or a test run) open.
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  });
}, 5 * 60 * 1000).unref?.();

function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfterSeconds)),
      },
    }
  );
}

/**
 * Fixed-window counter in Upstash Redis via the REST pipeline API.
 * Returns the current count and remaining window, or null on any failure.
 */
async function redisIncrement(
  key: string,
  windowMs: number
): Promise<{ count: number; ttlMs: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', `rl:${key}`],
        // NX: only set the expiry when the key has none (i.e. window start)
        ['PEXPIRE', `rl:${key}`, String(windowMs), 'NX'],
        ['PTTL', `rl:${key}`],
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });

    if (!res.ok) {
      logger.warn('[RateLimit] Upstash error', { status: res.status });
      return null;
    }

    const results = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = results[0]?.result;
    const ttlMs = results[2]?.result;
    if (typeof count !== 'number') return null;
    return { count, ttlMs: typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : windowMs };
  } catch (e) {
    logger.warn('[RateLimit] Upstash request failed', { error: String(e) });
    return null;
  }
}

function limiterUnavailable(): NextResponse {
  return NextResponse.json(
    { error: 'Service temporarily unavailable. Please try again shortly.' },
    { status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'private, no-store' } }
  );
}

export interface RateLimitOptions {
  /**
   * When true and Upstash is configured but erroring/unreachable, reject with
   * 503 instead of allowing the request. Use for costly, storage-writing, and
   * authentication endpoints where "unlimited while the limiter is down" is a
   * worse failure than a brief write outage. Read-mostly routes should leave
   * this unset and fail open.
   */
  failClosed?: boolean;
}

// Warn (not throw) once per process when a fail-closed route runs in
// production without a global limiter — per-instance limiting still applies,
// but fan-out across serverless instances is possible (audit F14).
let warnedNoGlobalLimiter = false;

/**
 * Rate limiter. Returns null if allowed, or a 429/503 NextResponse if the
 * request should be rejected.
 *
 * @param key Unique key for this rate limit bucket (e.g., IP + route)
 * @param limit Max requests per window
 * @param windowMs Window duration in milliseconds
 * @param options Failure policy — see RateLimitOptions.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options?: RateLimitOptions
): Promise<NextResponse | null> {
  // Global limiter when Upstash is configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const result = await redisIncrement(key, windowMs);
    if (result === null) {
      if (options?.failClosed) {
        logger.error('[RateLimit] limiter unavailable; failing closed', undefined, { key });
        return limiterUnavailable();
      }
      return null;
    }
    if (result.count > limit) {
      return tooManyRequests(Math.ceil(result.ttlMs / 1000));
    }
    return null;
  }

  if (options?.failClosed && process.env.NODE_ENV === 'production' && !warnedNoGlobalLimiter) {
    warnedNoGlobalLimiter = true;
    logger.warn(
      '[RateLimit] fail-closed route running without Upstash configured; ' +
        'limits are per-instance only — configure UPSTASH_REDIS_REST_URL/TOKEN'
    );
  }

  // In-memory fallback (per-instance; dev / not-yet-configured environments)
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;

  if (entry.count > limit) {
    return tooManyRequests(Math.ceil((entry.resetAt - now) / 1000));
  }

  return null;
}

/**
 * Extracts a rate limit key from a request (IP-based).
 */
export function getClientIp(request: Request): string {
  // Vercel overwrites this header at the trusted edge. Generic
  // X-Forwarded-For is ignored unless a self-hosted deployment explicitly
  // opts in, since callers can otherwise choose their own limiter key.
  const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) return vercelForwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  if (process.env.TRUST_X_FORWARDED_FOR === 'true') {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}
