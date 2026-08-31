// eddy-ios/src/hooks/useDams.ts
// The Corps' live dam state: one shared request, held in module state.
//
// The pins themselves come from DAM_CATALOG in the binary and are NOT this
// hook's business — this is the enrichment (whether the units are turning,
// what is coming out, when it was measured), and its failure costs exactly
// those three things, never the layer. See the catalog's header.
//
// ── Why a module cache, like useEddyUpdates ─────────────────────────────────
// Four surfaces read /api/dams — the map layer, the Today tab's Dams scope,
// the Favorites list, and every river screen on focus — and each paid for its
// own copy of a route the code documents at five to fifty seconds cold; the
// river↔dam ping-pong refired it per hop. The contract here is
// useEddyUpdates', restated:
//
//   1. The shared request owns its lifecycle: no caller signal, ever. A
//      screen unmounting must not kill the request every other surface is
//      awaiting; the fetch is still bounded by the client's own deadline.
//   2. A rejected request is evicted immediately; `cached` is written only on
//      success, so one failure neither poisons the cache nor blanks an answer
//      already held.
//   3. The TTL cannot exceed the endpoint's own freshness: the route sets
//      cdnCacheHeaders(900, 3600), so 900s is the ceiling.
//
// Foreground is a consumer concern: useDams re-asks on foreground while the
// layer is wanted, so a phone resumed hours later stops presenting last
// night's releases as live. Imperative callers re-ask by calling
// getSharedDams again, which their focus effects already do.

import { useEffect, useSyncExternalStore } from 'react';
import type { DamSnapshot } from '@eddy/types';
import { ApiError, fetchDam, fetchDams } from '@/api/client';
import { onForeground } from '@/lib/foreground';
import { warn } from '@/lib/monitoring';

/** Clause 3: the route's own s-maxage, in milliseconds. */
const DAMS_TTL_MS = 900_000;

/**
 * How long to wait before asking the Corps' dams once more after a failure.
 *
 * Long enough that a cold /api/dams read-through has finished filling the CDN
 * entry — the measured cold path is five to fifty seconds — and short enough
 * that somebody who opened the layer is still looking at it. The retry is what
 * turns a fifteen-second deadline expiring into a pause rather than an empty
 * layer for the life of the screen.
 */
const DAMS_RETRY_MS = 20_000;

let cached: { dams: DamSnapshot[]; at: number } | null = null;
let inFlight: Promise<DamSnapshot[]> | null = null;
let attempts = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Referentially stable between writes, as useSyncExternalStore requires. */
function getSnapshot(): DamSnapshot[] | null {
  return cached?.dams ?? null;
}

function isFresh(): boolean {
  return cached !== null && Date.now() - cached.at < DAMS_TTL_MS;
}

function revalidate(): Promise<DamSnapshot[]> {
  if (inFlight) return inFlight;
  const nth = ++attempts;
  const startedAt = Date.now();
  inFlight = fetchDams()
    .then((live) => {
      if (__DEV__) {
        console.info('[map] dams loaded', {
          durationMs: Date.now() - startedAt,
          returned: live.length,
          attempt: nth,
        });
      }
      // Told apart in the log: an empty array from a healthy route is a claim
      // about the Corps, and it has never been true. If this line ever
      // appears, the route changed shape.
      if (live.length === 0) warn('map', 'dams responded with no dams', { attempt: nth });
      cached = { dams: live, at: Date.now() };
      emit();
      return live;
    })
    .catch((err) => {
      // WHICH failure, because the two want different fixes: 'No connection'
      // is the deadline expiring on a cold read-through; a status code is the
      // route itself failing. Logged here, once, however many surfaces were
      // awaiting this one promise.
      warn('map', 'dams fetch failed', {
        attempt: nth,
        reason: err instanceof ApiError ? (err.status ?? err.message) : 'unknown',
      });
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * The dams, for imperative callers — the river screen's focus loader, the
 * Today tab's Dams scope, the Favorites list. Answers from the cache while it
 * is fresh; otherwise one shared request. Rejects like fetchDams does, and
 * for the same reason: the caller decides what an outage means on its screen.
 */
export function getSharedDams(): Promise<DamSnapshot[]> {
  if (isFresh() && cached) return Promise.resolve(cached.dams);
  return revalidate();
}

/**
 * What the store ALREADY HOLDS, and never a request.
 *
 * ── Why a second reader, next to getSharedDams ────────────────────────────
 *
 * Because "answer if you can" and "answer or go and find out" are different
 * questions, and one of this app's surfaces only ever wanted the first. The dam
 * screen seeds its first paint from whatever the map, Today or Favourites have
 * already fetched — and calling getSharedDams for that turned a cold deep link
 * into a request for TWENTY dams, running alongside the request for the one
 * dam the reader actually opened. The twenty-dam route is the slower of the
 * two, so the seed could not win; it could only compete.
 *
 * Null means "nothing worth having" — not fetched, or fetched long enough ago
 * that the TTL has passed. A caller that wants it fetched asks for it.
 */
export function peekSharedDams(): DamSnapshot[] | null {
  return isFresh() && cached ? cached.dams : null;
}

/**
 * In-flight ONE DAM's detail requests, so concurrent callers share one.
 *
 * ── Why no cache beside it, unlike the dams index above ───────────────────
 *
 * Because the detail screen's focus refetch is not an optimisation, it is the
 * screen's cache policy: a payload that arrives once and never again is stale
 * data with ages computed on this device still ticking up beside it. A TTL here
 * would answer that refetch from memory and quietly turn the refresh off.
 *
 * So this collapses only what is happening AT THE SAME MOMENT. On arrival the
 * screen's focus effect and a retry can both ask within a frame of each other;
 * they get one request. A minute later, on the next focus, nothing is in flight
 * and a real refresh runs.
 */
const inFlightDetail = new Map<string, Promise<DamSnapshot>>();

/**
 * One dam's full detail. Rejects like fetchDam does — the caller decides what
 * an outage means on its screen.
 *
 * NO CALLER SIGNAL, deliberately, which is clause 1 of this module's contract:
 * a screen unmounting must not kill the request another caller is awaiting. The
 * request is still bounded by the client's own deadline, and callers check
 * their own `aborted` before applying a late answer.
 */
export function getSharedDam(damId: string): Promise<DamSnapshot> {
  const existing = inFlightDetail.get(damId);
  if (existing) return existing;

  const request = fetchDam(damId).finally(() => {
    // Cleared before any downstream handler runs, so a caller that reacts to a
    // rejection by retrying starts a NEW request rather than being handed the
    // failed one again.
    inFlightDetail.delete(damId);
  });
  inFlightDetail.set(damId, request);
  return request;
}

export function useDams(wanted: boolean): DamSnapshot[] | null {
  // Null until the first answer lands, so the layers sheet can tell "not
  // fetched" from "none".
  const dams = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!wanted) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Once per enable. A second failure leaves the catalog pins standing
    // rather than retrying into a route that is evidently unwell — and the
    // layer is still drawn, which is the difference this arrangement makes.
    let retried = false;

    const ask = () => {
      if (isFresh()) return;
      void revalidate().catch(() => {
        if (cancelled || retried) return;
        retried = true;
        timer = setTimeout(ask, DAMS_RETRY_MS);
      });
    };

    ask();
    // A resumed phone re-asks if the cache aged out while it slept — the
    // reader-clock staleness bands downstream keep the copy honest, but only
    // fresh data keeps the STATE honest.
    const offForeground = onForeground(ask);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      offForeground();
    };
  }, [wanted]);

  return dams;
}

/** Test seam. Not for app code — the cache is process-lifetime by design. */
export function __resetDamsCacheForTests(): void {
  cached = null;
  inFlight = null;
  inFlightDetail.clear();
  attempts = 0;
  listeners.clear();
}
