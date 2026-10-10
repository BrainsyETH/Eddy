// eddy-ios/src/float/tripDownloads.ts
// Trip map downloads, on top of @rnmapbox/maps' offlineManager (ADR 0011).
//
// Thin on purpose: what to download and when it counts as complete are decided
// in src/lib/tripDownload.ts, where they are tested. This file only talks to
// the native module, and treats every failure as "not ready" rather than
// guessing.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STYLE_URL, getOfflineManager } from '@/map/runtime';
import { warn } from '@/lib/monitoring';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  TRIP_PACKAGE_VERSION,
  TRIP_PACK_PREFIX,
  isTripPack,
  tripPackageKey,
  type PackStatus,
  type TripChunk,
  type TripPackage,
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

/** This trip's packs as the native store reports them. Re-read each time; never cached. */
export async function readTripPacks(tripKey: string): Promise<PackStatus[]> {
  try {
    return await statuses((await packs()).filter((pack) => isTripPack(pack.name, tripKey)));
  } catch (error) {
    warn('float', 'could not read trip downloads', error);
    return [];
  }
}

/** The saved route package for a trip, or null if missing, unreadable or from another format. */
export async function readTripPackage(tripKey: string): Promise<TripPackage | null> {
  try {
    const raw = await AsyncStorage.getItem(tripPackageKey(tripKey));
    const parsed = raw ? (JSON.parse(raw) as TripPackage) : null;
    return parsed?.version === TRIP_PACKAGE_VERSION && parsed.route ? parsed : null;
  } catch {
    return null;
  }
}

/** Save a trip's route package. Throws: a download must not start without it. */
export async function saveTripPackage(pkg: TripPackage): Promise<void> {
  await AsyncStorage.setItem(tripPackageKey(pkg.tripKey), JSON.stringify(pkg));
}

/** The current map style, for packages and readiness. */
export const TRIP_STYLE_URL = STYLE_URL;

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
      // A pack found after a relaunch has no listener in this process;
      // attach one first, or its errors would go unheard.
      await manager.subscribe(chunk.name, () => {}, (_pack: unknown, error: { message?: string }) =>
        onError(error?.message ?? 'Download stopped.'),
      );
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

/**
 * Remove one trip's map and its route package. Tiles other trips share stay
 * (TileStore keeps them). The saved float itself is untouched.
 */
export async function removeTripDownload(tripKey: string): Promise<void> {
  const manager = getOfflineManager();
  if (manager) {
    for (const pack of await packs()) {
      if (isTripPack(pack.name, tripKey)) await manager.deletePack(pack.name);
    }
  }
  await AsyncStorage.removeItem(tripPackageKey(tripKey)).catch(() => {});
}

export interface StoredTrip {
  tripKey: string;
  bytes: number;
  /** From the route package, when there is one. */
  label: string | null;
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
    const out: StoredTrip[] = [];
    for (const [tripKey, bytes] of byTrip) {
      const pkg = await readTripPackage(tripKey);
      const from = pkg?.route.anchors.find((a) => a.id === pkg.fromId)?.name;
      const to = pkg?.route.anchors.find((a) => a.id === pkg.toId)?.name;
      out.push({ tripKey, bytes, label: from && to ? `${from} → ${to}` : null });
    }
    return out;
  } catch (error) {
    warn('float', 'could not list trip downloads', error);
    return [];
  }
}
