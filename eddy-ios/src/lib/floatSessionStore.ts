// eddy-ios/src/lib/floatSessionStore.ts
// The one active float, held outside React.
//
// ── Why a module and not a context ──────────────────────────────────────────
// Locked-screen tracking (#1448 Phase 4) delivers fixes to a background task
// that runs with no screen mounted. That task and the Float Mode screen must
// feed and read the SAME session, so it lives here, in plain module state, and
// React subscribes to it (useFloatSession). Nothing about a float depends on a
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
// end a float in progress. Writes are throttled (a fix can arrive every
// second) and flushed when the app goes to the background, where iOS may end
// it without warning. Precise positions stay on the phone, like everything
// else location-related in Eddy.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { PositionFix } from '@eddy/geo';
import type { FloatSession } from './floatSession';
import { createFloatSessionStore, type BeginResult } from './floatSessionStoreCore';
import { reminderCopy, type DueReminder, type FloatReminderSettings } from './floatReminders';
import { warn } from './monitoring';
import { syncFloatActivity } from '../float/liveActivity';

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

const store = createFloatSessionStore(AsyncStorage, (message, detail) => warn('float', message, detail), deliverReminders);
let loaded: Promise<void> | null = null;

/** Read the stored float once per process. Then read it with getFloatSession(). */
export function ensureFloatSessionLoaded(): Promise<void> {
  loaded ??= store.ensureLoaded().then(() => syncFloatActivity(store.get(), { force: true }));
  return loaded;
}

/** The current session: always this, never a value remembered from a load. */
export function getFloatSession(): FloatSession | null {
  return store.get();
}

export function subscribeFloatSession(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** Start a float. Not active until it is safely on disk. */
export async function beginFloat(next: FloatSession): Promise<BeginResult> {
  await ensureFloatSessionLoaded();
  const result = await store.begin(next);
  if (result === 'started') void syncFloatActivity(store.get(), { start: true });
  return result;
}

/** Feed GPS fixes, in time order, from the screen or a background task. */
export function recordFixes(fixes: readonly PositionFix[], now = Date.now()): void {
  store.record(fixes, now);
  void syncFloatActivity(store.get());
}

/** Write any pending change now; call when the app is leaving the foreground. */
export function flushFloatSession(): Promise<void> {
  return store.flush();
}

/** Write pending changes if the last write is older than `minIntervalMs`. */
export function flushFloatSessionIfStale(minIntervalMs: number): Promise<void> {
  return store.flushIfStale(minIntervalMs);
}

/** End the float and forget it. Tracking stops because nothing is active. */
export async function endFloat(): Promise<boolean> {
  // end() clears memory synchronously, even if the disk write later fails.
  const ended = store.end();
  await syncFloatActivity(null, { force: true });
  return ended;
}

/** Change the active float's reminders. */
export function setFloatReminders(update: (current: FloatReminderSettings) => Pick<FloatReminderSettings, 'takeOut' | 'stops'>): void {
  store.setReminders(update);
}

/** Wait for reminder handovers in progress; the background task awaits this. */
export function floatRemindersSettled(): Promise<void> {
  return store.remindersSettled();
}
