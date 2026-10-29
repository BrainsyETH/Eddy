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
//   since; the recorder wiring asks for the CURRENT session every time.
//
//   One start at a time: a start reserves itself before it awaits the disk,
//   so two quick taps cannot both pass the "nothing active" check.
//
//   A reminder is "sent" only once the notifier accepted it. It is marked
//   pending and that is written to disk (awaited) before it is handed over;
//   a failed handover makes it eligible again; only a success records it as
//   sent. See floatReminders.ts for why a relaunch clears pending.
//
//   "No float" and "could not read the float" are different answers. A read
//   that failed is retried on the next ensureLoaded; until one succeeds,
//   begin refuses (a new float would overwrite the one it could not see) and
//   loadFailed() lets the recorder wiring keep recording instead of stopping.
//
//   An ended float stays ended. Tracking stops at once; if the stored copy
//   cannot be removed, removal is retried, and an "ended" marker under its own
//   key makes the next launch discard the copy instead of resuming it.

import { createStorageQueue } from './storageQueue';
import type { PositionFix, RouteIndex } from '@eddy/geo';
import { applyFix, indexRoute, restoreSession, type FloatSession } from './floatSession';
import {
  dueReminders,
  markPending,
  remindersOf,
  settleDelivery,
  type DueReminder,
  type FloatReminderSettings,
} from './floatReminders';

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type BeginResult = 'started' | 'already-active' | 'storage-failed' | 'unreadable';

export const STORAGE_KEY = 'eddy.floatSession.v1';
/** The id of a float that was ended but whose stored copy may remain. */
export const ENDED_KEY = 'eddy.floatSession.ended.v1';
const WRITE_THROTTLE_MS = 15_000;
/**
 * How far ahead of the phone's clock a recorded fix may be stamped and still
 * be accepted: delivery jitter between Core Location and JavaScript, not a
 * clock that was set back mid-float.
 */
export const FUTURE_FIX_SKEW_MS = 5_000;
const END_RETRY_MS = 15_000;
/** A reminder the notifier did not accept is tried again after this. */
const REMINDER_RETRY_MS = 60_000;

export function createFloatSessionStore(
  rawStorage: SessionStorage,
  warn: (message: string, detail?: unknown) => void,
  /**
   * Hand reminders this position has reached to the notifier; resolves with
   * the ids it accepted. See floatReminders.ts.
   */
  onReminders: (due: DueReminder[], session: FloatSession) => Promise<readonly string[]> = async () => [],
  onEnd: (session: FloatSession, endedAt: number, contributionVersion: string | null) => Promise<void> = async () => {},
) {
  const writes = createStorageQueue();
  const storage: SessionStorage = {
    getItem: (key) => writes.run(() => rawStorage.getItem(key)),
    setItem: (key, value) => writes.run(() => rawStorage.setItem(key, value)),
    removeItem: (key) => writes.run(() => rawStorage.removeItem(key)),
  };
  let pendingRecap: { session: FloatSession; endedAt: number; contributionVersion?: string | null } | null = null;
  let ending: Promise<boolean> | null = null;
  let finalizing: Promise<boolean> | null = null;
  let session: FloatSession | null = null;
  let index: RouteIndex | null = null;
  let loading: Promise<void> | null = null;
  /** The last load could not read storage; the next ensureLoaded tries again. */
  let loadFailed = false;
  /** One read of the stored float has succeeded; null from get() now means "no float". */
  let loaded = false;
  let dirty = false;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  /** A start in flight, holding the slot until it lands or fails. */
  let starting = false;
  /** An ended float whose stored copy still needs removing. */
  let pendingEndId: string | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  /** Reminder handovers still running. */
  const deliveries = new Set<Promise<void>>();
  /**
   * When a reminder the notifier refused may be tried again. Kept in memory:
   * without it a refused reminder (no notification permission, say) would be
   * retried, and written, on every fix inside its window.
   */
  const retryAt = new Map<string, number>();
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
    if (session) await storage.setItem(STORAGE_KEY, JSON.stringify(session));
    // Only the end transaction removes the session key.
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

  /**
   * Pending is on disk before the notifier sees anything; sent is recorded
   * only for what it accepted. If pending cannot be written the reminder is
   * still delivered: a missed take-out is worse than a possible repeat.
   */
  const deliver = async (due: DueReminder[], sessionId: string, now: number): Promise<void> => {
    clearTimer();
    try {
      await writeNow();
    } catch (error) {
      dirty = true;
      warn('could not save pending reminders; delivering anyway', error);
    }
    const attempted = due.map((reminder) => reminder.id);
    let delivered: readonly string[] = [];
    try {
      if (session?.id === sessionId) delivered = await onReminders(due, session);
    } catch (error) {
      warn('could not deliver a float reminder', error);
    }
    if (session?.id !== sessionId) return;
    const accepted = new Set(delivered);
    for (const id of attempted) {
      if (accepted.has(id)) retryAt.delete(id);
      else retryAt.set(id, now + REMINDER_RETRY_MS);
    }
    session = settleDelivery(session, attempted, delivered);
    notify();
    await writeQuietly();
  };

  return {
    /**
     * Read the stored float, once per process. Then use get(). A read that
     * failed is not remembered as "no float": the next call reads again.
     */
    ensureLoaded(): Promise<void> {
      loading ??= (async () => {
        try {
          await this.loadOnce();
          const changed = loadFailed || !loaded;
          loadFailed = false;
          loaded = true;
          if (changed) notify();
        } catch (error) {
          warn('could not read the float session', error);
          loading = null;
          if (!loadFailed) {
            loadFailed = true;
            notify();
          }
        }
      })();
      return loading;
    },

    /** One read of the stored float. Throws if storage could not be read. */
    async loadOnce(): Promise<void> {
      const marker = await storage.getItem(ENDED_KEY);
      if (marker?.startsWith('{')) {
        try {
          pendingRecap = JSON.parse(marker);
        } catch {
          // A float was ended but its journal is unreadable. It stays ended
          // (its recap is lost); clearing both keys keeps the corrupt journal
          // from failing every later launch and start.
          warn('ended-float journal is corrupt; discarded');
          await storage.removeItem(STORAGE_KEY);
          await storage.removeItem(ENDED_KEY);
          return;
        }
        pendingEndId = pendingRecap?.session.id ?? null;
        if (!(await this.retryPendingEnd())) return;
      }
      const restored = restoreSession(await storage.getItem(STORAGE_KEY));
      if (!restored || session) return;
      if (marker === restored.id) {
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
      // Cleared first, so subscribers never see the float and the failure
      // together; and loaded before publishing, so the one notification that
      // carries the float also says the read is done.
      loadFailed = false;
      loaded = true;
      publish(restored, built.index);
    },

    /**
     * The stored float could not be read. A float may exist that get() does
     * not show, so nothing may treat null as "no float" until a retry succeeds.
     */
    loadFailed(): boolean {
      return loadFailed;
    },

    /**
     * Whether the stored float has been read at least once. Until then a null
     * session is "not known yet", not "no float": a screen opened cold from a
     * Live Activity or a notification must wait rather than say there is none.
     */
    isLoaded(): boolean {
      return loaded;
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
      // A float may be stored that could not be read; starting would overwrite it.
      if (loadFailed) return 'unreadable';
      // Checked and reserved with no await in between.
      if (session || starting) return 'already-active';
      starting = true;
      try {
        if (pendingRecap && !(await this.retryPendingEnd())) return 'storage-failed';
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
        dirty = false;
        publish(next, built.index);
        return 'started';
      } finally {
        starting = false;
      }
    },

    /**
     * Feed GPS fixes, in time order. `journalTo` is the journal offset these
     * fixes end at (floatRecording.ts); it is saved with what they changed,
     * even when no fix changed anything, so they are never applied twice.
     *
     * Journal fixes are judged as of their own time: each was live when the
     * recorder wrote it, and one replayed after a relaunch is a real past
     * position, not a stale reading of where the paddler is now. Reminders
     * below still use the real clock, so a replayed position never prompts.
     *
     * But never as of a time ahead of the phone's clock (beyond
     * FUTURE_FIX_SKEW_MS): judged at its own timestamp, a future-stamped fix
     * would always pass applyFix's "not in the future" check, and every
     * reader that trusts the newest fix as the time (River Mode's clock,
     * Float tools' essentialsClock) would run ahead. Such a fix is refused;
     * its journal offset still advances, so it is never retried.
     */
    record(fixes: readonly PositionFix[], now = Date.now(), journalTo?: number): void {
      if (!session || !index) return;
      let next = session;
      const latest = now + FUTURE_FIX_SKEW_MS;
      for (const fix of fixes) next = applyFix(next, index, fix, journalTo != null ? Math.min(fix.timestamp, latest) : now);
      if (journalTo != null && journalTo !== next.journalTo) next = { ...next, journalTo };
      if (next === session) return;
      const due = dueReminders(next, index, now).filter((reminder) => (retryAt.get(reminder.id) ?? 0) <= now);
      if (due.length > 0) next = markPending(next, due.map((reminder) => reminder.id));
      session = next;
      notify();
      if (due.length === 0) {
        scheduleWrite();
        return;
      }
      clearTimer();
      const delivery = deliver(due, next.id, now).finally(() => deliveries.delete(delivery));
      deliveries.add(delivery);
    },

    /** Resolves once every reminder handover in progress has finished. */
    async remindersSettled(): Promise<void> {
      while (deliveries.size > 0) await Promise.all([...deliveries]);
    },

    /** Change this float's reminders; what was sent, or is being sent, stays so. */
    setReminders(update: (current: FloatReminderSettings) => Pick<FloatReminderSettings, 'takeOut' | 'stops' | 'hazards'>): void {
      if (!session) return;
      const current = remindersOf(session);
      const { takeOut, stops, hazards } = update(current);
      session = { ...session, reminders: { ...current, takeOut, stops, ...(hazards != null ? { hazards } : {}) } };
      notify();
      clearTimer();
      void writeQuietly();
    },

    async flush(): Promise<void> {
      clearTimer();
      if (dirty) await writeQuietly();
    },

    /** See FloatSession.trackingStoppedAt. Written now: it must survive a relaunch. */
    async stopTracking(at: number): Promise<void> {
      if (!session || session.trackingStoppedAt != null) return;
      session = { ...session, trackingStoppedAt: at };
      notify();
      clearTimer();
      await writeQuietly();
    },

    /**
     * End the float. Tracking stops at once. Resolves false if the stored copy
     * could not be removed yet; removal is then retried until it succeeds.
     * `endedAt` is when the float finished, for an automatic end that noticed
     * late (floatEnding.ts); the recap may still clamp it (floatRecap.ts).
     */
    end(contributionVersion: string | null = null, endedAt = Date.now(), recap = true): Promise<boolean> {
      if (ending) return ending;
      if (!session && !pendingRecap && !pendingEndId) return Promise.resolve(true);
      clearTimer();
      if (session) {
        // Without a recap (a float cancelled before it measured anything)
        // the bare id is journalled instead, so it still cannot resume.
        pendingRecap = recap ? { session, endedAt, contributionVersion } : null;
        pendingEndId = session.id;
      }
      publish(null, null);
      dirty = false;
      ending = this.retryPendingEnd().finally(() => { ending = null; });
      return ending;
    },

    /** Account deletion discards the active session without creating a recap. */
    async discard(): Promise<void> {
      clearTimer();
      if (endTimer) clearTimeout(endTimer);
      if (ending) await ending;
      if (finalizing) await finalizing;
      if (endTimer) clearTimeout(endTimer);
      pendingRecap = null;
      pendingEndId = null;
      publish(null, null);
      dirty = false;
      await storage.removeItem(ENDED_KEY);
      await storage.removeItem(STORAGE_KEY);
    },

    /** Try again to remove an ended float's stored copy. True once it is gone. */
    retryPendingEnd(endedId: string | null = pendingEndId): Promise<boolean> {
      if (finalizing) return finalizing;
      finalizing = this.finishPendingEnd(endedId).finally(() => { finalizing = null; });
      return finalizing;
    },

    async finishPendingEnd(endedId: string | null): Promise<boolean> {
      if (endTimer) {
        clearTimeout(endTimer);
        endTimer = null;
      }
      try {
        if (pendingRecap) {
          // Journal before archiving/removal: a kill at any later step replays
          // the same immutable recap id, never resumes tracking or duplicates it.
          await storage.setItem(ENDED_KEY, JSON.stringify(pendingRecap));
          await onEnd(pendingRecap.session, pendingRecap.endedAt, pendingRecap.contributionVersion ?? null);
        } else if (endedId != null) {
          // No recap to save: the id alone keeps a relaunch from resuming it.
          await storage.setItem(ENDED_KEY, endedId);
        }
        // Remove only the float that was ended: a newer one may have been
        // started into the same key since.
        const stored = restoreSession(await storage.getItem(STORAGE_KEY));
        if (stored && (stored.id === endedId || endedId == null)) await storage.removeItem(STORAGE_KEY);
        await storage.removeItem(ENDED_KEY);
        pendingEndId = null;
        pendingRecap = null;
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
