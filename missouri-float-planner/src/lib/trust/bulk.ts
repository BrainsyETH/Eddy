// src/lib/trust/bulk.ts
// The guard on resolving a group of findings at once.
//
// ── Why bulk resolve needs a guard the single one does not ───────────────
//
// Resolving one finding is a click against something you are looking at.
// Resolving a group is a click against a COUNT, and the count is what you
// actually verified — "these 24 are all the same false positive, and I have
// confirmed the cause". If the set changed between the page loading and the
// button being pressed, that verification no longer covers what is about to be
// resolved.
//
// The realistic way that happens here is mundane rather than adversarial: the
// hourly tick lands between render and click, and raises a 25th finding under
// the same rule. Resolving 25 when you checked 24 would silently close
// something nobody looked at — which, for a system whose entire argument is
// that a wrongly-closed finding is worse than an open one, is the failure this
// module exists to prevent.
//
// So the caller sends the count it saw, and a mismatch refuses rather than
// proceeding. Re-reading the page and clicking again is cheap; an unnoticed
// resolution is not.

export interface BulkPlanInput {
  /** Finding ids currently matching the filter, read inside the request. */
  matchedIds: readonly string[];
  /** How many the operator was looking at when they decided. */
  expectedCount: number;
  /** Refuse groups larger than this outright. */
  maxBatch?: number;
}

export type BulkRefusal =
  | { reason: 'count_mismatch'; expected: number; actual: number }
  | { reason: 'empty' }
  | { reason: 'too_large'; actual: number; max: number };

export type BulkPlan =
  | { ok: true; ids: string[] }
  | { ok: false; refusal: BulkRefusal };

/**
 * A ceiling that is high enough for the real cases and low enough that a
 * malformed filter cannot close the whole ledger. The largest genuine batch so
 * far was 24 — every river carrying one false finding from a broken check.
 */
export const DEFAULT_MAX_BATCH = 200;

export function planBulkAction(input: BulkPlanInput): BulkPlan {
  const ids = [...new Set(input.matchedIds)];
  const max = input.maxBatch ?? DEFAULT_MAX_BATCH;

  if (ids.length === 0) {
    return { ok: false, refusal: { reason: 'empty' } };
  }
  if (ids.length > max) {
    return { ok: false, refusal: { reason: 'too_large', actual: ids.length, max } };
  }
  if (ids.length !== input.expectedCount) {
    return {
      ok: false,
      refusal: { reason: 'count_mismatch', expected: input.expectedCount, actual: ids.length },
    };
  }

  return { ok: true, ids };
}

export function describeRefusal(refusal: BulkRefusal): string {
  switch (refusal.reason) {
    case 'empty':
      return 'Nothing matched — the findings may already have been resolved.';
    case 'too_large':
      return `${refusal.actual} findings matched, above the ${refusal.max} limit for one action. Narrow the filter.`;
    case 'count_mismatch':
      return `You confirmed ${refusal.expected} finding(s) but ${refusal.actual} match now — the set changed, most likely a scheduled run landing in between. Refresh and check again.`;
  }
}
