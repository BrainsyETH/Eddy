// eddy-ios/src/float/recorder.ts
// The native float recorder (modules/eddy-float-recorder, ADR 0014) wired to
// the session store, the app state and River Mode's tracking line. The logic
// is src/lib/floatRecorderSync.ts; this supplies the real dependencies and
// attaches the listeners, once per process, from the root layout.

import { AppState } from 'react-native';
import { floatRecorder } from '../../modules/eddy-float-recorder';
import {
  ensureFloatSessionLoaded,
  floatSessionLoadFailed,
  getFloatSession,
  recordFixes,
  setFinishRecording,
  subscribeFloatSession,
} from '@/lib/floatSessionStore';
import { createFloatRecorderSync } from '@/lib/floatRecorderSync';
import { trackerStatus } from '@/lib/floatTrackerStatus';
import { warn } from '@/lib/monitoring';
import { retryFloatTrackDeletions } from './floatTracks';

const sync = createFloatRecorderSync({
  recorder: floatRecorder,
  getSession: getFloatSession,
  ensureLoaded: ensureFloatSessionLoaded,
  loadFailed: floatSessionLoadFailed,
  record: recordFixes,
  isForeground: () => AppState.currentState === 'active',
  setTracker: (state) => trackerStatus.set(state),
  warn: (message, detail) => warn('float', message, detail),
});

let attached = false;

/**
 * Attach once per process. Listeners first, so no event is missed; then the
 * stored float is loaded, recording made to match it, and the journal
 * replayed. At module scope in the root layout, not in a component: when iOS
 * relaunches Eddy in the background mid-float the recorder has already
 * resumed natively, and this replays its journal whether or not a screen
 * ever mounts.
 */
export function attachFloatRecorder(): void {
  if (attached) return;
  attached = true;
  sync.sessionChanged();
  if (floatRecorder) {
    floatRecorder.addListener('onFixes', (event) => void sync.onFixes(event));
    floatRecorder.addListener('onStatus', sync.onStatus);
  }
  trackerStatus.onRetry(() => void sync.ensureRecording());
  setFinishRecording(sync.finish);

  const refresh = () => void sync.ensureRecording().then(sync.catchUp);

  // React to a float starting or ending, not to every fix.
  let activeId: string | null = null;
  subscribeFloatSession(() => {
    const id = getFloatSession()?.id ?? null;
    if (id === activeId) return;
    activeId = id;
    sync.sessionChanged();
    refresh();
  });

  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    refresh();
    void retryFloatTrackDeletions();
  });

  refresh();
  void retryFloatTrackDeletions();
}
