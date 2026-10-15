// eddy-ios/src/lib/floatSessionStore.ts
// The one active float, held outside React.
//
// ── Why a module and not a context ──────────────────────────────────────────
// Fixes arrive from the native recorder (src/float/recorder.ts, ADR 0014)
// whether or not any screen is mounted, including with the phone locked. The
// recorder wiring and the Float Mode screen must feed and read the SAME
// session, so it lives here, in plain module state, and React subscribes to it
// (useFloatSession). Nothing about a float depends on a
// component staying mounted: switching tabs or opening another screen leaves
// it exactly as it was.
//
// ── One float at a time ─────────────────────────────────────────────────────
// beginFloat refuses while another is active, so repeated taps cannot make
// two sessions. Ending is explicit; nothing here ends a float on its own.
// The logic, and the rules it is tested against, are in floatSessionStoreCore.ts.
//
// ── Storage ─────────────────────────────────────────────────────────────────
// Its own key, outside the cache prefix: clearing cached river data must not
// end a float in progress. The session is a checkpoint derived from the
// native journal, saved with the journal offset it covers (floatRecording.ts),
// so writes can be throttled (a fix can arrive every second): anything after
// the last write is replayed from the journal. Raw float positions stay on
// the phone, in that journal; completed summaries use the separate account
// archive. Hazard reports are a separate, explicit location submission.
//
// Ending a float, by any path, stops the native recorder here, so recording
// can never outlive the float.

import { floatArchive } from './floatArchive';
import { recapFloat } from './floatRecap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { PositionFix } from '@eddy/geo';
import type { FloatSession } from './floatSession';
import { createFloatSessionStore, type BeginResult } from './floatSessionStoreCore';
import { reminderCopy, type DueReminder, type FloatReminderSettings } from './floatReminders';
import { warn } from './monitoring';
import { syncFloatActivity } from '../float/liveActivity';
import { createFloatActivityLifecycle } from './floatActivity';
import { autoEndAt, autoEndCopy } from './floatEnding';
import { floatRecorder } from '../../modules/eddy-float-recorder';

/** Recording stops with the float, whichever way it ended. */
function stopRecording(sessionId: string | null): void {
  void floatRecorder?.stop(sessionId).catch((error) => warn('float', 'could not stop recording', error));
}

/**
 * A reminder is a local notification: scheduled on the phone, so it needs no
 * cell service, and shown even while locked (Phase 4 keeps fixes coming with
 * the screen off). Tapping it opens Float Mode. Resolves with the reminders
 * the phone accepted; without notification permission none are, so they stay
 * eligible and still fire if permission is given in time. The Float Mode
 * screen says when notifications are off.
 */
async function deliverReminders(due: DueReminder[]): Promise<string[]> {
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) return [];
  const delivered: string[] = [];
  for (const reminder of due) {
    const { title, body } = reminderCopy(reminder);
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, data: { floatReminder: reminder.id } },
        trigger: null,
      });
      delivered.push(reminder.id);
    } catch (error) {
      warn('float', 'could not show a float reminder', error);
    }
  }
  return delivered;
}

const store = createFloatSessionStore(AsyncStorage, (message, detail) => warn('float', message, detail), deliverReminders,
  (session, endedAt, contributionVersion) => floatArchive.addCompleted(recapFloat(session, endedAt), session.archiveScope, contributionVersion));
const activityLifecycle = createFloatActivityLifecycle(store, syncFloatActivity);

/** Read the stored float once per process. Then read it with getFloatSession(). */
export function ensureFloatSessionLoaded(): Promise<void> {
  return activityLifecycle.ensureLoaded();
}

/**
 * The stored float could not be read. getFloatSession() is null, but that is
 * not "no float": nothing may stop tracking or start a new float on it.
 * The next ensureFloatSessionLoaded() reads again.
 */
export function floatSessionLoadFailed(): boolean {
  return store.loadFailed();
}

/** The current session: always this, never a value remembered from a load. */
export function getFloatSession(): FloatSession | null {
  return store.get();
}

export function subscribeFloatSession(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** Start a float. Not active until it is safely on disk. */
export function beginFloat(next: FloatSession): Promise<BeginResult> {
  if (!floatArchive.snapshot().ready) return Promise.resolve('storage-failed');
  return activityLifecycle.begin({ ...next, archiveScope: floatArchive.scope() });
}

/**
 * Feed GPS fixes, in time order, from the recorder. `journalTo` is the
 * journal offset they end at (floatRecording.ts). Returns the automatic end
 * this delivery may trigger (floatEnding.ts), resolving true only if it did
 * end the float.
 */
export function recordFixes(fixes: readonly PositionFix[], now = Date.now(), journalTo?: number): Promise<boolean> | null {
  store.record(fixes, now, journalTo);
  const session = store.get();
  if (session && autoEndAt(session, now) != null) return autoEnd(session.id);
  void syncFloatActivity(session);
  return null;
}

/** End a float nobody ended, say so, and keep its recap at the real finish. */
async function autoEnd(sessionId: string): Promise<boolean> {
  // Let a pending arrival or away prompt land first, so the end notice follows it.
  await store.remindersSettled();
  // Decide again on the session as it is now: fixes that arrived while the
  // prompt was being handed over may have put the paddler back on the river.
  const session = store.get();
  const endedAt = session?.id === sessionId ? autoEndAt(session, Date.now()) : null;
  if (!session || endedAt == null) return false;
  stopRecording(session.id);
  await activityLifecycle.end(floatArchive.contributionVersion(session.archiveScope), endedAt);
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (permission?.granted) {
    await Notifications.scheduleNotificationAsync({
      content: { ...autoEndCopy(session), sound: true, data: { floatEnded: session.id } },
      trigger: null,
    }).catch((error) => warn('float', 'could not show the float-ended notice', error));
  }
  return true;
}

/** Write any pending change now; call when the app is leaving the foreground. */
export function flushFloatSession(): Promise<void> {
  return store.flush();
}

/** End the float and save its recap. Tracking stops because nothing is active. */
export function endFloat(): Promise<boolean> {
  stopRecording(store.get()?.id ?? null);
  return activityLifecycle.end(floatArchive.contributionVersion(store.get()?.archiveScope));
}

/**
 * End a float that never reached its river, without a recap: nothing was
 * measured, so history gets no empty entry. Refused (false) once a position
 * on the river has been confirmed; use endFloat then.
 */
export function cancelUnstartedFloat(): Promise<boolean> {
  const session = store.get();
  if (!session || session.samples.length > 0) return Promise.resolve(false);
  stopRecording(session.id);
  // Nothing was measured, so its journal holds nothing worth keeping.
  void floatRecorder?.deleteJournal(session.id).catch(() => {});
  return activityLifecycle.end(null, undefined, false);
}

/** Change the active float's reminders. */
export function setFloatReminders(update: (current: FloatReminderSettings) => Pick<FloatReminderSettings, 'takeOut' | 'stops' | 'hazards'>): void {
  store.setReminders(update);
}

/** Account deletion also clears positions, every raw journal, and any pending end journal. */
export async function discardFloat(): Promise<void> {
  stopRecording(null);
  await floatRecorder?.deleteAllJournals();
  await store.discard();
  void syncFloatActivity(null);
}
