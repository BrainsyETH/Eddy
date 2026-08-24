// eddy-ios/src/hooks/useEddyUpdates.ts
// The batched Eddy updates, fetched once for the whole app.
//
// /api/eddy-updates answers with an entry for EVERY river plus the statewide
// 'global' one, in a single CDN-cached unauthenticated request. Four surfaces
// want a slice of it — the Today tab's headline card, the river screen, the
// favourites list and the map's river sheet — and none of them should pay for
// their own copy. So the response is held in module state and shared, and this
// file is the only thing that fetches it.
//
// Named to match missouri-float-planner/src/hooks/useEddyUpdates.ts so the two
// platforms' copies are findable together. That one wraps React Query, which
// this app deliberately does not carry; the contract below is what replaces it.
//
// ── TWO ENTRY POINTS, AND THE DIFFERENCE IS LOAD-BEARING ────────────────────
//
//   useEddyUpdates()          initiates and revalidates
//   useCachedEddyUpdate(slug) subscribes and reads, NEVER initiates
//
// The second exists for RiverSheet, whose header states its rule: "No request is
// made here… Tapping a river is the cheapest interaction on this screen and it
// should stay that way." Mounting the ordinary hook there would fetch on tap on
// any cold open of the Map tab, which is precisely that rule broken.
//
// It SUBSCRIBES rather than peeking once, and that is not the same thing. A
// one-shot read returns nothing when the sheet opens before the Today tab's
// fetch has landed, and would then stay blank for the life of the sheet even
// though the data arrived a moment later. Subscribing means the line appears
// when the data does, and the sheet still never asks.
//
// ── The cache contract ──────────────────────────────────────────────────────
//
// 1. THE SHARED REQUEST OWNS ITS OWN LIFECYCLE. fetchEddyUpdates takes an
//    AbortSignal and every screen in this app aborts on unmount — reports.tsx
//    creates a controller, passes its signal to `load`, and aborts it in the
//    effect's cleanup. Hand that signal to a shared promise and leaving the
//    Today tab kills the request for every other consumer awaiting it. So
//    nothing here accepts a caller's signal; the fetch is made bare and is
//    still bounded by the client's own deadline inside `get`.
//
// 2. CALLERS UNSUBSCRIBE LOCALLY. Unmounting drops a listener. It never aborts
//    the shared fetch, for the reason above.
//
// 3. A REJECTED REQUEST IS EVICTED IMMEDIATELY. `inFlight` is cleared in a
//    finally, and `cached` is only ever written on success — so one failure
//    does not poison the cache for a TTL, and the next consumer to ask makes a
//    real request instead of replaying a stale error. A failure also leaves any
//    previous good answer standing, which is what keeps a dropped bar of signal
//    from blanking prose already on screen.
//
// 4. PULL-TO-REFRESH ALWAYS REQUESTS, AND NEVER DISCARDS FIRST. A refresh that
//    returned the cached paragraph without contacting the server would be a
//    refresh that refreshes nothing, which is worse than no control at all
//    because it looks like an answer. `revalidate` therefore ignores the TTL —
//    only the mount effect consults it.
//
//    But it must not clear the cache on its way, which is what an earlier
//    version did: that made clause 3 a lie on the one path where it matters
//    most, throwing away a good paragraph the moment somebody pulled down on a
//    phone that had just lost signal.
//
// 5. THE TTL CANNOT EXCEED THE ENDPOINT'S OWN FRESHNESS. The route sets
//    cdnCacheHeaders(300, 1800), so 300s is the ceiling; going longer would make
//    the app staler than the CDN it reads.
//
// ── Never written to disk ───────────────────────────────────────────────────
//
// riverCache.ts excludes Eddy's take, and reports.tsx says why this prose is
// never kept across launches: gateGlobalProse and overlayLiveConditions are LIVE
// checks the server runs per request, and a stored paragraph about yesterday's
// water is exactly what they exist to withhold. A disk cache here would defeat
// a server-side safety gate silently, so this cache dies with the process.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { EddyUpdateEntry } from '@eddy/types';
import { fetchEddyUpdates } from '@/api/client';

type Updates = Record<string, EddyUpdateEntry>;

interface Snapshot {
  updates: Updates;
  at: number;
}

/** Clause 5: the endpoint's own s-maxage, in milliseconds. */
const TTL_MS = 300_000;

let cached: Snapshot | null = null;
let inFlight: Promise<Updates> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  // Copied before iterating: a listener that unsubscribes in response would
  // otherwise mutate the set mid-loop.
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The shared snapshot. Referentially stable between emits, which is what
 * useSyncExternalStore requires — returning a fresh object per call would
 * re-render forever.
 */
function getSnapshot(): Snapshot | null {
  return cached;
}

function isFresh(snapshot: Snapshot | null): snapshot is Snapshot {
  return snapshot !== null && Date.now() - snapshot.at < TTL_MS;
}

/**
 * One request at a time, shared by everyone who asks while it is open.
 *
 * Clause 1: no caller signal. Clause 3: `inFlight` is cleared on both paths and
 * `cached` is written only on the successful one.
 */
function revalidate(): Promise<Updates> {
  if (inFlight) return inFlight;
  inFlight = fetchEddyUpdates()
    .then((updates) => {
      cached = { updates, at: Date.now() };
      emit();
      return updates;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * The batched updates, fetching them if nobody has recently.
 *
 * `updates` is null until the first response lands — which is not the same as
 * an empty object, and callers that care should treat null as "not yet" rather
 * than "nothing to say".
 */
export function useEddyUpdates(): {
  updates: Updates | null;
  /** Clause 4. Await this from a RefreshControl's handler. */
  refresh: () => Promise<void>;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Kick a fetch on first use, and whenever what we hold has aged out.
  //
  // In an effect rather than in render, matching every other fetch in this app.
  // Mounting several consumers costs nothing: `isFresh` stops the ones that do
  // not need a request and `revalidate` collapses the rest onto one promise.
  useEffect(() => {
    if (isFresh(cached) || inFlight) return;
    // A failure is not this hook's to report. Every surface that shows this
    // prose is built to render without it — the line is absent, not broken —
    // and the caught rejection is what stops a missing paragraph becoming an
    // unhandled rejection warning on a phone with no signal.
    void revalidate().catch(() => {});
    // Deliberately once per mount. The cache is module state, so a dependency
    // on it would not be a dependency React can see anyway; what re-checks
    // freshness is the next consumer to mount, or `refresh`.
  }, []);

  const refresh = useCallback(async () => {
    try {
      // NOTHING IS CLEARED FIRST, and that is the fix for a bug this had.
      //
      // It used to null the cache and then request, which made "a failure
      // leaves the previous good answer standing" false on the one path where
      // it matters most: pull down on a phone that has just lost signal, and
      // the paragraph already on screen was thrown away for nothing. Every
      // current subscriber lost it on its next render and every new one got
      // null immediately.
      //
      // Clearing was never what made this contact the server anyway.
      // `revalidate` does not consult `isFresh` — only the mount effect does —
      // so calling it is already an unconditional request, which is all clause
      // 4 asked for.
      await revalidate();
    } catch {
      // A refresh that could not reach the server leaves the screen exactly as
      // it was, which is now true rather than merely intended.
    }
  }, []);

  return { updates: snapshot?.updates ?? null, refresh };
}

/**
 * One river's entry, if the app already holds it. NEVER fetches.
 *
 * For surfaces that have promised not to make a request — see the header on
 * RiverSheet. Returns null both when nothing has been fetched and when this
 * river has no current update, which are the same thing to a caller: there is
 * nothing to draw.
 */
export function useCachedEddyUpdate(slug: string | null | undefined): EddyUpdateEntry | null {
  const read = useCallback(
    () => (slug ? (getSnapshot()?.updates[slug] ?? null) : null),
    [slug],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/** Test seam. Not for app code — the cache is process-lifetime by design. */
export function __resetEddyUpdatesCacheForTests(): void {
  cached = null;
  inFlight = null;
  listeners.clear();
}
