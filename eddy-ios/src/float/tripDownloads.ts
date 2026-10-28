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
import { redactText } from '@/lib/redact';
import { readStylePackStatus } from '../../modules/eddy-style-pack';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  TRIP_PACKAGE_VERSION,
  TRIP_PACK_PREFIX,
  isTripPack,
  offlineBadge,
  stylePackComplete,
  tripPackageKey,
  tripReadiness,
  type PackStatus,
  type TripChunk,
  type TripPackage,
} from '@/lib/tripDownload';

interface NativePack {
  name: string;
  status: () => Promise<PackStatus>;
  resume: () => Promise<void>;
}

/**
 * How long a native offline read may take before it counts as failed. The
 * card waits on these to show anything, and a native call that never answers
 * must not leave it on a spinner forever ("not ready" is the honest reading).
 */
const NATIVE_READ_TIMEOUT_MS = 8_000;

/** Reject if `promise` has not settled in time, naming the call for the log. */
export function bounded<T>(promise: Promise<T>, what: string, ms = NATIVE_READ_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function packs(): Promise<NativePack[]> {
  const manager = getOfflineManager();
  if (!manager) return [];
  const all = (await bounded(manager.getPacks(), 'offlineManager.getPacks')) as NativePack[];
  return all.filter((pack) => pack?.name?.startsWith(TRIP_PACK_PREFIX));
}

async function statuses(list: NativePack[]): Promise<PackStatus[]> {
  return Promise.all(list.map(async (pack): Promise<PackStatus> => {
    try {
      const status = await bounded(pack.status(), `pack.status(${pack.name})`);
      return {
        name: pack.name,
        requiredResourceCount: status.requiredResourceCount ?? 0,
        completedResourceCount: status.completedResourceCount ?? 0,
        completedResourceSize: status.completedResourceSize ?? 0,
      };
    } catch (error) {
      warn('float', 'could not read a trip download', error);
      // A pack the native side cannot describe is not complete.
      return { name: pack.name, requiredResourceCount: 0, completedResourceCount: 0, completedResourceSize: 0 };
    }
  }));
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
 * are requested; completion is read back from tile/style counts, because the
 * native module reports progress per pack and keeps working after this
 * returns. Start failures reject; later native failures call onError.
 * iOS serializes actual tile + style work in withSerialMapboxOffline; awaiting
 * createPack/resume here alone would only serialize the start requests.
 */
export async function startTripDownload(
  chunks: readonly TripChunk[],
  onError: (message: string) => void,
  /**
   * Aborted when the paddler stops the download while its packs are still
   * being created. Without it, packs created after Stop and remove had
   * iterated the store were never deleted, and the card showed "Map partly
   * saved" with no route package behind it.
   */
  signal?: AbortSignal,
): Promise<void> {
  const manager = getOfflineManager();
  if (!manager) throw new Error('Maps are unavailable in this build.');
  const existing = new Map((await packs()).map((pack) => [pack.name, pack]));
  for (const [index, chunk] of chunks.entries()) {
    if (signal?.aborted) return;
    const pack = existing.get(chunk.name);
    const operation = pack ? 'resume' : 'create';
    const failure = (error: unknown) => {
      const message = error instanceof Error ? error.message
        : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Download stopped.';
      // Preserve the native wording and operation, but never route geometry or
      // request credentials. Sentry adds the installed app's release/build.
      warn('float', 'offline map download failed', {
        operation, chunk: index + 1, chunks: chunks.length, detail: redactText(message),
      });
      return 'The map download stopped.';
    };
    const onNativeError = (_pack: unknown, error: unknown) => onError(failure(error));
    try {
      if (pack) {
        // A pack found after a relaunch has no listener in this process;
        // attach one first, or its errors would go unheard.
        await manager.subscribe(chunk.name, () => {}, onNativeError);
        await pack.resume();
        continue;
      }
      await manager.createPack(
        { name: chunk.name, styleURL: STYLE_URL, bounds: chunk.bounds, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM },
        () => {},
        onNativeError,
      );
    } catch (error) {
      throw new Error(failure(error));
    }
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
      if (isTripPack(pack.name, tripKey)) {
        // Removal cancels native work; that intentional cancellation is not a
        // download failure to show on the card being cleared.
        manager.unsubscribe(pack.name);
        await manager.deletePack(pack.name);
      }
    }
  }
  await AsyncStorage.removeItem(tripPackageKey(tripKey)).catch(() => {});
}

/** Account deletion: every trip's map and route package. Rejects if any could not be removed. */
export async function removeAllTripDownloads(): Promise<void> {
  const manager = getOfflineManager();
  const tripKeys = new Set<string>();
  if (manager) {
    for (const pack of await packs()) {
      tripKeys.add(pack.name.slice(TRIP_PACK_PREFIX.length).replace(/:\d+$/, ''));
    }
  }
  const keys = await AsyncStorage.getAllKeys();
  for (const key of keys) {
    const prefix = tripPackageKey('');
    if (key.startsWith(prefix)) tripKeys.add(key.slice(prefix.length));
  }
  for (const tripKey of tripKeys) await removeTripDownload(tripKey);
}

export interface StoredTrip {
  tripKey: string;
  bytes: number;
  /** From the route package, when there is one. */
  label: string | null;
  status: string;
}

/** Every trip map on the phone, for the Storage screen. */
export async function listTripDownloads(): Promise<StoredTrip[]> {
  try {
    const all = await statuses(await packs());
    const styleComplete = stylePackComplete(await readStylePackStatus(TRIP_STYLE_URL));
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
      const own = all.filter(pack => isTripPack(pack.name, tripKey));
      const readiness = tripReadiness(pkg, TRIP_STYLE_URL, own, own.map(pack => pack.name), styleComplete);
      out.push({ tripKey, bytes, label: from && to ? `${from} → ${to}` : null,
        status: offlineBadge(readiness, pkg != null) ?? 'Download incomplete' });
    }
    return out;
  } catch (error) {
    warn('float', 'could not list trip downloads', error);
    return [];
  }
}

/**
 * The offline status line for each saved float, keyed by its trip key; trips
 * with nothing on the phone are absent. One read of the native store for the
 * whole list, then the same rules as the trip's own card (tripReadiness).
 */
export async function readOfflineBadges(tripKeys: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (tripKeys.length === 0) return out;
  let all: PackStatus[] = [];
  try {
    all = await statuses(await packs());
  } catch (error) {
    warn('float', 'could not read trip downloads for the saved list', error);
  }
  const styleComplete = stylePackComplete(await readStylePackStatus(TRIP_STYLE_URL));
  await Promise.all(
    tripKeys.map(async (tripKey) => {
      const pkg = await readTripPackage(tripKey);
      const own = all.filter((pack) => isTripPack(pack.name, tripKey));
      const readiness = pkg || own.length > 0
        ? tripReadiness(pkg, TRIP_STYLE_URL, own, own.map((pack) => pack.name), styleComplete)
        : null;
      const badge = offlineBadge(readiness, pkg != null);
      if (badge) out.set(tripKey, badge);
    }),
  );
  return out;
}
