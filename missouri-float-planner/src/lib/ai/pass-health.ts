// src/lib/ai/pass-health.ts
// Whether a provider is still worth calling for the rest of one pass.
//
// ── The failure this exists for ────────────────────────────────────────────
//
// An override on another provider falls back to the code default when its call
// fails. That is enough when the provider answers quickly with a refusal: an
// exhausted prepaid balance is a 429 in milliseconds. It is not enough when the
// provider hangs. Each target then waits out the full call timeout before its
// fallback starts, the daily pass has dozens of targets and a five-minute
// limit, and the pass spends its whole budget finding out, one river at a
// time, what the first two already showed.
//
// So a pass counts consecutive failed CALLS per provider, and after
// TRIP_AFTER_FAILURES of them stops calling that provider: every remaining
// target goes straight to its fallback. One instance is made per pass, by
// resolveModels(), which every entrypoint already calls exactly once.
//
// ── What counts ────────────────────────────────────────────────────────────
//
// A call that threw: a timeout, a network error, a 4xx or 5xx. A missing API
// key trips at once, since it cannot fix itself mid-pass.
//
// Not a response the caller judged unusable (empty, cut off, missing a block).
// That is about one answer, the provider is plainly up, and the next river may
// be fine. It resets the count like any other completed call.
//
// Pure, with no clock: a pass is short, and "for the rest of this pass" is the
// whole policy. A later pass starts with a fresh instance and tries again.

import type { Provider } from '@/lib/ai/model-registry';

/**
 * Consecutive failed calls before a provider is skipped. Two, not one, so a
 * single transient error costs one fallback rather than the provider for the
 * whole pass. With N targets in flight at once, up to N - 1 further calls may
 * already be waiting when the second failure lands.
 */
export const TRIP_AFTER_FAILURES = 2;

export class PassHealth {
  private readonly consecutiveFailures = new Map<Provider, number>();
  private readonly skipped = new Set<Provider>();

  /** True once this provider should not be called again in this pass. */
  skips(provider: Provider): boolean {
    return this.skipped.has(provider);
  }

  /** A call to this provider completed, whatever its answer was worth. */
  succeeded(provider: Provider): void {
    this.consecutiveFailures.set(provider, 0);
  }

  /** A call to this provider threw. */
  failed(provider: Provider): void {
    const count = (this.consecutiveFailures.get(provider) ?? 0) + 1;
    this.consecutiveFailures.set(provider, count);
    if (count >= TRIP_AFTER_FAILURES) this.skip(provider, `${count} consecutive failed calls`);
  }

  /** Stop calling this provider now: its key is missing. */
  unavailable(provider: Provider): void {
    this.skip(provider, 'no API key');
  }

  private skip(provider: Provider, why: string): void {
    if (this.skipped.has(provider)) return;
    this.skipped.add(provider);
    // Once per pass. This line is the marker for why the rest of a pass's rows
    // name the fallback model.
    console.warn(`[LlmConfig] Skipping ${provider} for the rest of this pass: ${why}`);
  }
}
