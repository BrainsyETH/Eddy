// eddy-ios/src/map/useOfflinePacks.ts
// Drives Mapbox's offlineManager for a whole river at a time.
//
// A river is several packs (see packages/eddy-offline — following the corridor
// instead of the bounding box is a 3.2x saving), so nothing deals in single packs.
// The unit of work a user understands is "the Current River", and that has to be
// the unit we download, report progress for, and delete.
//
// State of truth is Mapbox's own pack list, queried on mount, NOT a mirror in
// AsyncStorage. A separate index can disagree with what is actually on disk —
// after a reinstall, an OS purge, or a failed download — and then the app claims
// a river is available offline when it isn't. That failure mode happens exactly
// when someone is out of signal and relying on it.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RiverDetail } from '@eddy/types';
import { getOfflineManager } from './runtime';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  overallProgress,
  planOffline,
  regionPrefix,
  riverSlugFromRegionId,
  tileBudget,
  type OfflinePlan,
  type TileBudget,
} from '@eddy/offline';

/** Mapbox's outdoors style: contours and trails, which is what a river needs. */
export const STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12';

export interface DownloadState {
  riverSlug: string;
  /** 0-100, weighted by tile count across the river's regions. */
  percent: number;
  error: string | null;
}

interface DownloadedRiver {
  slug: string;
  regionCount: number;
  tileCount: number;
}

export function useOfflinePacks() {
  const [downloaded, setDownloaded] = useState<Record<string, DownloadedRiver>>({});
  const [budget, setBudget] = useState<TileBudget>(tileBudget(0));
  const [active, setActive] = useState<DownloadState | null>(null);
  const [ready, setReady] = useState(false);

  // Per-region percentages for the in-flight river. A ref because Mapbox fires
  // progress events per region at up to ~3/second across ten regions; routing
  // each one through setState would rerender the map continuously.
  const progressRef = useRef<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const manager = getOfflineManager();
    if (!manager) {
      setReady(true);
      return;
    }
    try {
      const packs = await manager.getPacks();
      const byRiver: Record<string, DownloadedRiver> = {};
      let usedTiles = 0;

      for (const pack of packs) {
        const slug = riverSlugFromRegionId(pack.name ?? '');
        if (!slug) continue; // A pack we didn't create — leave it alone.
        const status = await pack.status();
        const tiles = status?.completedTileCount ?? 0;
        usedTiles += tiles;
        const existing = byRiver[slug];
        byRiver[slug] = {
          slug,
          regionCount: (existing?.regionCount ?? 0) + 1,
          tileCount: (existing?.tileCount ?? 0) + tiles,
        };
      }

      setDownloaded(byRiver);
      setBudget(tileBudget(usedTiles));
    } catch (err) {
      console.warn('[map] could not read offline packs', err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Downloads every region for a river.
   *
   * Regions are created SEQUENTIALLY. Firing ten createPack calls at once
   * saturates the connection and — more importantly — makes a partial failure
   * incoherent: you end up with some regions done, some not, and no useful
   * progress figure. One at a time means an interrupted download leaves a
   * prefix of complete regions that a later run can skip.
   */
  const download = useCallback(
    async (river: RiverDetail): Promise<{ ok: boolean; error?: string }> => {
      const manager = getOfflineManager();
      if (!manager) return { ok: false, error: 'Offline maps need a full build of the app.' };

      const plan = planOffline(river);
      if (!plan) return { ok: false, error: 'This river has no map data to download yet.' };
      if (plan.tileCount > budget.remaining) {
        return {
          ok: false,
          error: `Not enough offline space left. Remove another river first.`,
        };
      }

      progressRef.current = {};
      setActive({ riverSlug: river.slug, percent: 0, error: null });

      try {
        for (const region of plan.regions) {
          const [minLng, minLat, maxLng, maxLat] = region.bounds;
          try {
            await manager.createPack(
              {
                name: region.id,
                styleURL: STYLE_URL,
                // Mapbox wants [northEast, southWest] as [lng, lat] pairs — the
                // opposite corner order to our [minLng, minLat, ...] bounds.
                bounds: [
                  [maxLng, maxLat],
                  [minLng, minLat],
                ],
                minZoom: MIN_ZOOM,
                maxZoom: MAX_ZOOM,
                metadata: { riverSlug: river.slug, riverName: river.name },
              },
              (_pack: unknown, status: { percentage?: number } | undefined) => {
                progressRef.current[region.id] = status?.percentage ?? 0;
                setActive((prev) =>
                  prev && prev.riverSlug === river.slug
                    ? { ...prev, percent: overallProgress(plan.regions, progressRef.current) }
                    : prev,
                );
              },
            );
          } catch (err) {
            // createPack rejects when a pack of that name already exists, which
            // is the normal shape of resuming an interrupted download rather
            // than an error. Count it complete and move on.
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes('already exists')) throw err;
            progressRef.current[region.id] = 100;
          }
        }
        await refresh();
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Download failed';
        setActive((prev) => (prev ? { ...prev, error: message } : prev));
        return { ok: false, error: message };
      } finally {
        setActive(null);
      }
    },
    [budget.remaining, refresh],
  );

  /** Removes every pack for a river, freeing its share of the tile budget. */
  const remove = useCallback(
    async (riverSlug: string) => {
      const manager = getOfflineManager();
      if (!manager) return;
      const prefix = regionPrefix(riverSlug);
      try {
        const packs = await manager.getPacks();
        for (const pack of packs) {
          if ((pack.name ?? '').startsWith(prefix)) {
            await manager.deletePack(pack.name);
          }
        }
      } catch (err) {
        console.warn('[map] could not delete offline packs', err);
      }
      await refresh();
    },
    [refresh],
  );

  return {
    ready,
    downloaded,
    budget,
    active,
    download,
    remove,
    refresh,
    isDownloaded: (slug: string) => Boolean(downloaded[slug]),
  };
}

export type { OfflinePlan };
