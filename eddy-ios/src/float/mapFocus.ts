import { useSyncExternalStore } from 'react';
import type { LngLat } from '@eddy/geo';
export interface FloatMapFocus { sessionId: string; point: LngLat; title: string; detail: string }
let focus: FloatMapFocus | null = null;
const listeners = new Set<() => void>();
export function focusFloatMap(next: FloatMapFocus) { focus = next; listeners.forEach(fn => fn()); }
export function useFloatMapFocus() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => focus, () => null);
}
