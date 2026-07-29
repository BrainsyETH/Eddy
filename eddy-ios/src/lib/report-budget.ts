// eddy-ios/src/lib/report-budget.ts
// How often the same failure may be reported. PURE — no Sentry, no timers, no
// globals, so the web suite can exercise it (this app has no test runner).
//
// ── Why a crash reporter needs a budget ─────────────────────────────────────
//
// warn() sits on paths the app RECOVERS from, and every one of them is
// repeatable: a build shipped without EXPO_PUBLIC_MAPBOX_TOKEN logs
// "[map] Mapbox failed to load" on every single map open, a missing APNs
// entitlement logs on every registration attempt, an unreachable Supabase logs
// on every cold start. One misconfigured build across a handful of testers is
// thousands of identical events in a day.
//
// Sentry's free tier is 5,000 errors a month. So the failure mode is not a
// large bill — it is that the field test's FIRST bad build silently exhausts
// the quota, and every real crash after that is dropped by the server. The
// reports you would actually read are the ones you lose.
//
// Ported from the web app's webhook-reporter.ts, which solved exactly this. The
// constants are deliberately the same so the two behave alike.

/** One report per distinct failure per five minutes. */
export const FINGERPRINT_COOLDOWN_MS = 5 * 60 * 1000;
/** And no more than this many in any one minute, whatever their fingerprints. */
export const GLOBAL_CAP_PER_MINUTE = 10;
/** Bound on the dedup map, so a high-cardinality fingerprint cannot grow it forever. */
const MAX_TRACKED_FINGERPRINTS = 500;

export interface ReportBudgetState {
  lastSentByFingerprint: Map<string, number>;
  windowStart: number;
  sentInWindow: number;
}

export function createReportBudget(): ReportBudgetState {
  return { lastSentByFingerprint: new Map(), windowStart: 0, sentInWindow: 0 };
}

/**
 * May this report go out? Mutates `state` when it says yes.
 *
 * DELIBERATELY NOT APPLIED TO CRASHES. The caller only runs this for warn() —
 * handled, recoverable, repeatable conditions. An unhandled throw is rare,
 * unrepeatable within a session (the boundary has already replaced the screen)
 * and the single most valuable thing this whole system exists to deliver, so
 * throttling it would be trading the signal for the noise.
 */
export function shouldReport(
  state: ReportBudgetState,
  fingerprint: string,
  now: number,
): boolean {
  // Never seen is always allowed — the first occurrence of anything is the one
  // worth having.
  const last = state.lastSentByFingerprint.get(fingerprint);
  if (last !== undefined && now - last < FINGERPRINT_COOLDOWN_MS) return false;

  if (now - state.windowStart >= 60_000) {
    state.windowStart = now;
    state.sentInWindow = 0;
  }
  if (state.sentInWindow >= GLOBAL_CAP_PER_MINUTE) return false;

  state.lastSentByFingerprint.set(fingerprint, now);
  state.sentInWindow += 1;

  if (state.lastSentByFingerprint.size > MAX_TRACKED_FINGERPRINTS) {
    // Map preserves insertion order, so this drops the least recently ADDED.
    const oldest = state.lastSentByFingerprint.keys().next().value;
    if (oldest !== undefined) state.lastSentByFingerprint.delete(oldest);
  }

  return true;
}

/**
 * What counts as "the same failure".
 *
 * The tag and the message, never the detail: the detail carries a river slug, a
 * pack name, an error string — all of which vary per occurrence, and any of
 * which would make every event its own fingerprint and defeat the budget
 * entirely. That is the mistake this function exists to prevent.
 */
export function fingerprintOf(tag: string, message: string): string {
  return `${tag}:${message}`;
}
