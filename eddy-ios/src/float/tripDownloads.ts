// eddy-ios/src/float/tripDownloads.ts
// Trip map downloads, on top of @rnmapbox/maps' offlineManager (ADR 0011).
//
// Thin on purpose: what to download and when it counts as complete are decided
// in src/lib/tripDownload.ts, where they are tested. This file only talks to
// the native module, and treats every failure as "not ready" rather than
// guessing.

import { STYLE_URL, getOfflineManager } from '@/map/runtime';
import { warn } from '@/lib/monitoring';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  TRIP_PACK_PREFIX,
  isTripPack,
  tripDownloadState,
  type PackStatus,
  type TripChunk,
  type TripDownloadState,
} from '@/lib/tripDownload';

interface NativePack {
  name: string;
  status: () => Promise<PackStatus>;
  resume: () => Promise<void>;
}

async function packs(): Promise<NativePack[]> {
  const manager = getOfflineManager();
  if (!manager) return [];
  return ((await manager.getPacks()) as NativePack[]).filter((pack) => pack?.name?.startsWith(TRIP_PACK_PREFIX));
}

async function statuses(list: NativePack[]): Promise<PackStatus[]> {
  const out: PackStatus[] = [];
  for (const pack of list) {
    try {
      const status = await pack.status();
      out.push({
        name: pack.name,
        requiredResourceCount: status.requiredResourceCount ?? 0,
        completedResourceCount: status.completedResourceCount ?? 0,
        completedResourceSize: status.completedResourceSize ?? 0,
      });
    } catch {
      // A pack the native side cannot describe is not complete.
      out.push({ name: pack.name, requiredResourceCount: 0, completedResourceCount: 0, completedResourceSize: 0 });
    }
  }
  return out;
}

/** Is this trip's map on the phone? Re-read each time; never cached. */
export async function readTripDownload(tripKey: string, chunks: readonly TripChunk[]): Promise<TripDownloadState> {
  try {
    const mine = (await packs()).filter((pack) => isTripPack(pack.name, tripKey));
    return tripDownloadState(chunks.map((chunk) => chunk.name), await statuses(mine));
  } catch (error) {
    warn('float', 'could not read trip downloads', error);
    return { kind: 'none' };
  }
}

/**
 * Download every chunk, resuming any that already exist. Resolves once all
 * are requested; completion is read back with readTripDownload, because the
 * native module reports progress per pack and keeps working after this
 * returns. Rejects on the first native error.
 */
export async function startTripDownload(chunks: readonly TripChunk[], onError: (message: string) => void): Promise<void> {
  const manager = getOfflineManager();
  if (!manager) throw new Error('Maps are unavailable in this build.');
  const existing = new Map((await packs()).map((pack) => [pack.name, pack]));
  for (const chunk of chunks) {
    const pack = existing.get(chunk.name);
    if (pack) {
      await pack.resume();
      continue;
    }
    await manager.createPack(
      { name: chunk.name, styleURL: STYLE_URL, bounds: chunk.bounds, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM },
      () => {},
      (_pack: unknown, error: { message?: string }) => onError(error?.message ?? 'Download stopped.'),
    );
  }
}

/** Remove one trip's map. Tiles other trips share stay (TileStore keeps them). */
export async function removeTripDownload(tripKey: string): Promise<void> {
  const manager = getOfflineManager();
  if (!manager) return;
  for (const pack of await packs()) {
    if (isTripPack(pack.name, tripKey)) await manager.deletePack(pack.name);
  }
}

export interface StoredTrip {
  tripKey: string;
  bytes: number;
}

/** Every trip map on the phone, for the Storage screen. */
export async function listTripDownloads(): Promise<StoredTrip[]> {
  try {
    const all = await statuses(await packs());
    const byTrip = new Map<string, number>();
    for (const pack of all) {
      const tripKey = pack.name.slice(TRIP_PACK_PREFIX.length).replace(/:\d+$/, '');
      byTrip.set(tripKey, (byTrip.get(tripKey) ?? 0) + pack.completedResourceSize);
    }
    return [...byTrip].map(([tripKey, bytes]) => ({ tripKey, bytes }));
  } catch (error) {
    warn('float', 'could not list trip downloads', error);
    return [];
  }
}
