// eddy-ios/src/float/keepAwakePreference.ts
// "Keep screen awake" during a float, remembered between floats. Off unless
// chosen. Module state, because the switch lives in Float options while the
// wake lock belongs to the River Mode screen underneath it: both must see the
// same value without either remounting.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'eddy.float.keepAwake';
let value = false;
let loaded = false;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of [...listeners]) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const get = () => value;

function set(next: boolean) {
  loaded = true;
  if (next === value) return;
  value = next;
  notify();
  void AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
}

export function useKeepAwakePreference(): [boolean, (next: boolean) => void] {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        value = stored === '1';
        notify();
      })
      .catch(() => {});
  }, []);
  return [useSyncExternalStore(subscribe, get, get), set];
}
