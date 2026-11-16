// src/lib/telemetry/usgs-quota.ts
// What USGS says is left of the hourly request allowance.
//
// One key (USGS_API_KEY) pays for the crons that keep every reading fresh AND
// for the live calls visitors trigger, and until this file nothing recorded how
// close that shared allowance runs to empty. api.waterdata.usgs.gov sits behind
// api.data.gov, which reports the allowance on every response it serves:
// X-RateLimit-Limit and X-RateLimit-Remaining.
//
// This only READS those headers and writes a log line. It is the measurement
// that says whether a request budget is worth building, not a budget.
//
// ── Why the Date header is checked ──────────────────────────────────────────
// A response served from Next's fetch cache replays the headers it was stored
// with, so its "remaining" is from whenever it was fetched. A stored response
// also carries its original Date, which is how a replay is told from a call
// that really reached USGS. A response with no Date is trusted: counting an
// occasional replay is better than discarding every reading.

import { logger } from '@/lib/logger';

export interface UsgsQuota {
  limit: number;
  remaining: number;
}

/** A response older than this was served from a cache, not by USGS just now. */
const FRESH_RESPONSE_MS = 60_000;
/** Below this share of the allowance the line is a warning, not information. */
export const LOW_QUOTA_SHARE = 0.2;
/** At most one routine line per instance per minute. */
const LOG_INTERVAL_MS = 60_000;

/** The allowance a response reports, or null when it reports none we can use. */
export function readUsgsQuota(headers: Headers, now = Date.now()): UsgsQuota | null {
  const rawLimit = headers.get('x-ratelimit-limit');
  const rawRemaining = headers.get('x-ratelimit-remaining');
  if (rawLimit === null || rawRemaining === null) return null;
  const limit = Number(rawLimit);
  const remaining = Number(rawRemaining);
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || limit <= 0 || remaining < 0) {
    return null;
  }
  const served = Date.parse(headers.get('date') ?? '');
  if (Number.isFinite(served) && now - served > FRESH_RESPONSE_MS) return null;
  return { limit, remaining };
}

export function isLowQuota(quota: UsgsQuota): boolean {
  return quota.remaining / quota.limit < LOW_QUOTA_SHARE;
}

let lastLoggedAt = 0;
let lastWasLow = false;

/**
 * Log the allowance a USGS response reports. Never throws: this is
 * instrumentation, and it must not be able to change what a caller receives.
 *
 * A 429 and the first reading below LOW_QUOTA_SHARE are logged at once;
 * everything else at most once a minute per instance.
 */
export function noteUsgsQuota(response: Response, now = Date.now()): void {
  try {
    const quota = readUsgsQuota(response.headers, now);
    const limited = response.status === 429;
    if (!quota && !limited) return;
    const low = limited || (quota ? isLowQuota(quota) : false);
    const due = now - lastLoggedAt >= LOG_INTERVAL_MS;
    if (!due && !(low && !lastWasLow)) return;
    lastLoggedAt = now;
    lastWasLow = low;
    const context = {
      limit: quota?.limit ?? null,
      remaining: quota?.remaining ?? null,
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
    };
    if (low) logger.warn('[usgs-quota] allowance low', context);
    else logger.info('[usgs-quota] allowance', context);
  } catch {
    /* instrumentation never changes application semantics */
  }
}

/** Test seam: forget what was last logged. */
export function resetUsgsQuotaLog(): void {
  lastLoggedAt = 0;
  lastWasLow = false;
}
