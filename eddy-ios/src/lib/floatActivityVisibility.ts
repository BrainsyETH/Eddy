// eddy-ios/src/lib/floatActivityVisibility.ts
// "Hide Lock Screen card" in Float tools: the paddler's choice to end the
// float's Live Activity while tracking carries on, remembered for that float.
//
// Stored as the one float id that is hidden, so a new float starts with its
// card as usual and a relaunch mid-float keeps the card hidden. The float
// adapter (src/float/liveActivity.ts) reads this on every sync and ends the
// card instead of updating it; "Show" clears it and starts the card again.
// Memory answers immediately; storage is best effort, since a lost write only
// means the card can be shown again on the next explicit Show, never that
// tracking changes. Pure (storage is passed in), tested from
// missouri-float-planner/src/lib/float-activity-visibility.test.ts.

export const HIDDEN_ACTIVITY_KEY = 'eddy.floatActivity.hiddenSession';

export interface VisibilityStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createFloatActivityVisibility(storage: VisibilityStorage, warn: (message: string, detail?: unknown) => void = () => {}) {
  let hidden: string | null = null;
  let loading: Promise<void> | null = null;
  // A choice made before the stored one is read must not be overwritten by it.
  let chosen = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const persist = (value: string | null) =>
    (value == null ? storage.removeItem(HIDDEN_ACTIVITY_KEY) : storage.setItem(HIDDEN_ACTIVITY_KEY, value))
      .catch((error) => warn('could not save Lock Screen card choice', error));
  const set = (value: string | null): Promise<void> => {
    chosen = true;
    if (value === hidden) return Promise.resolve();
    hidden = value;
    notify();
    return persist(value);
  };
  return {
    ensureLoaded(): Promise<void> {
      loading ??= storage.getItem(HIDDEN_ACTIVITY_KEY).then(
        (stored) => {
          if (chosen || !stored || stored === hidden) return;
          hidden = stored;
          notify();
        },
        (error) => warn('could not read Lock Screen card choice', error),
      );
      return loading;
    },
    isHidden(sessionId: string | null | undefined): boolean {
      return sessionId != null && hidden === sessionId;
    },
    /** The hidden float's id, for useSyncExternalStore. */
    hiddenSession(): string | null {
      return hidden;
    },
    setHidden(sessionId: string, hide: boolean): Promise<void> {
      if (hide) return set(sessionId);
      return hidden === sessionId ? set(null) : Promise.resolve();
    },
    /** The float ended: nothing is hidden any more. */
    clear(): Promise<void> {
      return hidden == null ? Promise.resolve() : set(null);
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
