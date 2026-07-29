// eddy-ios/src/hooks/useRiverData.ts
//
// The read side of the on-disk cache, for the parts of a river that are safe
// to keep: its hazards, its put-ins, its outfitters and its reaches.
//
// ── Why reading lives here and not in src/api/client.ts ─────────────────────
//
// The client is deliberately WRITE-ONLY to the cache. A fetcher that silently
// answered from disk when the network failed would take away the caller's
// ability to SAY the answer came from disk — and saying so is the entire point
// of keeping it. So the substitution happens one level up, where the result can
// carry its own provenance.
//
// ── Source, and why a boolean was not enough ────────────────────────────────
//
// This widens the `hazardsFailed` / `accessFailed` booleans that landed with
// the failure-vs-absence fix. A boolean encodes two states; with a cache there
// are four — cache hit or miss, crossed with the request succeeding or failing
// — and the three that a reader can tell apart are:
//
//   live     we asked and got an answer. An empty array means this river has
//            none, which is a real and ordinary fact.
//   cached   we could not ask, but we kept what we last saw. Renders normally;
//            a hazard from a three-week-old cache is the same hazard.
//   missing  we could not ask and have nothing. The ONLY state that may say
//            "could not load", and the one the old boolean conflated with a
//            genuinely empty river.
//
// A cancelled request is none of these — it is not an outcome at all, and must
// leave whatever is on screen alone. A fast back-tap out of a river would
// otherwise flash "Hazards unavailable" on the way out.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hazard, MapAccessPoint, RiverReach, RiverService } from '@eddy/types';
import {
  ApiError,
  fetchHazards,
  fetchRiverAccessPoints,
  fetchRiverReaches,
  fetchRiverServices,
} from '@/api/client';
import { readRiver, type CachedRiver } from '@/lib/riverCache';

export type Source = 'live' | 'cached' | 'missing';

export interface RiverDataSources {
  hazards: Source;
  access: Source;
  services: Source;
  reaches: Source;
}

export interface RiverData {
  hazards: Hazard[];
  accessPoints: MapAccessPoint[];
  services: RiverService[];
  reaches: RiverReach[];
  source: RiverDataSources;
  /**
   * When the cached parts were written, or null once everything is live.
   *
   * Only a screen running ENTIRELY off cache earns a line about it. Static data
   * gets no staleness treatment at all — a caveat on a three-week-old hazard
   * teaches people to discount hazard copy, which is the opposite of the point.
   */
  cachedAt: string | null;
  /** True until the first network round for this slug settles. */
  loading: boolean;
}

const EMPTY: RiverData = {
  hazards: [],
  accessPoints: [],
  services: [],
  reaches: [],
  source: { hazards: 'missing', access: 'missing', services: 'missing', reaches: 'missing' },
  cachedAt: null,
  loading: true,
};

function isCancelled(err: unknown): boolean {
  return err instanceof ApiError && err.message === 'Request cancelled';
}

/**
 * One part's outcome: the value plus where it came from.
 *
 * `cached` is passed in rather than read here so that one cache read serves all
 * four parts — the entry is a single AsyncStorage value, and reading it four
 * times would be four file reads to answer one question.
 */
async function resolvePart<T>(
  request: Promise<T[]>,
  cached: T[] | undefined,
): Promise<{ items: T[]; source: Source } | null> {
  try {
    return { items: await request, source: 'live' };
  } catch (err) {
    // Not an outcome. The caller leaves state untouched.
    if (isCancelled(err)) return null;
    if (cached) return { items: cached, source: 'cached' };
    return { items: [], source: 'missing' };
  }
}

export function useRiverData(slug: string | undefined, reloadNonce = 0): RiverData {
  const [data, setData] = useState<RiverData>(EMPTY);
  /** The slug the current state describes, so a slug change resets rather than blends. */
  const shownSlug = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    let live = true;

    if (shownSlug.current !== slug) {
      setData(EMPTY);
      shownSlug.current = slug;
    }

    (async () => {
      // ── Paint from disk first ────────────────────────────────────────────
      //
      // A real win beyond offline: the river screen otherwise holds a
      // full-screen spinner until eight requests land, and the put-ins and
      // hazards are already sitting on the phone in single-digit milliseconds.
      //
      // Only the SHAPE of the river is painted this way. The condition is not
      // here at all — a cached reading over six hours old renders grey, and
      // flipping grey to coloured a beat later is a verdict changing under the
      // reader's eyes.
      const stored = await readRiver(slug);
      if (!live) return;

      const parts: CachedRiver = stored?.payload ?? {};
      if (stored) {
        setData((prev) => ({
          ...prev,
          hazards: parts.hazards ?? prev.hazards,
          accessPoints: parts.accessPoints ?? prev.accessPoints,
          services: parts.services ?? prev.services,
          reaches: parts.reaches ?? prev.reaches,
          source: {
            hazards: parts.hazards ? 'cached' : prev.source.hazards,
            access: parts.accessPoints ? 'cached' : prev.source.access,
            services: parts.services ? 'cached' : prev.source.services,
            reaches: parts.reaches ? 'cached' : prev.source.reaches,
          },
          cachedAt: stored.fetchedAt,
        }));
      }

      const [hazards, access, services, reaches] = await Promise.all([
        resolvePart(fetchHazards(slug, controller.signal), parts.hazards),
        resolvePart(fetchRiverAccessPoints(slug, controller.signal), parts.accessPoints),
        resolvePart(fetchRiverServices(slug, controller.signal), parts.services),
        resolvePart(fetchRiverReaches(slug, controller.signal), parts.reaches),
      ]);

      if (!live) return;

      setData((prev) => {
        const next: RiverData = {
          hazards: hazards?.items ?? prev.hazards,
          accessPoints: access?.items ?? prev.accessPoints,
          services: services?.items ?? prev.services,
          reaches: reaches?.items ?? prev.reaches,
          source: {
            hazards: hazards?.source ?? prev.source.hazards,
            access: access?.source ?? prev.source.access,
            services: services?.source ?? prev.source.services,
            reaches: reaches?.source ?? prev.source.reaches,
          },
          // Once nothing on screen came off the disk, the age stops being true
          // of anything and the footnote must go with it.
          cachedAt: null,
          loading: false,
        };
        const anyCached = Object.values(next.source).some((s) => s === 'cached');
        return { ...next, cachedAt: anyCached ? prev.cachedAt : null };
      });
    })();

    return () => {
      live = false;
      controller.abort();
    };
  }, [slug, reloadNonce]);

  return data;
}

/** Whether any part of this screen is being served from disk. */
export function isRunningOffline(source: RiverDataSources): boolean {
  return Object.values(source).some((s) => s === 'cached');
}

/** Stable no-op retry for callers that do not own a reload nonce. */
export function useReloadNonce(): [number, () => void] {
  const [nonce, setNonce] = useState(0);
  return [nonce, useCallback(() => setNonce((n) => n + 1), [])];
}
