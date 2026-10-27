// eddy-ios/src/lib/floatRecording.ts
// The JS side of native float recording: what the recorder sends, how its
// journal is read into the session, and what its status means. Pure, so the
// web suite tests it (missouri-float-planner/src/lib/float-recording.test.ts).
// The wiring is src/float/recorder.ts; the decision is ADR 0014.
//
// ── The journal is the record; the session is derived from it ───────────────
// The native recorder appends every raw fix to a per-float journal before
// telling JS. The session stores `journalTo`, the byte offset it has applied
// up to, in the same write as the progress derived from those fixes. So the
// session is a checkpoint: whatever happened after it (Eddy killed, JS not yet
// running, an event missed) is in the journal past that offset, and is applied
// on the next read. Nothing is applied twice and nothing is skipped.

import type { PositionFix } from '@eddy/geo';

/** One raw fix, as FloatJournal.swift writes it. */
export interface RecordedFix {
  /** ms since 1970, from the fix. */
  t: number;
  lng: number;
  lat: number;
  /** Horizontal accuracy, metres. */
  acc: number;
  spd?: number;
  crs?: number;
  alt?: number;
  vacc?: number;
}

/** Core Location's own flags, from updates and from the service session. */
export interface RecorderFlags {
  authorizationDenied?: boolean;
  authorizationDeniedGlobally?: boolean;
  authorizationRestricted?: boolean;
  authorizationRequestInProgress?: boolean;
  insufficientlyInUse?: boolean;
  locationUnavailable?: boolean;
  accuracyLimited?: boolean;
  fullAccuracyDenied?: boolean;
  serviceSessionRequired?: boolean;
  stationary?: boolean;
}

export interface RecorderStatus {
  state: 'idle' | 'recording' | 'failed';
  sessionId?: string;
  lastFixAt?: number;
  update: RecorderFlags;
  session: RecorderFlags;
  /**
   * The last fix could not be written to the journal. Held by the recorder
   * until a later write succeeds, so the screen keeps saying so meanwhile.
   */
  journalError?: boolean;
  /** Start was refused because Eddy was in the background; retry from the foreground. */
  notInForeground?: boolean;
}

export function toPositionFix(fix: RecordedFix): PositionFix {
  return { lngLat: [fix.lng, fix.lat], accuracyMeters: fix.acc, timestamp: fix.t };
}

/**
 * What to do with a batch of fixes at journal offsets [from, to) given the
 * session has applied up to `cursor`:
 *   apply     it continues exactly where the session is
 *   skip      already applied (a replay overtook the event)
 *   catch-up  there is a gap (an event was missed, or arrived out of order):
 *             read the journal from the cursor instead
 */
export function planIngest(cursor: number, batch: { from: number; to: number }): 'apply' | 'skip' | 'catch-up' {
  if (batch.to <= cursor) return 'skip';
  if (batch.from === cursor) return 'apply';
  return 'catch-up';
}

/** How much journal to read per call while catching up. */
export const JOURNAL_PAGE_BYTES = 256 * 1024;

export type TrackerStatus =
  /** No active float. */
  | 'idle'
  /** Asked the recorder to start; nothing reported yet. */
  | 'starting'
  /** Recording: continues with the phone locked. */
  | 'recording'
  /** Recording stopped on an error, or the journal could not be written. */
  | 'failed'
  /** This build has no recorder (Expo Go). */
  | 'unavailable';

export interface TrackerState {
  status: TrackerStatus;
  /** Location Services are off for the whole phone. */
  servicesOff: boolean;
  /** Eddy's location permission is denied or restricted. */
  denied: boolean;
  /** Precise Location is off. */
  preciseOff: boolean;
  /** iOS says Eddy is not in use, so updates are held until it is opened. */
  notInUse: boolean;
}

export const IDLE_TRACKER: TrackerState = { status: 'idle', servicesOff: false, denied: false, preciseOff: false, notInUse: false };

/**
 * The tracker state for the active float, from the recorder's report. A
 * report for another float (or none) means this float is not recording yet.
 */
export function trackerState(report: RecorderStatus | null, activeSessionId: string | null, available: boolean): TrackerState {
  if (!activeSessionId) return IDLE_TRACKER;
  if (!available) return { ...IDLE_TRACKER, status: 'unavailable' };
  if (!report || report.sessionId !== activeSessionId) return { ...IDLE_TRACKER, status: 'starting' };
  const u = report.update ?? {};
  const s = report.session ?? {};
  // A request in progress is iOS asking right now; nothing is denied yet.
  const asking = Boolean(u.authorizationRequestInProgress || s.authorizationRequestInProgress);
  // A start refused for being in the background is not a failure to show: the
  // next foreground starts it (floatRecorderSync.ensureRecording).
  const refused = report.state === 'failed' && report.notInForeground === true;
  return {
    status: refused ? 'starting' : report.state === 'failed' || report.journalError ? 'failed' : report.state === 'recording' ? 'recording' : 'starting',
    servicesOff: Boolean(u.authorizationDeniedGlobally || s.authorizationDeniedGlobally),
    denied: !asking && Boolean(u.authorizationDenied || s.authorizationDenied || u.authorizationRestricted || s.authorizationRestricted),
    preciseOff: Boolean(u.accuracyLimited || s.fullAccuracyDenied),
    notInUse: Boolean(u.insufficientlyInUse || s.insufficientlyInUse),
  };
}
