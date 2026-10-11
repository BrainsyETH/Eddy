// No session-store import: the store owns this adapter, including background
// delivery. This keeps activity lifetime independent of any mounted screen.
import { useSyncExternalStore } from 'react';
import { observeNativeFloatActivity, supportsFloatActivity, syncNativeFloatActivity } from '../../modules/eddy-live-activity';
import { createFloatActivityController, floatActivitySnapshot, type ActivityAvailability } from '@/lib/floatActivity';
import type { FloatSession } from '@/lib/floatSession';

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
export function syncFloatActivity(session: FloatSession | null, options: { start?: boolean; force?: boolean } = {}): Promise<void> {
  return controller.sync(session ? floatActivitySnapshot(session, Date.now()) : null, options);
}
export const floatActivitySettled = () => controller.settled();
