import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onForeground } from '@/lib/foreground';
import { damRefreshSlot } from '@/lib/damReadFreshness';

/** Focus, resume, and five-minute boundaries; no requests on hidden/background screens. */
export function useDamRefresh(load: (signal: AbortSignal) => void) {
  useFocusEffect(useCallback(() => {
    let controller: AbortController | null = null;
    let slot = -1;
    const refresh = (force = false) => {
      if (AppState.currentState !== 'active') return;
      const next = damRefreshSlot(Date.now());
      if (!force && slot === next) return;
      slot = next;
      controller?.abort();
      controller = new AbortController();
      load(controller.signal);
    };
    refresh(true);
    const off = onForeground(() => refresh(true));
    const timer = setInterval(() => refresh(), 15_000);
    return () => { controller?.abort(); off(); clearInterval(timer); };
  }, [load]));
}
