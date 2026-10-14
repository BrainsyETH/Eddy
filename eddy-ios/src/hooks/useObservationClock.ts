import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onForeground } from '@/lib/foreground';

const listeners = new Set<(now: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let offForeground: (() => void) | null = null;

function tick() {
  if (AppState.currentState !== 'active') return;
  const now = Date.now();
  for (const listener of listeners) listener(now);
}

/** One minute clock for visible observation surfaces; no timers on hidden tabs. */
export function useObservationClock(): number {
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    listeners.add(setNow);
    if (!timer) {
      timer = setInterval(tick, 60_000);
      offForeground = onForeground(tick);
    }
    return () => {
      listeners.delete(setNow);
      if (listeners.size === 0) {
        if (timer) clearInterval(timer);
        timer = null;
        offForeground?.();
        offForeground = null;
      }
    };
  }, []));
  return now;
}
