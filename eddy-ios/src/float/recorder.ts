// eddy-ios/src/float/recorder.ts
// The native float recorder (modules/eddy-float-recorder, ADR 0014) wired to
// the session store.
//
// ── What the native side does, and what this does ────────────────────────────
// Native code owns recording: it starts the Core Location sessions, appends
// every fix to the float's journal, and resumes by itself when iOS relaunches
// Eddy mid-float, before any JavaScript exists. This file only reads: it
// applies journal fixes to the session, in order, exactly once
// (floatRecording.ts: planIngest), and turns the recorder's status reports
// into Float Mode's tracking line (trackerState).
//
// ── When it asks the recorder to start ──────────────────────────────────────
// A float that is active but not recording is started whenever Eddy is in the
// foreground: at launch, when a float begins, when Eddy comes back to the
// front, and from Retry. Never from the background: Core Location only lets a
// new background session begin in the foreground, and resuming one is the
// native side's job. A recorder still running with no float (a float ended
// while Eddy was not running JS) is stopped.
//
// ── One ingest at a time ────────────────────────────────────────────────────
// Live events and journal catch-up reads run through one serial queue, so the
// session's journal offset only ever moves forward from where it is.

import { AppState } from 'react-native';
import { floatRecorder, type FixesEvent } from '../../modules/eddy-float-recorder';
import {
  ensureFloatSessionLoaded,
  floatSessionLoadFailed,
  getFloatSession,
  recordFixes,
  subscribeFloatSession,
} from '@/lib/floatSessionStore';
import {
  JOURNAL_PAGE_BYTES,
  planIngest,
  toPositionFix,
  trackerState,
  type RecordedFix,
  type RecorderStatus,
} from '@/lib/floatRecording';
import { trackerStatus } from '@/lib/floatTrackerStatus';
import { createSerialQueue } from '@/lib/serialQueue';
import { warn } from '@/lib/monitoring';

const ingest = createSerialQueue();
let lastReport: RecorderStatus | null = null;
let attached = false;

function publish(): void {
  trackerStatus.set(trackerState(lastReport, getFloatSession()?.id ?? null, floatRecorder != null));
}

async function apply(fixes: RecordedFix[], journalTo: number): Promise<void> {
  const ended = recordFixes(fixes.map(toPositionFix), Date.now(), journalTo);
  if (ended) await ended;
}

/** Read the journal from the session's offset to its end. Runs inside `ingest`. */
async function readThrough(): Promise<void> {
  if (!floatRecorder) return;
  for (;;) {
    const session = getFloatSession();
    if (!session) return;
    const cursor = session.journalTo ?? 0;
    const page = await floatRecorder.read(session.id, cursor, JOURNAL_PAGE_BYTES);
    if (getFloatSession()?.id !== session.id || page.next <= cursor) return;
    await apply(page.fixes, page.next);
    if (page.next >= page.end) return;
  }
}

/** Apply whatever the journal holds past the session's checkpoint. */
export function catchUpFromJournal(): Promise<void> {
  return ingest(readThrough).catch((error) => warn('float', 'could not read the float journal', error));
}

function onFixes(event: FixesEvent): void {
  void ingest(async () => {
    const session = getFloatSession();
    if (!session || session.id !== event.sessionId) return;
    const plan = planIngest(session.journalTo ?? 0, event);
    if (plan === 'apply') await apply(event.fixes, event.to);
    else if (plan === 'catch-up') await readThrough();
  }).catch((error) => warn('float', 'could not apply recorded fixes', error));
}

function onStatus(report: RecorderStatus): void {
  lastReport = report;
  publish();
}

/**
 * Make the recorder match the session: recording the active float (from the
 * foreground), or stopped when there is none. A stored float that could not
 * be read is neither, so the recorder is left as it is.
 */
export async function ensureRecording(): Promise<void> {
  try {
    if (!floatRecorder) {
      publish();
      return;
    }
    // "No float" is only an answer once the stored float has been read.
    await ensureFloatSessionLoaded();
    const session = getFloatSession();
    if (!session) {
      if (floatSessionLoadFailed()) return;
      const report = await floatRecorder.status();
      if (report.state !== 'idle' && !getFloatSession()) onStatus(await floatRecorder.stop(null));
      else onStatus(report);
      return;
    }
    if (AppState.currentState !== 'active') {
      onStatus(await floatRecorder.status());
      return;
    }
    publish();
    const report = await floatRecorder.start(session.id);
    // The float may have ended while the start was in flight; End stopped it.
    if (getFloatSession()?.id === session.id) onStatus(report);
  } catch (error) {
    warn('float', 'could not start recording', error);
    lastReport = lastReport ? { ...lastReport, state: 'failed' } : null;
    publish();
  }
}

/**
 * Attach once per process, from the root layout. Listeners first, so no
 * event is missed; then the stored float is loaded and the journal replayed.
 */
export function attachFloatRecorder(): void {
  if (attached) return;
  attached = true;
  publish();
  if (floatRecorder) {
    floatRecorder.addListener('onFixes', onFixes);
    floatRecorder.addListener('onStatus', onStatus);
  }
  trackerStatus.onRetry(() => void ensureRecording());

  // React to a float starting or ending, not to every fix.
  let activeId: string | null = null;
  subscribeFloatSession(() => {
    const id = getFloatSession()?.id ?? null;
    if (id === activeId) return;
    activeId = id;
    if (id == null) lastReport = null;
    publish();
    void ensureRecording().then(catchUpFromJournal);
  });

  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    void ensureRecording().then(catchUpFromJournal);
  });

  void ensureRecording().then(catchUpFromJournal);
}
