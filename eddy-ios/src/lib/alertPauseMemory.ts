// eddy-ios/src/lib/alertPauseMemory.ts
// Which children a group switch found already paused, so resuming can put the
// group back the way it was rather than sweeping everything on.
//
// ── What this is, and what it is emphatically not ───────────────────────────
//
// It is NOT a client-side copy of server state. Every rule's own `enabled`
// column is the authority on whether it fires, this file never contradicts one,
// and losing this store entirely costs nothing but a little precision. What it
// records is a fact about an ACTION THE CLIENT TOOK — "when the Current River's
// switch was flicked off, its Akers gauge was already off" — which the server
// has no way to know and no reason to store.
//
// That distinction is the whole justification. A shadow of server state goes
// stale and starts lying; a log of what a control did is either present or
// absent, and its absence degrades to the behaviour the control had before this
// existed (resume everything).
//
// ── Why the master switch needs it at all ───────────────────────────────────
//
// See rulesToResume in alertGroups.ts. Short version: iOS-style master switches
// GATE their children, and Eddy cannot gate — no parent column exists on the
// wire, so a gated child would keep firing under a paused parent. The pause has
// to be real writes, and real writes destroy the information that gating would
// have preserved. This is where that information goes instead.
//
// Device-local, like the star store and the push opt-out: it describes a
// gesture made on this phone, and syncing it would let one device's tap decide
// what another device's switch restores.

export const ALERT_PAUSE_MEMORY_KEY = 'eddy.alerts.group-pause.v1';

export interface AlertPauseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function deviceStorage(): AlertPauseStorage {
  // Lazily required, like pushOptOut's and mapPreferences'. A native module
  // resolved at import costs the app its launch rather than costing this file
  // its feature.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as AlertPauseStorage;
}

/** parent rule key → the child rule keys that were already paused. */
type Memory = Record<string, string[]>;

async function read(storage: AlertPauseStorage): Promise<Memory> {
  try {
    const raw = await storage.getItem(ALERT_PAUSE_MEMORY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Memory = {};
    for (const [parent, children] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(children)) continue;
      out[parent] = children.filter((key): key is string => typeof key === 'string');
    }
    return out;
  } catch {
    // A corrupt value degrades to "remember nothing", which is the old
    // behaviour rather than a failure.
    return {};
  }
}

/**
 * The children to leave alone when this group is resumed.
 *
 * An unknown parent yields an empty set, which resumes everything — see
 * rulesToResume on why that is the right degradation.
 */
export async function pausedBeforeGroup(
  parentKey: string,
  storage: AlertPauseStorage = deviceStorage(),
): Promise<Set<string>> {
  return new Set((await read(storage))[parentKey] ?? []);
}

/**
 * Record what to leave alone, or clear the record with `null`.
 *
 * Cleared on resume rather than kept, so the store holds one entry per
 * CURRENTLY-paused group — bounded by the 25-rule ceiling the alerts route
 * enforces, and self-limiting rather than growing with use.
 *
 * Never throws. A switch that works and forgets is a far smaller failure than
 * one that reports an error about a preference nobody asked to set.
 */
export async function rememberPausedBeforeGroup(
  parentKey: string,
  childKeys: string[] | null,
  storage: AlertPauseStorage = deviceStorage(),
): Promise<void> {
  try {
    const memory = await read(storage);
    if (childKeys === null) delete memory[parentKey];
    else memory[parentKey] = Array.from(new Set(childKeys));
    await storage.setItem(ALERT_PAUSE_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Intentionally silent. See above.
  }
}

/**
 * Keep the record in step when a CHILD is toggled while its parent is paused.
 *
 * Without this the one case the memory exists for has a hole in it: pausing a
 * gauge while its river alert is already off would not be recorded, so
 * resuming the river would sweep that gauge back on — the exact behaviour this
 * module was written to stop, reached from the other direction.
 *
 * Only ever called while the parent is paused; a child toggled under a live
 * parent is not the switch's business and must not be recorded.
 */
export async function noteChildToggledWhilePaused(
  parentKey: string,
  childKey: string,
  enabled: boolean,
  storage: AlertPauseStorage = deviceStorage(),
): Promise<void> {
  try {
    const memory = await read(storage);
    const current = new Set(memory[parentKey] ?? []);
    // Resuming a child by hand means "this one is mine now" — drop it, so the
    // parent's switch stops skipping it.
    if (enabled) current.delete(childKey);
    else current.add(childKey);
    memory[parentKey] = Array.from(current);
    await storage.setItem(ALERT_PAUSE_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Intentionally silent. See above.
  }
}
