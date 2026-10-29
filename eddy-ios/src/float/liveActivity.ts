// No session-store import: the store owns this adapter, including background
// delivery. This keeps activity lifetime independent of any mounted screen.
import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { observeNativeFloatActivity, supportsFloatActivity, syncNativeFloatActivity } from '../../modules/eddy-live-activity';
import { createFloatActivityController, floatActivitySnapshot, type ActivityAvailability } from '@/lib/floatActivity';
import { createFloatActivityVisibility } from '@/lib/floatActivityVisibility';
import type { FloatSession } from '@/lib/floatSession';
import { warn } from '@/lib/monitoring';

let availability: ActivityAvailability = supportsFloatActivity ? 'idle' : 'unavailable';
const listeners = new Set<() => void>();
const controller = createFloatActivityController({ sync: syncNativeFloatActivity }, (next) => {
  availability = next;
  listeners.forEach((listener) => listener());
});
observeNativeFloatActivity(controller.observeAvailability);
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const read = () => availability;
export function useFloatActivity(): ActivityAvailability {
  return useSyncExternalStore(subscribe, read, read);
}

// "Hide Lock Screen card" (Float tools). Read lazily, never at module scope.
// Until the stored choice is read, a hidden float's card is not recreated
// anyway: only a new float or an explicit Show may start one (floatActivity.ts).
const visibility = createFloatActivityVisibility(AsyncStorage, (message, detail) => warn('float', message, detail));
const readHidden = () => visibility.hiddenSession();

/** Every card update goes through here, so a hidden float's card stays ended. */
export function syncFloatActivity(session: FloatSession | null, options: { start?: boolean; force?: boolean } = {}): Promise<void> {
  void visibility.ensureLoaded();
  if (!session) void visibility.clear();
  if (session && visibility.isHidden(session.id)) return controller.sync(null, { force: options.force });
  // A float whose tracking was stopped at Finish has no live card to show.
  return controller.sync(session && session.trackingStoppedAt == null ? floatActivitySnapshot(session, Date.now()) : null, options);
}
export const floatActivitySettled = () => controller.settled();

/** Whether the paddler hid this float's card; tracking is unaffected either way. */
export function useFloatActivityHidden(sessionId: string | null | undefined): boolean {
  useEffect(() => { void visibility.ensureLoaded(); }, []);
  const hidden = useSyncExternalStore(visibility.subscribe, readHidden, readHidden);
  return sessionId != null && hidden === sessionId;
}

/** End the card but keep tracking; remembered for this float until Show. */
export async function hideFloatActivity(session: FloatSession): Promise<void> {
  await visibility.ensureLoaded();
  void visibility.setHidden(session.id, true);
  void syncFloatActivity(session, { force: true });
  await floatActivitySettled();
}

/** Bring the card back for this float (an explicit action, so it may start one). */
export async function showFloatActivity(session: FloatSession): Promise<void> {
  await visibility.ensureLoaded();
  void visibility.setHidden(session.id, false);
  void syncFloatActivity(session, { start: true });
  await floatActivitySettled();
}
