// eddy-ios/src/lib/floatTrackerStatus.ts
// What tracking is doing for the active float, and the one line Float Mode
// says about it.
//
// The state comes from the native recorder's own report (floatRecording.ts:
// trackerState), which carries Core Location's diagnostics as they arrive:
// Location Services off, permission denied, Precise Location off, not in use.
// Nothing here is inferred from a permission read or a start call's result.
// src/float/recorder.ts is the only writer. Pure apart from module state, so
// the web suite tests the copy (float-permissions.test.ts).

import { IDLE_TRACKER, type TrackerState } from './floatRecording';

export type { TrackerState } from './floatRecording';

export function createTrackerStatusStore() {
  let state: TrackerState = IDLE_TRACKER;
  let retry: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const same = (a: TrackerState, b: TrackerState) =>
    a.status === b.status && a.servicesOff === b.servicesOff && a.denied === b.denied && a.preciseOff === b.preciseOff && a.notInUse === b.notInUse;
  return {
    get: (): TrackerState => state,
    set(next: TrackerState): void {
      if (same(next, state)) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The recorder wiring registers how to start again; the screen's Retry calls it. */
    onRetry(handler: (() => void) | null): void {
      retry = handler;
    },
    retry(): void {
      retry?.();
    },
  };
}

export const trackerStatus = createTrackerStatusStore();

export interface TrackingLine {
  /** Short enough for the Float Mode panel. */
  text: string;
  /** More, for Float options. */
  detail?: string;
  /** 'info' is a plain note; the others are tappable. */
  action: 'info' | 'request' | 'settings' | 'retry';
}

/**
 * The one line Float Mode shows about tracking. Whatever blocks tracking wins,
 * most fundamental first, since nothing below it can work until it is fixed;
 * then what the recorder is doing. Locked-phone tracking is promised only
 * while the recorder reports recording with nothing blocking it.
 */
export function trackingLine(tracker: TrackerState, canAskAgain = false): TrackingLine | null {
  if (tracker.status === 'idle') return null;
  if (tracker.status === 'unavailable') {
    return { text: 'Float tracking isn’t available in this build of Eddy.', action: 'info' };
  }
  if (tracker.servicesOff) {
    return { text: 'Location Services are off, so Eddy isn’t tracking. Turn them on in Settings.', action: 'settings' };
  }
  if (tracker.denied) {
    return canAskAgain
      ? { text: 'Eddy needs your location to track your float. Tap to allow.', action: 'request' }
      : { text: 'Location is off for Eddy, so it isn’t tracking. Turn it on in Settings.', action: 'settings' };
  }
  if (tracker.preciseOff) {
    return { text: 'Precise Location is off, so Eddy can’t place you on the river. Turn it on in Settings.', action: 'settings' };
  }
  switch (tracker.status) {
    case 'starting':
      return { text: 'Starting location tracking…', action: 'info' };
    case 'failed':
      return { text: 'Eddy couldn’t keep recording your float. Tap to try again.', action: 'retry' };
    case 'recording':
      if (tracker.notInUse) {
        return { text: 'Tracking is held by iOS. Open Eddy to resume it.', action: 'retry' };
      }
      return {
        text: 'Tracking carries on with your phone locked.',
        detail:
          'Leave Eddy open in the background rather than closing it: if you close it, tracking may pause until you open Eddy again.',
        action: 'info',
      };
  }
}
