import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFloatArchive } from './floatArchiveCore';
import { deleteFloatTrack } from '../float/floatTracks';
import { warn } from './monitoring';

// No native IO on import. The foreground provider or end journal loads lazily.
// A recap deleted on another device takes this phone's raw track with it, the
// same way deleting it here does (floatTracks.ts: durable, retried).
export const floatArchive = createFloatArchive(AsyncStorage, Date.now, (ids) => {
  for (const id of ids) {
    void deleteFloatTrack(id).catch((error) => warn('float', 'could not queue a remote-deleted track for deletion', error));
  }
});
