// eddy-ios/src/lib/floatSessionStoreCore.ts
// The one active float, held outside React. See floatSessionStore.ts for why it
// is a module and not a context; this is the logic, with storage passed in so
// the web suite can test it (missouri-float-planner/src/lib/
// float-session-store.test.ts) against a disk that can fail.
//
// Two rules the tests hold it to:
//
//   A float is not active until it is on disk. beginFloat writes first and
//   publishes second, so a failed write is an error the start screen shows,
//   not a float that silently vanishes after the next interruption.
//
//   The session is read from the store, never from the result of the first
//   load. A load that found nothing at launch must not hide a float started
//   since; the background task asks for the CURRENT session every time.
//
//   One start at a time: a start reserves itself before it awaits the disk,
//   so two quick taps cannot both pass the "nothing active" check.
//
//   An ended float stays ended. Tracking stops at once; if the stored copy
//   cannot be removed, removal is retried, and an "ended" marker under its own
//   key makes the next launch discard the copy instead of resuming it.

import type { PositionFix, RouteIndex } from '@eddy/geo';
import { applyFix, indexRoute, restoreSession, type FloatSession } from './floatSession';

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type BeginResult = 'started' | 'already-active' | 'storage-failed';

export const STORAGE_KEY = 'eddy.floatSession.v1';
/** The id of a float that was ended but whose stored copy may remain. */
export const ENDED_KEY = 'eddy.floatSession.ended.v1';
const WRITE_THROTTLE_MS = 15_000;
const END_RETRY_MS = 15_000;

export function createFloatSessionStore(storage: SessionStorage, warn: (message: string, detail?: unknown) => void) {
  let session: FloatSession | null = null;
  let index: RouteIndex | null = null;
  let loading: Promise<void> | null = null;
  let dirty = false;
  let lastWriteAt = 0;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  /** A start in flight, holding the slot until it lands or fails. */
  let starting = false;
  /** An ended float whose stored copy still needs removing. */
  let pendingEndId: string | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  /** Publish a session that is known to index. */
  const publish = (next: FloatSession | null, nextIndex: RouteIndex | null) => {
    session = next;
    index = nextIndex;
    notify();
  };

  /** Throws on failure; callers decide what a failed write means. */
  const writeNow = async () => {
    lastWriteAt = Date.now();
    if (session) await storage.setItem(STORAGE_KEY, JSON.stringify(session));
    else await storage.removeItem(STORAGE_KEY);
    dirty = false;
  };

  /** Background persistence: a failure is retried on the next write. */
  const writeQuietly = async () => {
    try {
      await writeNow();
    } catch (error) {
      dirty = true;
      warn('could not save the float session', error);
    }
  };

  const scheduleWrite = () => {
    dirty = true;
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      if (dirty) void writeQuietly();
    }, WRITE_THROTTLE_MS);
  };

  const clearTimer = () => {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
  };

  return {
    /** Read the stored float, once per process. Then use get(). */
    ensureLoaded(): Promise<void> {
      loading ??= (async () => {
        try {
          const restored = restoreSession(await storage.getItem(STORAGE_KEY));
          if (!restored || session) return;
          // Ended last time, but the stored copy outlived it: finish ending.
          if ((await storage.getItem(ENDED_KEY)) === restored.id) {
            await storage.removeItem(STORAGE_KEY);
            await storage.removeItem(ENDED_KEY);
            return;
          }
          const built = indexRoute(restored.route);
          if (!built.ok) {
            // Calibration rules changed, or the data is corrupt: it cannot
            // show honest progress, so it is not resumed.
            warn('stored float session no longer indexes; discarded');
            await storage.removeItem(STORAGE_KEY);
            return;
          }
          publish(restored, built.index);
        } catch (error) {
          warn('could not read the float session', error);
        }
      })();
      return loading;
    },

    get(): FloatSession | null {
      return session;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Start a float: written to disk first, published only once it is there. */
    async begin(next: FloatSession): Promise<BeginResult> {
      await this.ensureLoaded();
      // Checked and reserved with no await in between.
      if (session || starting) return 'already-active';
      starting = true;
      try {
        const built = indexRoute(next.route);
        if (!built.ok) return 'storage-failed';
        try {
          await storage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (error) {
          warn('could not save a new float session', error);
          return 'storage-failed';
        }
        // The new float now occupies the key an unfinished end was clearing.
        pendingEndId = null;
        lastWriteAt = Date.now();
        dirty = false;
        publish(next, built.index);
        return 'started';
      } finally {
        starting = false;
      }
    },

    /** Feed GPS fixes, in time order, from the screen or a background task. */
    record(fixes: readonly PositionFix[], now = Date.now()): void {
      if (!session || !index || fixes.length === 0) return;
      let next = session;
      for (const fix of fixes) next = applyFix(next, index, fix, now);
      if (next === session) return;
      session = next;
      notify();
      scheduleWrite();
    },

    async flush(): Promise<void> {
      clearTimer();
      if (dirty) await writeQuietly();
    },

    /** For the background task, where the throttle timer may never fire. */
    async flushIfStale(minIntervalMs: number): Promise<void> {
      if (dirty && Date.now() - lastWriteAt >= minIntervalMs) await this.flush();
    },

    /**
     * End the float. Tracking stops at once. Resolves false if the stored copy
     * could not be removed yet; removal is then retried until it succeeds.
     */
    async end(): Promise<boolean> {
      clearTimer();
      const endedId = session?.id ?? null;
      publish(null, null);
      dirty = false;
      if (await this.retryPendingEnd(endedId)) return true;
      // Best effort: if even this cannot be written, the retries still run.
      if (endedId) await storage.setItem(ENDED_KEY, endedId).catch(() => {});
      return false;
    },

    /** Try again to remove an ended float's stored copy. True once it is gone. */
    async retryPendingEnd(endedId: string | null = pendingEndId): Promise<boolean> {
      if (endTimer) {
        clearTimeout(endTimer);
        endTimer = null;
      }
      try {
        // Remove only the float that was ended: a newer one may have been
        // started into the same key since.
        const stored = restoreSession(await storage.getItem(STORAGE_KEY));
        if (stored && (stored.id === endedId || endedId == null)) await storage.removeItem(STORAGE_KEY);
        await storage.removeItem(ENDED_KEY).catch(() => {});
        pendingEndId = null;
        return true;
      } catch (error) {
        warn('could not remove the ended float session; will retry', error);
        pendingEndId = endedId;
        endTimer = setTimeout(() => {
          endTimer = null;
          if (pendingEndId && !session) void this.retryPendingEnd();
        }, END_RETRY_MS);
        return false;
      }
    },
  };
}

export type FloatSessionStore = ReturnType<typeof createFloatSessionStore>;
