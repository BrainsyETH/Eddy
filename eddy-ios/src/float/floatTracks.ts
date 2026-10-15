// eddy-ios/src/float/floatTracks.ts
// The raw GPS track of each float: the native recorder's journal, kept on
// this phone after the float ends (ADR 0014). It goes when its recap is
// deleted from history, and all of them go with account deletion
// (discardFloat). Never backed up or uploaded.

import { floatRecorder } from '../../modules/eddy-float-recorder';

/** Delete one float's track, with its recap. Best effort: a leftover is only bytes. */
export function deleteFloatTrack(sessionId: string): Promise<void> {
  return floatRecorder ? floatRecorder.deleteJournal(sessionId).catch(() => {}) : Promise.resolve();
}

/** Bytes used by every float's track, for the Storage screen. */
export function floatTracksSize(): Promise<number> {
  return floatRecorder ? floatRecorder.journalSize().catch(() => 0) : Promise.resolve(0);
}
