import { useEffect, useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useRouter, useRootNavigationState, type Href } from 'expo-router';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { useSession } from '@/hooks/useSession';
import { shortcutCatalog, resolveShortcutRequest } from '@/lib/appShortcuts';
import { createStorageQueue } from '@/lib/storageQueue';
import { ensureFloatSessionLoaded, floatSessionLoadFailed, getFloatSession } from '@/lib/floatSessionStore';
import { onForeground } from '@/lib/foreground';

interface ShortcutBridge {
  setShortcutCatalog?: (json: string) => Promise<void>;
  takeShortcutRequest?: () => Promise<string | null>;
  addListener: (name: 'onShortcut', callback: () => void) => { remove: () => void };
}
let bridge: ShortcutBridge | null = null;
try {
  if (Platform.OS === 'ios') bridge = requireOptionalNativeModule<ShortcutBridge>('EddyLiveActivity');
} catch { /* Older binaries skip these optional native actions. */ }
const writes = createStorageQueue();
const reads = createStorageQueue();

export function AppShortcutsSync() {
  const { starred, ready: starsReady } = useStarredRivers();
  const { floats, ready: routesReady } = useSavedFloats();
  const { ready: sessionReady } = useSession();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const pending = useRef<string | null>(null);
  const latest = useRef({ starred, floats, ready: false, navigationReady: false });
  const navigationReady = !!navigation?.key;
  const ready = sessionReady && starsReady && routesReady;
  useLayoutEffect(() => { latest.current = { starred, floats, ready, navigationReady }; }, [starred, floats, ready, navigationReady]);
  useEffect(() => {
    if (!bridge?.setShortcutCatalog || !sessionReady || !starsReady) return;
    // During an account switch routesReady is false; scrub the old choices now.
    const json = JSON.stringify(shortcutCatalog(starred, routesReady ? floats : []));
    void writes.run(() => bridge!.setShortcutCatalog!(json)).catch(() => {});
  }, [sessionReady, starsReady, routesReady, starred, floats]);
  useEffect(() => {
    if (!bridge?.takeShortcutRequest || !navigationReady) return;
    const consume = () => {
      void reads.run(async () => {
        if (!latest.current.navigationReady) return;
        const raw = await bridge!.takeShortcutRequest!() ?? pending.current;
        if (!raw) return;
        pending.current = raw;
        const destination = await resolveShortcutRequest(raw, {
          restoreRecorder: ensureFloatSessionLoaded,
          read: () => ({
            stars: latest.current.starred, routes: latest.current.floats,
            context: { collectionsReady: latest.current.ready,
              recorder: floatSessionLoadFailed() ? 'unreadable' : getFloatSession() ? 'active' : 'none' },
          }),
        });
        // Return/active-float handoffs need only local recorder restoration;
        // route/river choices wait for the currently visible collections.
        if (destination === undefined || !latest.current.navigationReady) return;
        pending.current = null;
        if (destination) router.navigate(destination as Href);
      }).catch(() => {});
    };
    const listener = bridge.addListener('onShortcut', consume);
    const off = onForeground(consume);
    consume(); // The native request survives a cold launch before React mounts.
    return () => { listener.remove(); off(); };
  }, [ready, navigationReady, router]);
  return null;
}
