// eddy-ios/src/hooks/usePush.tsx
// Push registration and notification-tap routing, app-wide.
//
// A provider rather than a hook because two of its jobs are global and must
// happen exactly once: the foreground presentation handler, and the listener
// that routes a tapped notification. Mounting those per-screen would register
// duplicates and navigate more than once for a single tap.
//
// Everything here is non-fatal. Alerts are a feature; nothing in this file may
// stop the app from running for someone who declined them, is on a simulator,
// or has never signed in.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import {
  getPermissionState,
  installForegroundHandler,
  requestPermission,
  syncRegistration,
  unregisterThisDevice,
  type PermissionState,
} from '@/lib/push';

interface PushValue {
  permission: PermissionState;
  /** True once this device's token is known to the backend. */
  registered: boolean;
  /**
   * Spend the one-shot iOS prompt and register. Call ONLY after a primer —
   * see PushPrimer and the note in src/lib/push.ts.
   */
  enable: () => Promise<PermissionState>;
  /** Stop this device receiving. Used by sign-out and account deletion. */
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PushContext = createContext<PushValue>({
  permission: 'undetermined',
  registered: false,
  enable: async () => 'undetermined',
  disable: async () => {},
  refresh: async () => {},
});

// The handler is process-wide, so it is installed at module scope rather than
// in an effect — an effect would run after the first notification could
// already have arrived on a cold start.
installForegroundHandler();

export function PushProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { getAccessToken, isAnonymous, session } = useSession();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [registered, setRegistered] = useState(false);

  const userId = session?.user?.id ?? null;
  const signedIn = Boolean(userId) && !isAnonymous;

  // A tap can reach us twice — once from the cold-start response and once from
  // the listener — and navigating twice puts two copies of the river on the
  // stack. Identifiers are remembered rather than a single "handled" flag
  // because the app may legitimately receive several taps in a session.
  const handled = useRef(new Set<string>());

  const openFromNotification = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;

      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);

      const data = response.notification.request.content.data as { riverSlug?: unknown };
      const slug = typeof data?.riverSlug === 'string' ? data.riverSlug : null;

      // No slug means a notification we cannot route — a digest, or an older
      // payload. Opening the app is still the right outcome; doing nothing
      // here achieves that, since the tap already foregrounded us.
      if (slug) router.push(`/river/${slug}`);
    },
    [router],
  );

  useEffect(() => {
    // Cold start: the tap that launched the app is not delivered to the
    // listener below, only to this.
    Notifications.getLastNotificationResponseAsync()
      .then(openFromNotification)
      .catch(() => {});

    const subscription = Notifications.addNotificationResponseReceivedListener(
      openFromNotification,
    );
    return () => subscription.remove();
  }, [openFromNotification]);

  const refresh = useCallback(async () => {
    const state = await getPermissionState();
    setPermission(state);

    if (state !== 'granted' || !signedIn) {
      setRegistered(false);
      return;
    }

    const token = await getAccessToken();
    if (!token) return;

    const result = await syncRegistration(token);
    setRegistered(result.ok);
  }, [signedIn, getAccessToken]);

  // Re-sync on every launch and whenever the signed-in user changes. Expo push
  // tokens rotate, and a stale one fails silently — the user simply stops
  // receiving alerts with nothing to see anywhere.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    const state = await requestPermission();
    setPermission(state);

    if (state === 'granted' && signedIn) {
      const token = await getAccessToken();
      if (token) {
        const result = await syncRegistration(token);
        setRegistered(result.ok);
      }
    }
    return state;
  }, [signedIn, getAccessToken]);

  const disable = useCallback(async () => {
    const token = await getAccessToken();
    if (token) await unregisterThisDevice(token);
    setRegistered(false);
  }, [getAccessToken]);

  const value = useMemo<PushValue>(
    () => ({ permission, registered, enable, disable, refresh }),
    [permission, registered, enable, disable, refresh],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushValue {
  return useContext(PushContext);
}
