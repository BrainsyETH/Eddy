// eddy-ios/src/lib/floatSessionStore.ts
// The one active float, held outside React.
//
// ── Why a module and not a context ──────────────────────────────────────────
// Fixes arrive from the native recorder (src/float/recorder.ts, ADR 0014)
// whether or not any screen is mounted, including with the phone locked. The
// recorder wiring and the River Mode screen must feed and read the SAME
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

import { pickupContact } from './pickupContactStore';
import { floatArchive } from './floatArchive';
import { recapFloat } from './floatRecap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { readNotificationAccess } from './notificationPermissions';
import { FINISH_FLOAT_ACTION } from './notificationDestination';
import { canDeliverNotification } from './notificationAccess';
import type { PositionFix } from '@eddy/geo';
import type { FloatSession } from './floatSession';
import { createFloatSessionStore, type BeginResult } from './floatSessionStoreCore';
import { reminderCopy, type DueReminder, type FloatReminderSettings } from './floatReminders';
import { warn } from './monitoring';
import { syncFloatActivity } from '../float/liveActivity';
import { createFloatActivityLifecycle } from './floatActivity';
import { autoEndAt, autoEndCopy, isShortFloat } from './floatEnding';
import { floatRecorder } from '../../modules/eddy-float-recorder';
import { deleteAllFloatTracks, deleteFloatTrack } from '../float/floatTracks';

/** Recording stops with the float, whichever way it ended. */
function stopRecording(sessionId: string | null): void {
  void stopRecordingNow(sessionId);
}

/** The same, awaited: for paths that then delete the float's journal. */
async function stopRecordingNow(sessionId: string | null): Promise<void> {
  try {
    await floatRecorder?.stop(sessionId);
  } catch (error) {
    warn('float', 'could not stop recording', error);
  }
}

/** The arrival prompt's category: a Finish action right on the notification (usePush handles it). */
export const ARRIVED_CATEGORY = 'float-arrived';
let arrivedCategory: Promise<void> | null = null;
function ensureArrivedCategory(): Promise<void> {
  arrivedCategory ??= Notifications.setNotificationCategoryAsync(ARRIVED_CATEGORY, [
    { identifier: FINISH_FLOAT_ACTION, buttonTitle: 'Finish float', options: { opensAppToForeground: true } },
  ]).then(() => undefined, (error) => {
    warn('float', 'could not register the arrival notification category', error);
    arrivedCategory = null;
  });
  return arrivedCategory;
}

/**
 * A reminder is a local notification: scheduled on the phone, so it needs no
 * cell service, and shown even while locked (Phase 4 keeps fixes coming with
 * the screen off). Tapping it opens River Mode. Resolves with the reminders
 * the phone accepted; without notification permission none are, so they stay
 * eligible and still fire if permission is given in time. The River Mode
 * screen says when notifications are off.
 *
 * Heads-ups about the water ahead (a dam, a portage, the take-out) are
 * time-sensitive: a Focus mode must not silence "portage river left". The
 * entitlement is in app.json. The ending prompts are ordinary.
 */
async function deliverReminders(due: DueReminder[]): Promise<string[]> {
  if (!canDeliverNotification(await readNotificationAccess())) return [];
  const delivered: string[] = [];
  for (const reminder of due) {
    const { title, body } = reminderCopy(reminder);
    const ahead = reminder.kind === 'take-out' || reminder.kind === 'stop' || reminder.kind === 'hazard';
    if (reminder.kind === 'arrived') await ensureArrivedCategory();
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          data: { floatReminder: reminder.id },
          ...(ahead ? { interruptionLevel: 'timeSensitive' } : {}),
          ...(reminder.kind === 'arrived' ? { categoryIdentifier: ARRIVED_CATEGORY } : {}),
        },
        trigger: null,
      });
      delivered.push(reminder.id);
    } catch (error) {
      warn('float', 'could not show a float reminder', error);
    }
  }
  return delivered;
}

/**
 * Take this float's reminders off the Lock Screen and out of Notification
 * Center once it has ended: "Still floating?" after Finish is noise. The
 * ended notice itself, scheduled after this, stays.
 */
async function dismissFloatNotifications(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const notification of presented) {
      const data = notification.request.content.data as Record<string, unknown> | null | undefined;
      if (typeof data?.floatReminder === 'string' || typeof data?.floatEnded === 'string') {
        await Notifications.dismissNotificationAsync(notification.request.identifier);
      }
    }
  } catch (error) {
    warn('float', 'could not dismiss float notifications', error);
  }
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
  await dismissFloatNotifications();
  if (canDeliverNotification(await readNotificationAccess())) {
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

/**
 * Registered by the recorder wiring (src/float/recorder.ts): stops recording
 * and applies the journal through its end, resolving false if it could not.
 * A callback rather than an import, because that wiring imports this module.
 */
let finishRecording: (sessionId: string) => Promise<boolean> = async (sessionId) => {
  stopRecording(sessionId);
  return true;
};

export function setFinishRecording(finish: (sessionId: string) => Promise<boolean>): void {
  finishRecording = finish;
}

/**
 * How ending went:
 *   ended         the recap is saved and the float is over
 *   ended-unsaved the float is over, but storage lagged; removal is retried
 *   not-ended     the recorded track could not all be read, so the float was
 *                 NOT finalised from an incomplete checkpoint; it is still
 *                 active and recording, and Finish can be tried again
 */
export type EndResult = 'ended' | 'ended-unsaved' | 'not-ended';

/**
 * End the float and save its recap. Recording stops first and every recorded
 * fix is applied before the recap is taken, so a float ended while its
 * journal was still being replayed is not saved short, and a float whose
 * journal cannot be read is not saved at all.
 */
export async function endFloat(): Promise<EndResult> {
  const session = store.get();
  if (session && !(await finishRecording(session.id))) return 'not-ended';
  const cleared = await activityLifecycle.end(floatArchive.contributionVersion(store.get()?.archiveScope));
  void dismissFloatNotifications();
  return cleared ? 'ended' : 'ended-unsaved';
}

/**
 * End the active float without a recap and delete its journal. Recording is
 * stopped and awaited first: a fix still being written would otherwise
 * recreate the journal after the delete, leaving a file no recap can ever
 * remove.
 */
async function discardWithoutRecap(sessionId: string): Promise<boolean> {
  await stopRecordingNow(sessionId);
  // Nothing worth keeping was measured, so the journal goes with it.
  await deleteFloatTrack(sessionId).catch((error) => warn('float', 'could not queue the track deletion', error));
  const ended = await activityLifecycle.end(null, undefined, false);
  void dismissFloatNotifications();
  return ended;
}

/**
 * Discard an accidental float (floatEnding.ts isShortFloat): no recap, no
 * history entry, journal deleted. Refused (false) once the float has
 * measured enough to be worth keeping; use endFloat then.
 */
export function discardShortFloat(now = Date.now()): Promise<boolean> {
  const session = store.get();
  if (!session || !isShortFloat(session, now)) return Promise.resolve(false);
  return discardWithoutRecap(session.id);
}

/** Change the active float's reminders. */
export function setFloatReminders(update: (current: FloatReminderSettings) => Pick<FloatReminderSettings, 'takeOut' | 'stops' | 'hazards'>): void {
  store.setReminders(update);
}

/** Account deletion also clears positions, every raw journal, and any pending end journal. */
export async function discardFloat(): Promise<void> {
  await stopRecordingNow(null);
  await deleteAllFloatTracks();
  await store.discard();
  await pickupContact.clear();
  void syncFloatActivity(null);
  void dismissFloatNotifications();
}
