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

interface OfflineStatus {
  percentage?: number;
  state?: string | number;
  completedTileCount?: number;
}

/**
 * Whether a region has finished downloading.
 *
 * Checks both signals on purpose. The native side reports a string enum whose
 * complete case is `"complete"`, but the JS layer compares against a module
 * constant typed `string | number`, so the wire value is not guaranteed to be
 * either one. Percentage is the reliable fallback.
 */
function isComplete(status: OfflineStatus | undefined): boolean {
  if (!status) return false;
  if ((status.percentage ?? 0) >= 100) return true;
  return String(status.state ?? '').toLowerCase() === 'complete';
}

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

        // status() reaches into the TileStore and rejects for a region that is
        // still being written, so it must not be allowed to abandon the scan
        // and leave the budget reading zero. The planned tile count we stored
        // in metadata is the fallback: it over-counts a part-finished region,
        // which is the safe direction for a budget check.
        let tiles = 0;
        try {
          tiles = (await pack.status())?.completedTileCount ?? 0;
        } catch {
          tiles = Number(pack.metadata?.tileCount) || 0;
        }
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
   * Downloads every region for a river, one at a time.
   *
   * The awaiting is the subtle part. `createPack` resolves as soon as the
   * download STARTS, not when it finishes — the native module registers the
   * pack, calls startLoading, and returns. Awaiting it therefore does not
   * sequence anything: an earlier version of this loop fired all fifteen
   * regions at once, reported completion immediately, and then raced its own
   * refresh against regions the TileStore had not materialised yet, producing
   * "Unable to fetch region for river:<slug>:0".
   *
   * So each region is wrapped in a promise settled by its own progress and
   * error listeners. That makes the loop genuinely sequential, which matters
   * for a reason beyond tidiness: fifteen concurrent downloads saturate a weak
   * connection and leave a partial failure incoherent, whereas one at a time
   * leaves a prefix of finished regions that a later run skips.
   *
   * There is deliberately no timeout. A river on poor signal can legitimately
   * take many minutes, and cutting that off would break the exact case offline
   * maps exist for. Failures surface through the error listener instead.
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
            await new Promise<void>((resolve, reject) => {
              manager
                .createPack(
                  {
                    name: region.id,
                    styleURL: STYLE_URL,
                    // Mapbox wants [northEast, southWest] as [lng, lat] pairs —
                    // the opposite corner order to our [minLng, minLat, …].
                    bounds: [
                      [maxLng, maxLat],
                      [minLng, minLat],
                    ],
                    minZoom: MIN_ZOOM,
                    maxZoom: MAX_ZOOM,
                    // tileCount rides along so the budget can be rebuilt from
                    // metadata alone when a status call is unavailable.
                    metadata: {
                      riverSlug: river.slug,
                      riverName: river.name,
                      tileCount: region.tileCount,
                    },
                  },
                  (_pack: unknown, status: OfflineStatus | undefined) => {
                    progressRef.current[region.id] = status?.percentage ?? 0;
                    setActive((prev) =>
                      prev && prev.riverSlug === river.slug
                        ? { ...prev, percent: overallProgress(plan.regions, progressRef.current) }
                        : prev,
                    );
                    if (isComplete(status)) resolve();
                  },
                  (_pack: unknown, err: { message?: string } | undefined) => {
                    reject(new Error(err?.message ?? 'Download failed'));
                  },
                )
                .catch(reject);
            });
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
