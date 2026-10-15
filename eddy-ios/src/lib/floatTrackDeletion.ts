// eddy-ios/src/lib/floatTrackDeletion.ts
// Deleting a float's raw GPS track (its native journal, ADR 0014) so that a
// failure is never silent and never final.
//
// The recap and the track are deleted together, but they live in different
// places, and once the recap is gone nothing on screen can ask again. So the
// intent is written first: the float's id goes into a pending list on disk,
// then the track is deleted, and only a confirmed deletion takes it off the
// list. A failure leaves it there, retried at every launch and foreground
// until it succeeds. If the intent itself cannot be written, nothing is
// deleted and the caller says so, so the recap stays and Delete can be tried
// again.
//
// Pure (storage and the native delete are passed in), so the web suite tests
// it: missouri-float-planner/src/lib/float-track-deletion.test.ts.

import { createSerialQueue } from './serialQueue';

export const PENDING_TRACK_DELETIONS_KEY = 'eddy.floatTracks.pendingDelete.v1';

export interface TrackDeletionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** What happened to a requested deletion. */
export type TrackDeletion =
  /** The track is gone. */
  | 'deleted'
  /** The track could not be deleted yet; it is queued and will be retried. */
  | 'queued';

export function createTrackDeletions(storage: TrackDeletionStorage, remove: (sessionId: string) => Promise<void>) {
  const run = createSerialQueue();

  const read = async (): Promise<string[]> => {
    const raw = await storage.getItem(PENDING_TRACK_DELETIONS_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  };
  const write = (ids: string[]) => storage.setItem(PENDING_TRACK_DELETIONS_KEY, JSON.stringify(ids));

  /** Try one pending id; it leaves the list only once the delete succeeded. */
  const attempt = async (sessionId: string): Promise<TrackDeletion> => {
    try {
      await remove(sessionId);
    } catch {
      return 'queued';
    }
    try {
      await write((await read()).filter((id) => id !== sessionId));
    } catch {
      // Deleted, but still listed: the next retry deletes nothing and clears it.
    }
    return 'deleted';
  };

  return {
    /**
     * Record the intent to delete this float's track, then try. Rejects only
     * if the intent could not be recorded, in which case nothing was deleted.
     */
    request(sessionId: string): Promise<TrackDeletion> {
      return run(async () => {
        const pending = await read();
        if (!pending.includes(sessionId)) await write([...pending, sessionId]);
        return attempt(sessionId);
      });
    },

    /** Retry every queued deletion. Never rejects. */
    retryPending(): Promise<void> {
      return run(async () => {
        let pending: string[] = [];
        try {
          pending = await read();
        } catch {
          return;
        }
        for (const id of pending) await attempt(id);
      });
    },

    /** After every track was deleted (account deletion), nothing is pending. */
    clear(): Promise<void> {
      return run(() => write([]));
    },

    pending: (): Promise<string[]> => run(read),
  };
}
