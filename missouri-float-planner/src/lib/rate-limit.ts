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
// Redis remains optional. When unavailable, the per-instance fallback keeps
// writes usable while still providing basic burst protection.

import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leak (in-memory
// fallback only; harmless no-op churn when Redis is configured).
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  });
}, 5 * 60 * 1000);

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
      console.warn(`[RateLimit] Upstash error ${res.status}; failing open`);
      return null;
    }

    const results = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = results[0]?.result;
    const ttlMs = results[2]?.result;
    if (typeof count !== 'number') return null;
    return { count, ttlMs: typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : windowMs };
  } catch (e) {
    console.warn('[RateLimit] Upstash request failed; failing open:', e);
    return null;
  }
}

/**
 * Rate limiter. Returns null if allowed, or a 429 NextResponse if limited.
 *
 * @param key Unique key for this rate limit bucket (e.g., IP + route)
 * @param limit Max requests per window
 * @param windowMs Window duration in milliseconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  // Global limiter when Upstash is configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const result = await redisIncrement(key, windowMs);
    if (result === null) return null;
    if (result.count > limit) {
      return tooManyRequests(Math.ceil(result.ttlMs / 1000));
    }
    return null;
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
