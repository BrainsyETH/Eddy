// eddy-ios/src/lib/mapPreferences.ts
// Which map layers this phone opens with.
//
// ── The bug this exists to end ──────────────────────────────────────────────
//
// The layer set was `useState(() => [...DEFAULT_LAYERS])` and nothing else, so
// every choice made in the layers sheet lasted exactly as long as the process
// did. Turn hazards off, background the app long enough for iOS to reclaim it,
// come back: hazards on. Nothing was broken and nothing said so, which is the
// worst shape a settings bug can take — the user concludes the switch does not
// work, and the only evidence available to them supports that.
//
// ── Device-local, not account state, and deliberately ───────────────────────
//
// The map is a VIEW, not a preference about the water. Someone with an iPad for
// planning and a phone for the gravel bar wants different layers on each, and
// syncing this to the account would make the last device to touch it win. It is
// also the setting most likely to be changed offline, on the screen this app is
// designed to work without signal on. AsyncStorage, same as the star store and
// the push opt-out, both of which are local for the same reasons.
//
// ── What is NOT persisted, and why the line is here ─────────────────────────
//
// The national-gauge trait filter next to this in the map's state stays
// per-session on purpose, and its own comment says why: a filter restored from
// last week reads as gauges having gone missing. A LAYER is different — the
// sheet lists every one of them with its switch, so an off layer is visible as
// off the moment you look. A filter has no such readout.

import type { LayerKey } from '@/map/layers';
import { DEFAULT_LAYERS } from '@/map/layers';

export const MAP_LAYERS_KEY = 'eddy.map.layers.v1';

export interface MapPreferenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function deviceStorage(): MapPreferenceStorage {
  // Lazily required, like pushOptOut's: this module is imported by a screen
  // that expo-router loads at startup, and a native module resolved at import
  // costs the app its launch rather than costing this file its feature.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as MapPreferenceStorage;
}

/**
 * Every key the current build knows about, for validating what came off disk.
 *
 * ── A RECORD, NOT A SET, SO THE COMPILER MAINTAINS IT ────────────────────
 *
 * This was `new Set<LayerKey>([...])`, which type-checks a list that is MISSING
 * members just as happily as a complete one — the annotation constrains what
 * may go in, not what must. The lodging tier was added to LayerKey and not to
 * here, so every phone that switched on Cabins & lodges had it silently
 * stripped on the next launch: the layer did not fail, it just quietly
 * un-chose itself, which is the hardest kind of bug to report.
 *
 * As a total Record, omitting a key is a compile error. Same technique as
 * SERVICE_TIERS in @eddy/types, and for the same reason — a list of keys
 * maintained by hand beside a union that already holds them is a second source
 * of truth waiting to drift.
 *
 * The VALUES mean nothing; only the keys are read. `true` rather than a real
 * payload because there is nothing else worth saying about a key here.
 */
const KNOWN_LAYERS: Record<LayerKey, true> = {
  access: true,
  boatRamps: true,
  campgrounds: true,
  gauges: true,
  allGauges: true,
  hazards: true,
  outfitters: true,
  lodging: true,
  dams: true,
  weatherRadar: true,
  publicLand: true,
};

const KNOWN: ReadonlySet<string> = new Set(Object.keys(KNOWN_LAYERS));

/**
 * The stored layer set, or null when there is nothing usable to restore.
 *
 * NULL AND [] ARE DIFFERENT ANSWERS, and conflating them is how "I turned
 * everything off" becomes "restore the defaults" on the next launch. Null means
 * this device has never chosen; an empty array is a choice and is honoured.
 *
 * Unknown keys are dropped rather than rejected wholesale — a build that
 * removes a layer must not throw away the six the user still has, and a build
 * that adds one leaves it off until it is switched on, which is the same thing
 * that happens to anyone who has ever opened the sheet.
 */
export async function readMapLayers(
  storage: MapPreferenceStorage = deviceStorage(),
): Promise<LayerKey[] | null> {
  try {
    const raw = await storage.getItem(MAP_LAYERS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((key): key is LayerKey => typeof key === 'string' && KNOWN.has(key));
  } catch {
    // A corrupt value is not worth a crash on the launch screen; the defaults
    // are a perfectly good map.
    return null;
  }
}

/**
 * Remember this layer set. Never throws — a map that draws correctly and forgets
 * is a smaller failure than one that cannot be looked at.
 */
export async function writeMapLayers(
  layers: LayerKey[],
  storage: MapPreferenceStorage = deviceStorage(),
): Promise<void> {
  try {
    await storage.setItem(MAP_LAYERS_KEY, JSON.stringify(layers));
  } catch {
    // Intentionally silent. See above.
  }
}

/** The set a device with nothing stored opens on. Copied, never aliased. */
export function defaultMapLayers(): LayerKey[] {
  return [...DEFAULT_LAYERS];
}
