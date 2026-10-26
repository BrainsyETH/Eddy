'use client';

import { useSyncExternalStore } from 'react';
import { appDevice } from '@/lib/app-device';

const subscribe = () => () => {};
const serverSnapshot = () => 'other' as const;
const browserSnapshot = () => appDevice(navigator);

/** The server stays device-neutral; hydration adapts the optional promotion. */
export function useAppDevice() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}
