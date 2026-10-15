// eddy-ios/src/lib/floatTrackerStatus.ts
// What the location stream for the active float is ACTUALLY doing, and what
// Float Mode says about it.
//
// Permission says what tracking is allowed to do; this says what it does.
// "Always" can be granted while the background stream failed to start, and
// tracking then runs only while Eddy is on screen. Float Mode used to read
// the permission alone and promise locked-phone tracking anyway.
//
// FloatTracker is the only writer. Pure apart from module state, so the web
// suite tests the copy (missouri-float-planner/src/lib/float-permissions.test.ts).

import type { TrackingMode } from './floatPermissions';

export type TrackerStatus =
  /** No active float, or not started yet. */
  | 'idle'
  /** A start is under way. */
  | 'starting'
  /** The background stream is running: tracks with the phone locked. */
  | 'background'
  /** A foreground watch is running: stops when the phone locks. */
  | 'foreground'
  /** Nothing running because location is not allowed; the permission notice covers it. */
  | 'blocked'
  /** A start failed, or the stream reported an error. Retry may fix it. */
  | 'failed';

export interface TrackerState {
  status: TrackerStatus;
  /** Background tracking was allowed but could not start; tracking fell back. */
  backgroundFailed: boolean;
}

const IDLE: TrackerState = { status: 'idle', backgroundFailed: false };

export function createTrackerStatusStore() {
  let state = IDLE;
  let retry: (() => void) | null = null;
  const listeners = new Set<() => void>();
  return {
    get: (): TrackerState => state,
    set(next: TrackerState): void {
      if (next.status === state.status && next.backgroundFailed === state.backgroundFailed) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** FloatTracker registers how to start again; the screen's Retry calls it. */
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
  text: string;
  /** 'info' is a plain note; the others are tappable. */
  action: 'info' | 'request' | 'settings' | 'retry';
}

/**
 * The one line Float Mode shows about tracking. A permission problem wins,
 * since nothing else can be fixed until it is; then what the stream is doing.
 * Never promises locked-phone tracking the stream is not providing.
 */
export function trackingLine(mode: TrackingMode, tracker: TrackerState, canAskAgain = false): TrackingLine | null {
  if (mode === 'none') {
    return canAskAgain
      ? { text: 'Eddy uses your location to track your float. Tap to allow.', action: 'request' }
      : { text: 'Location is off, so Eddy isn’t tracking. Turn it on in Settings.', action: 'settings' };
  }
  if (mode === 'approximate') {
    return { text: 'Turn on Precise Location to track your float.', action: 'settings' };
  }
  switch (tracker.status) {
    case 'idle':
    case 'blocked':
      return null;
    case 'starting':
      return { text: 'Starting location tracking…', action: 'info' };
    case 'failed':
      return { text: 'Eddy couldn’t start location tracking. Tap to try again.', action: 'retry' };
    case 'background':
      return {
        text: 'Tracking carries on with your phone locked. Leave Eddy open in the background rather than closing it: if you close it, tracking may pause until you open Eddy again.',
        action: 'info',
      };
    case 'foreground':
      if (tracker.backgroundFailed && mode === 'locked') {
        return {
          text: 'Locked-phone tracking couldn’t start, so tracking pauses while your phone is locked. Tap to try again.',
          action: 'retry',
        };
      }
      return { text: 'Tracking pauses while your phone is locked. Allow “Always” in Settings to keep it going.', action: 'settings' };
  }
}
