// eddy-ios/src/map/packSweep.ts
// Reclaims the Mapbox offline packs left behind by the removed download feature.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Eddy used to let you download a river's basemap tiles. That feature is gone,
// and the UI that could delete a pack went with it — so anyone who ever pressed
// Download has tens of megabytes sitting inside the app with no way to reach
// it short of deleting the app entirely. That is strictly worse than before the
// feature existed, and it is invisible: iOS reports it as "Eddy", not as
// "maps you no longer have a screen for".
//
// So the removal owes them a sweep. It ships in the release BEFORE the download
// UI is taken away, so there is never a build in which packs exist and nothing
// can remove them.
//
// ── Why it matches on the name ──────────────────────────────────────────────
//
// Packs Eddy created were named `river:<slug>:<index>` by the removed iOS
// `useOfflinePacks` feature; its shared planning helper generated each pack's
// name. The regex is inlined because that feature and helper are gone, and a
// sweep that depends on the thing it is cleaning up after cannot outlive it.
//
// Anything that does not match is left alone. Mapbox's store is shared, and a
// blanket `resetDatabase()` would also take the ambient cache and any pack
// another part of the app might one day own — a wider promise than "remove what
// Eddy downloaded".

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOfflineManager } from './runtime';
import { warn } from '@/lib/monitoring';

/**
 * Marks the sweep as done.
 *
 * Under the cache prefix on purpose, so `clearCache` takes it too: someone who
 * clears their data and then somehow has packs again gets swept again, which is
 * the harmless direction. It is NOT under a namespace the sweep would consider
 * user data.
 */
const SWEPT_KEY = 'eddy.cache.v1.packSweep';

/** The names the removed download feature wrote. Nothing else may be deleted. */
const EDDY_PACK = /^river:[^:]+:\d+$/;

/**
 * Delete every pack Eddy's old offline download created. Runs once per install.
 *
 * Never throws and never blocks a render — same posture as sweepStaleVersions,
 * and for the same reason: the only cost of a failed sweep is disk, and a
 * startup path that can take the app down to reclaim megabytes has its
 * priorities backwards.
 */
export async function sweepOfflinePacks(): Promise<void> {
  try {
    // Cheap check first. The overwhelmingly common case is an install that
    // has already swept, or never downloaded anything, and neither should
    // reach into the native module at all.
    if (await AsyncStorage.getItem(SWEPT_KEY)) return;

    // Null under Expo Go, where there is no native module — a no-op rather
    // than a crash. See runtime.ts.
    const manager = getOfflineManager();
    if (!manager) return;

    const packs: { name?: string }[] = await manager.getPacks();
    for (const pack of packs) {
      const name = pack.name ?? '';
      if (EDDY_PACK.test(name)) {
        await manager.deletePack(name);
      }
    }

    // Written only after the deletes actually ran. Marking it done up front
    // would make a failure permanent: the one install that most needs the
    // sweep — the one where deletePack threw — would never try again.
    await AsyncStorage.setItem(SWEPT_KEY, new Date().toISOString());
  } catch (err) {
    warn('map', 'could not sweep old offline packs', err);
  }
}
