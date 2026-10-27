// eddy-ios/src/float/floatTracks.ts
// The raw GPS track of each float: the native recorder's journal, kept on
// this phone after the float ends (ADR 0014). It goes when its recap is
// deleted from history, and all of them go with account deletion
// (discardFloat). Never backed up or uploaded.
//
// Deletion is durable and retried (floatTrackDeletion.ts): a failure is
// reported to the caller and queued, never swallowed.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { floatRecorder } from '../../modules/eddy-float-recorder';
import { createTrackDeletions, type TrackDeletion } from '@/lib/floatTrackDeletion';
import { warn } from '@/lib/monitoring';

const deletions = createTrackDeletions(AsyncStorage, async (sessionId) => {
  // A build without the recorder has no tracks to delete.
  if (floatRecorder) await floatRecorder.deleteJournal(sessionId);
});

/**
 * Delete one float's track, with its recap. Resolves 'queued' when the track
 * could not be deleted yet (it will be retried); rejects when even the intent
 * could not be saved, in which case nothing was deleted.
 */
export function deleteFloatTrack(sessionId: string): Promise<TrackDeletion> {
  return deletions.request(sessionId);
}

/** Retry deletions that failed earlier; at launch and each foreground. */
export function retryFloatTrackDeletions(): Promise<void> {
  return deletions.retryPending().catch((error) => warn('float', 'could not retry track deletions', error));
}

/** Account deletion: every track. Rejects if any could not be deleted. */
export async function deleteAllFloatTracks(): Promise<void> {
  if (!floatRecorder) return;
  await floatRecorder.deleteAllJournals();
  await deletions.clear().catch(() => {});
}

/** Tracks whose deletion is still owed (floatTrackDeletion.ts), for the Storage screen. */
export function pendingFloatTrackDeletions(): Promise<string[]> {
  return deletions.pending().catch(() => []);
}

/** Bytes used by every float's track, for the Storage screen. */
export function floatTracksSize(): Promise<number> {
  return floatRecorder ? floatRecorder.journalSize().catch(() => 0) : Promise.resolve(0);
}
