// eddy-ios/src/lib/locationFreshness.ts
// When a position the app already holds is still an answer, and how long a
// fresh one may take. Pure, so the web test runner can cover it; useLocation
// is the only caller.
//
// ── Why a live fix needs an age ─────────────────────────────────────────────
// useLocation used to return its stored coordinates for as long as its status
// was 'ready'. Status says a grant is held, not that the position is current:
// open the map at home, drive an hour to the put-in, tap Locate, and the map
// recentred on the house. Every fix now carries the time it was taken, and an
// explicit Locate (`force`) never reuses one older than a few seconds.
//
// ── Why the fresh fix has a deadline ────────────────────────────────────────
// getCurrentPositionAsync has no timeout of its own. Under tree cover or with a
// cold GPS it can take minutes, and the caller is a button with a spinner. A
// fix that arrives after the deadline is discarded rather than applied late,
// so it cannot move the map after the user has given up and panned away.

/** A non-forced caller may reuse a live fix this young ("which rivers are near me"). */
export const LIVE_FIX_REUSE_MS = 5 * 60 * 1000;

/** How old iOS's cached last-known position may be, per kind of request. */
export const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;
export const FORCED_LAST_KNOWN_MAX_AGE_MS = 15 * 1000;

/** How long a fresh GPS fix may take before the request gives up. */
export const FIX_DEADLINE_MS = 15 * 1000;

export interface TimedFix {
  /** Epoch ms the position was observed (the OS fix time, not the read time). */
  at: number;
}

/**
 * Whether a live fix may answer a request without asking the OS again.
 * Forced requests (an explicit Locate) never reuse one.
 */
export function canReuseFix(fix: TimedFix | null, now: number, force: boolean): boolean {
  if (!fix || force) return false;
  const age = now - fix.at;
  return age >= 0 && age <= LIVE_FIX_REUSE_MS;
}

/** maxAge for getLastKnownPositionAsync. A forced request accepts only a very recent one. */
export function lastKnownMaxAge(force: boolean): number {
  return force ? FORCED_LAST_KNOWN_MAX_AGE_MS : LAST_KNOWN_MAX_AGE_MS;
}

export const DEADLINE_EXCEEDED = Symbol('deadline exceeded');

/**
 * Resolve with `work`, or DEADLINE_EXCEEDED once `ms` passes — whichever is
 * first. The late result is dropped, never applied. `schedule` is injectable
 * for tests.
 */
export function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  schedule: (fn: () => void, ms: number) => () => void = (fn, delay) => {
    const id = setTimeout(fn, delay);
    return () => clearTimeout(id);
  },
): Promise<T | typeof DEADLINE_EXCEEDED> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cancel = schedule(() => {
      if (settled) return;
      settled = true;
      resolve(DEADLINE_EXCEEDED);
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        cancel();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cancel();
        reject(error);
      },
    );
  });
}
