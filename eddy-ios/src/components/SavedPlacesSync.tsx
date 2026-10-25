import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { autoRefreshSavedPlaces } from '@/lib/savedPlacesStore';
import { onForeground } from '@/lib/foreground';

/** Reconnect/foreground only. Existing Expo Network; no native dependency added. */
export function SavedPlacesSync() {
  const { ready, owner } = useSavedPlaces();
  useEffect(() => {
    if (!ready) return;
    let active = true;
    let online = false;
    let subscription: { remove(): void } | undefined;
    let check = () => {};
    const canRun = () => active && online && AppState.currentState === 'active';
    const run = () => { if (canRun()) void autoRefreshSavedPlaces(canRun); };
    // Guarded lazy import: an older binary without the optional network module
    // still opens local places and supports user-initiated Refresh.
    void import('expo-network').then(network => {
      if (!active) return;
      const update = (state: { isConnected?: boolean; isInternetReachable?: boolean }) => {
        online = state.isConnected === true && state.isInternetReachable !== false;
        run();
      };
      subscription = network.addNetworkStateListener(update);
      check = () => { void network.getNetworkStateAsync().then(update).catch(() => { online = false; }); };
      check();
    }).catch(() => {});
    const off = onForeground(() => check());
    return () => { active = false; subscription?.remove(); off(); };
  }, [ready, owner]);
  return null;
}
