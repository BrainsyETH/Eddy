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
import { getOfflineManager } from './runtime';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  expectedRegionsFromMetadata,
  fitsInBudget,
  offlineCompleteness,
  overallProgress,
  packMetadata,
  planOffline,
  regionPrefix,
  riverSlugFromRegionId,
  tileBudget,
  type OfflineCompleteness,
  type OfflinePlan,
  type OfflineRiver,
  type RiverPackTally,
  type TileBudget,
} from '@eddy/offline';
import { warn } from '@/lib/monitoring';

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

/**
 * Does a pack that already exists on disk actually hold a finished region?
 *
 * Answers "no" for anything it cannot verify — a vanished pack, a rejecting
 * status call — because the whole point of asking is that a name is not
 * evidence. Claiming complete on a failed check would restore the bug this
 * exists to close.
 */
async function regionIsComplete(
  // Structural, not the SDK's type: the manager arrives through a lazy require
  // (see runtime.ts) precisely so no Mapbox type is imported at module scope.
  manager: { getPacks: () => Promise<OfflinePack[]> },
  name: string,
): Promise<boolean> {
  try {
    const packs = await manager.getPacks();
    const pack = packs.find((p) => (p.name ?? '') === name);
    if (!pack) return false;
    return isComplete(await pack.status());
  } catch {
    return false;
  }
}

/** The slice of a Mapbox offline pack this file actually touches. */
interface OfflinePack {
  name?: string;
  metadata?: { tileCount?: unknown; regionCount?: unknown } | null;
  status: () => Promise<OfflineStatus | undefined>;
}

export interface DownloadState {
  riverSlug: string;
  /** 0-100, weighted by tile count across the river's regions. */
  percent: number;
  error: string | null;
}

export function useOfflinePacks() {
  const [downloaded, setDownloaded] = useState<Record<string, RiverPackTally>>({});
  const [budget, setBudget] = useState<TileBudget>(tileBudget(0));
  const [active, setActive] = useState<DownloadState | null>(null);
  const [ready, setReady] = useState(false);

  // Per-region percentages for the in-flight river. A ref because Mapbox fires
  // progress events per region at up to ~3/second across ten regions; routing
  // each one through setState would rerender the map continuously.
  const progressRef = useRef<Record<string, number>>({});

  /**
   * Re-read what is actually on disk.
   *
   * RETURNS the tally as well as setting it, so a caller that has just written
   * packs can check its own work without waiting a render — and so the budget
   * can be computed from a fresh number instead of a captured one.
   */
  const refresh = useCallback(async (): Promise<Record<string, RiverPackTally>> => {
    const manager = getOfflineManager();
    if (!manager) {
      setReady(true);
      return {};
    }
    try {
      const packs = await manager.getPacks();
      const byRiver: Record<string, RiverPackTally> = {};
      let usedTiles = 0;

      for (const pack of packs) {
        const slug = riverSlugFromRegionId(pack.name ?? '');
        if (!slug) continue; // A pack we didn't create — leave it alone.

        // status() reaches into the TileStore and rejects for a region that is
        // still being written, so it must not be allowed to abandon the scan
        // and leave the budget reading zero. The planned tile count we stored
        // in metadata is the fallback: it over-counts a part-finished region,
        // which is the safe direction for a budget check.
        //
        // That same fallback is why completeness must NOT be judged on tiles —
        // see offlineCompleteness.
        let tiles = 0;
        let unfinished = 0;
        try {
          const status = await pack.status();
          tiles = status?.completedTileCount ?? 0;
          if (!isComplete(status)) unfinished = 1;
        } catch {
          // A rejection is not evidence of a hole — this call fails for a region
          // still being written. Leaving `unfinished` at 0 keeps the region
          // COUNT load-bearing and stops a flaky TileStore read marking a
          // healthy river partial.
          tiles = Number(pack.metadata?.tileCount) || 0;
        }

        usedTiles += tiles;
        const existing = byRiver[slug];
        byRiver[slug] = {
          riverSlug: slug,
          regionCount: (existing?.regionCount ?? 0) + 1,
          // max, so a legacy pack written before regionCount existed (which
          // reads 0) never wins over a real number from a sibling pack.
          expectedRegions: Math.max(
            existing?.expectedRegions ?? 0,
            expectedRegionsFromMetadata(pack.metadata),
          ),
          unfinishedRegions: (existing?.unfinishedRegions ?? 0) + unfinished,
          tileCount: (existing?.tileCount ?? 0) + tiles,
        };
      }

      setDownloaded(byRiver);
      setBudget(tileBudget(usedTiles));
      return byRiver;
    } catch (err) {
      warn('map', 'could not read offline packs', err);
      return {};
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
    // OfflineRiver, not RiverDetail: the caller now hands over a river taken
    // from the statewide dataset rather than from a per-river fetch, and a
    // download only ever needed the slug, the name, the line and the extent.
    async (river: OfflineRiver): Promise<{ ok: boolean; error?: string }> => {
      const manager = getOfflineManager();
      if (!manager) return { ok: false, error: 'Offline maps need a full build of the app.' };

      const plan = planOffline(river);
      if (!plan) return { ok: false, error: 'This river has no map data to download yet.' };

      // Budget from a FRESH read, not from the render that created this
      // callback. `budget.remaining` was captured in the dep array, so a
      // download started right after a remove — or after a failed attempt left
      // a prefix behind — measured against a number that had already moved.
      const before = await refresh();
      const used = Object.values(before).reduce((n, t) => n + t.tileCount, 0);
      // This river's own packs are already on disk and will be reused rather
      // than fetched twice, so they must not count against the room it needs.
      const mine = before[river.slug]?.tileCount ?? 0;
      if (!fitsInBudget(plan, tileBudget(Math.max(0, used - mine)))) {
        return {
          ok: false,
          error: `Not enough offline space left. Remove another river first.`,
        };
      }

      progressRef.current = {};
      setActive({ riverSlug: river.slug, percent: 0, error: null });

      // Pulled out of the loop so the resume branch below can RE-RUN it for one
      // region rather than duplicating forty lines of listener wiring.
      const createRegion = (region: OfflinePlan['regions'][number]) => {
        const [minLng, minLat, maxLng, maxLat] = region.bounds;
        return new Promise<void>((resolve, reject) => {
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
                // metadata alone when a status call is unavailable, and
                // regionCount so a pack can say how many siblings it should
                // have had. See packMetadata.
                metadata: packMetadata(plan, region),
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
      };

      try {
        for (const region of plan.regions) {
          try {
            await createRegion(region);
          } catch (err) {
            // createPack rejects when a pack of that name already exists, which
            // is the ordinary shape of resuming an interrupted download rather
            // than an error.
            //
            // But "it exists" is not "it finished". This branch used to mark the
            // region 100% on the strength of the NAME alone, which is how a
            // download killed halfway through came back reported as fully
            // saved. Ask the pack what it actually holds, and if it cannot say
            // it is complete, throw it away and fetch it again.
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes('already exists')) throw err;

            if (await regionIsComplete(manager, region.id)) {
              progressRef.current[region.id] = 100;
            } else {
              await manager.deletePack(region.id);
              await createRegion(region);
            }
          }
        }

        // Report what is ON DISK, not what the loop believes about itself.
        // Every failure above this line is one the loop noticed; this catches
        // the ones it did not.
        const after = await refresh();
        if (offlineCompleteness(after[river.slug], plan.regions.length) !== 'complete') {
          return { ok: false, error: 'Some of this map did not save. Try again while you have signal.' };
        }
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Download failed';
        setActive((prev) => (prev ? { ...prev, error: message } : prev));
        return { ok: false, error: message };
      } finally {
        setActive(null);
      }
    },
    [refresh],
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
        warn('map', 'could not delete offline packs', err);
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
    /**
     * Three-way, and `isDownloaded` is deliberately gone rather than left
     * beside it. A boolean cannot express "partly saved", and the old one
     * answered true on the strength of a single pack existing — which is the
     * bug. Leaving a laxer twin around is how it comes back.
     */
    completeness: (slug: string, plannedRegions?: number): OfflineCompleteness =>
      offlineCompleteness(downloaded[slug], plannedRegions),
  };
}

export type { OfflinePlan };
