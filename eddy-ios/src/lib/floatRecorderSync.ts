// eddy-ios/src/lib/floatRecorderSync.ts
// The native float recorder (modules/eddy-float-recorder, ADR 0014) kept in
// step with the session store. Its dependencies are passed in, so the web
// suite runs it against the real store and a mocked native bridge
// (missouri-float-planner/src/lib/float-recording.test.ts); src/float/
// recorder.ts supplies the real ones.
//
// ── What the native side does, and what this does ────────────────────────────
// Native code owns recording: it starts the Core Location sessions, appends
// every fix to the float's journal, and resumes by itself when iOS relaunches
// Eddy mid-float, before any JavaScript exists. This only reads: it applies
// journal fixes to the session, in order, exactly once (floatRecording.ts:
// planIngest), and turns the recorder's status reports into River Mode's
// tracking line (trackerState).
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
// Live events, journal catch-up reads and the final drain before a float is
// finalised run through one serial queue, so the session's journal offset
// only ever moves forward from where it is, and nothing is applied after the
// float's recap is taken.

import type { PositionFix } from '@eddy/geo';
import type { FloatSession } from './floatSession';
import {
  JOURNAL_PAGE_BYTES,
  planIngest,
  toPositionFix,
  trackerState,
  type RecordedFix,
  type RecorderStatus,
  type TrackerState,
} from './floatRecording';
import { createSerialQueue } from './serialQueue';

export interface FixesBatch {
  sessionId: string;
  from: number;
  to: number;
  fixes: RecordedFix[];
}

/** The parts of the native module this needs. */
export interface RecorderBridge {
  start(sessionId: string): Promise<RecorderStatus>;
  stop(sessionId: string | null): Promise<RecorderStatus>;
  status(): Promise<RecorderStatus>;
  read(sessionId: string, from: number, maxBytes: number): Promise<{ fixes: RecordedFix[]; next: number; end: number }>;
}

export interface RecorderSyncDeps {
  /** Null in builds without the native module. */
  recorder: RecorderBridge | null;
  getSession(): FloatSession | null;
  ensureLoaded(): Promise<void>;
  loadFailed(): boolean;
  /**
   * recordFixes: resolves the automatic end it triggered, if any. `settle`
   * false applies the fixes without judging an automatic end: more of the
   * journal is still to be read, and it may show the paddler carried on.
   */
  record(fixes: readonly PositionFix[], now: number, journalTo: number, settle: boolean): Promise<boolean> | null;
  isForeground(): boolean;
  setTracker(state: TrackerState): void;
  warn(message: string, detail?: unknown): void;
  now?: () => number;
}

/** The recorder failed for `sessionId`; keep any flags it last reported for it. */
export function failedReport(sessionId: string, previous: RecorderStatus | null): RecorderStatus {
  const same = previous?.sessionId === sessionId ? previous : null;
  return { state: 'failed', sessionId, update: same?.update ?? {}, session: same?.session ?? {} };
}

export function createFloatRecorderSync(deps: RecorderSyncDeps) {
  const { recorder } = deps;
  const now = deps.now ?? Date.now;
  const ingest = createSerialQueue();
  let lastReport: RecorderStatus | null = null;

  const publish = () => deps.setTracker(trackerState(lastReport, deps.getSession()?.id ?? null, recorder != null));

  const onStatus = (report: RecorderStatus) => {
    lastReport = report;
    publish();
  };

  const apply = async (fixes: RecordedFix[], journalTo: number, settle = true) => {
    const ended = deps.record(fixes.map(toPositionFix), now(), journalTo, settle);
    if (ended) await ended;
  };

  /**
   * Read the journal from the session's offset to its end. Runs inside `ingest`.
   *
   * RECONCILE FIRST, THEN JUDGE. Recovery reads the journal a page at a time,
   * and an early page can look like an ending (arrived an hour ago, or away
   * for 45 minutes) that later pages contradict. Pages are applied unsettled,
   * and the automatic end is judged once, on the whole journal. A read that
   * fails part-way judges nothing: the next delivery or catch-up finishes it.
   */
  const readThrough = async () => {
    if (!recorder) return;
    let unsettled = false;
    for (;;) {
      const session = deps.getSession();
      if (!session) return;
      const cursor = session.journalTo ?? 0;
      const page = await recorder.read(session.id, cursor, JOURNAL_PAGE_BYTES);
      if (deps.getSession()?.id !== session.id) return;
      // No complete line past the cursor (only a torn write is left): the
      // journal is read as far as it can be.
      if (page.next <= cursor) break;
      const last = page.next >= page.end;
      await apply(page.fixes, page.next, last);
      unsettled = !last;
      if (last) return;
    }
    const session = deps.getSession();
    if (unsettled && session) await apply([], session.journalTo ?? 0, true);
  };

  /**
   * Make the recorder match the session: recording the active float (from
   * the foreground), or stopped when there is none. A stored float that
   * could not be read is neither, so the recorder is left as it is.
   */
  async function ensureRecording(): Promise<void> {
    if (!recorder) {
      publish();
      return;
    }
    try {
      // "No float" is only an answer once the stored float has been read.
      await deps.ensureLoaded();
      const session = deps.getSession();
      if (!session) {
        if (deps.loadFailed()) return;
        const report = await recorder.status();
        if (report.state !== 'idle' && !deps.getSession()) onStatus(await recorder.stop(null));
        else onStatus(report);
        return;
      }
      // Stopped at Finish while its recap waits on the journal: never start
      // again, and stop a recorder iOS resumed for it.
      if (session.trackingStoppedAt != null) {
        const report = await recorder.status();
        const running = report.state !== 'idle' && (report.sessionId == null || report.sessionId === session.id);
        onStatus(running ? await recorder.stop(session.id) : report);
        return;
      }
      if (!deps.isForeground()) {
        onStatus(await recorder.status());
        return;
      }
      publish();
      const report = await recorder.start(session.id);
      // The float may have ended while the start was in flight; End stopped it.
      if (deps.getSession()?.id === session.id) onStatus(report);
    } catch (error) {
      deps.warn('could not start recording', error);
      // A failure for THIS float, even when nothing was reported before it,
      // so the screen offers Retry instead of "Starting…" forever.
      const id = deps.getSession()?.id;
      if (id) onStatus(failedReport(id, lastReport));
    }
  }

  return {
    onStatus,

    /** A live batch from the recorder. */
    onFixes(event: FixesBatch): Promise<void> {
      return ingest(async () => {
        const session = deps.getSession();
        if (!session || session.id !== event.sessionId) return;
        const plan = planIngest(session.journalTo ?? 0, event);
        if (plan === 'apply') await apply(event.fixes, event.to);
        else if (plan === 'catch-up') await readThrough();
      }).catch((error) => deps.warn('could not apply recorded fixes', error));
    },

    /** Apply whatever the journal holds past the session's checkpoint. */
    catchUp(): Promise<void> {
      return ingest(readThrough).catch((error) => deps.warn('could not read the float journal', error));
    },

    /** The active float changed (started or ended). */
    sessionChanged(): void {
      if (!deps.getSession()) lastReport = null;
      publish();
    },

    ensureRecording,

    /**
     * Before a float is finalised: stop recording, then apply everything the
     * journal holds through its final offset, so the recap includes every fix
     * recorded, including any still being replayed after a relaunch. Stopping
     * first means nothing is appended after the drain reads the end. Queued
     * behind any batch already being applied.
     *
     * Resolves false when the journal could not be read to its end: the float
     * must not be finalised from an incomplete checkpoint. Recording is then
     * started again, the float stays active, and Finish can be retried, or
     * the paddler can stop tracking anyway (floatSessionStore stopTracking),
     * which this then leaves stopped.
     *
     * An automatic end (floatEnding.ts) happens inside a batch being applied
     * and does not come here: it ends at the arrival or departure that batch
     * showed, and fixes after either are outside the float's accounting.
     */
    async finish(sessionId: string): Promise<boolean> {
      if (!recorder) return true;
      try {
        onStatus(await recorder.stop(sessionId));
      } catch (error) {
        // Still drain: whatever was written is in the journal either way.
        deps.warn('could not stop recording before ending', error);
      }
      try {
        await ingest(readThrough);
        return true;
      } catch (error) {
        deps.warn('could not read the float journal before ending', error);
        await ensureRecording();
        return false;
      }
    },
  };
}
