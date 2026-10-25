import { useSyncExternalStore } from 'react';
import { createFloatMapFocusStore } from '@/lib/floatMapFocus';
export type { FloatMapFocus } from '@/lib/floatMapFocus';

const focus = createFloatMapFocusStore();
export const focusFloatMap = focus.request;
export const consumeFloatMapFocus = focus.consume;
export function useFloatMapFocus() {
  return useSyncExternalStore(focus.subscribe, focus.snapshot, () => null);
}
