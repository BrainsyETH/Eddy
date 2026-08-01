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
import { AppState } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { useAppConfig } from '@/hooks/useAppConfig';
import { warn } from '@/lib/monitoring';
import { isDeviceOptedOut, setDeviceOptedOut } from '@/lib/pushOptOut';
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
  optedOut: boolean;
  /** True once this device's token is known to the backend. */
  registered: boolean;
  /**
   * Spend the one-shot iOS prompt and register. Call ONLY after a primer —
   * see PushPrimer and the note in src/lib/push.ts.
   */
  enable: () => Promise<PermissionState>;
  /** Stop this device receiving. Used by sign-out and account deletion. */
  /** Returns false when the device was unregistered but the preference was not persisted. */
  disable: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const PushContext = createContext<PushValue>({
  permission: 'undetermined',
  optedOut: false,
  registered: false,
  enable: async () => 'undetermined',
  disable: async () => false,
  refresh: async () => {},
});

// The handler is process-wide, so it is installed at module scope rather than
// in an effect — an effect would run after the first notification could
// already have arrived on a cold start.
//
// ── Why the try/catch, which looks like belt-and-braces and is not ─────────
//
// This is a NATIVE call (Notifications.setNotificationHandler) running at
// module scope in a file that app/_layout.tsx imports. A throw here does not
// cost the app its notification handler — it costs the app its launch. Module
// bodies run after their imports, so _layout.tsx's own body never executes, and
// with it goes the root ErrorBoundary and every provider. The app stops at the
// splash screen.
//
// src/lib/bootstrap.ts now arms the backstop before this file is reached, so
// that is a reported eight-second stall rather than a permanent one. This makes
// it not happen at all: alerts are a feature, and the file header already says
// nothing here may stop the app running for someone who declined them.
try {
  installForegroundHandler();
} catch (err) {
  warn('push', 'foreground notification handler could not be installed', err);
}

export function PushProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { getAccessToken, isAnonymous, session } = useSession();
  // Defaults to true and fails open — see useAppConfig. An unreachable config
  // must not be able to turn alerts off.
  const { features } = useAppConfig();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [registered, setRegistered] = useState(false);
  const [optedOut, setOptedOut] = useState(false);

  const userId = session?.user?.id ?? null;
  const signedIn = Boolean(userId) && !isAnonymous;

  // A tap can reach us twice — once from the cold-start response and once from
  // the listener — and navigating twice puts two copies of the river on the
  // stack. Identifiers are remembered rather than a single "handled" flag
  // because the app may legitimately receive several taps in a session.
  const handled = useRef(new Set<string>());
  const hasBackgrounded = useRef(false);

  /**
   * THE COLD-START TAP RACE, and why a tapped notification stranded the app.
   *
   * `<Stack>` is not mounted for the first frames of every launch — it sits
   * below OnboardingGate, which renders a bare View until hasAcceptedTerms()
   * comes back from storage. Navigating in that window throws "Attempted to
   * navigate before mounting the Root Layout component".
   *
   * Launching FROM a tap loses that race essentially every time:
   * getLastNotificationResponseAsync() resolves with a response the OS already
   * handed us, while the gate is still waiting on disk. And the throw landed in
   * the .catch() below, so it was swallowed — no navigation, no Sentry event,
   * and a blank gate fallback that is the same colour as the splash in both
   * themes (#F7F6F3 / #1A1814). Indistinguishable from a hung launch.
   *
   * useRootNavigationState() is undefined until the root navigator mounts, so
   * it is the readiness signal. A response that arrives early is parked and
   * replayed by the effect below rather than dropped.
   */
  const navigationState = useRootNavigationState();
  const navigatorReady = Boolean(navigationState?.key);
  // Mirrored into a ref so openFromNotification can read readiness without
  // taking it as a dependency — the notification listener is registered once
  // and must not be torn down and re-added the moment the navigator mounts.
  const navigatorReadyRef = useRef(navigatorReady);
  useEffect(() => {
    navigatorReadyRef.current = navigatorReady;
  }, [navigatorReady]);
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);

  const routeTo = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as {
        riverSlug?: unknown;
        gaugeSiteId?: unknown;
      };
      const slug = typeof data?.riverSlug === 'string' ? data.riverSlug : null;
      const siteId = typeof data?.gaugeSiteId === 'string' ? data.gaugeSiteId : null;

      // The server sets exactly ONE of these, chosen from the rule's scope, so
      // there is no precedence to get wrong here. An alert set on a gauge opens
      // the gauge — routing it to the river the station happens to rate would
      // land on a screen that never mentions the station the user picked.
      //
      // Neither means a notification we cannot route — a digest, or an older
      // payload. Opening the app is still the right outcome; doing nothing here
      // achieves that, since the tap already foregrounded us.
      if (siteId) router.push(`/gauge/${siteId}`);
      else if (slug) router.push(`/river/${slug}`);
    },
    [router],
  );

  const openFromNotification = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;

      // Deduped BEFORE the readiness check, so the cold-start response cannot
      // be parked here and delivered again by the listener — that would put two
      // copies of the same river on the stack once the navigator mounts.
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);

      if (!navigatorReadyRef.current) {
        pendingResponse.current = response;
        return;
      }
      routeTo(response);
    },
    [routeTo],
  );

  // Replay whatever arrived before the navigator existed. Runs on the render
  // that flips navigatorReady, which is the first moment router.push can work.
  useEffect(() => {
    if (!navigatorReady) return;
    const queued = pendingResponse.current;
    if (!queued) return;
    pendingResponse.current = null;
    routeTo(queued);
  }, [navigatorReady, routeTo]);

  useEffect(() => {
    // Cold start: the tap that launched the app is not delivered to the
    // listener below, only to this.
    Notifications.getLastNotificationResponseAsync()
      .then(openFromNotification)
      // Reported, not swallowed. This catch hid the navigate-before-mount throw
      // that made a tapped notification look like a hung launch, and a silent
      // failure on the one path nobody can reproduce on demand is the worst
      // place in the app to save a log line.
      .catch((err) => warn('push', 'could not open the tapped notification', err));

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

    const deviceOptedOut = await isDeviceOptedOut();
    setOptedOut(deviceOptedOut);
    if (deviceOptedOut) {
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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        hasBackgrounded.current = true;
        return;
      }
      if (hasBackgrounded.current) {
        hasBackgrounded.current = false;
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const enable = useCallback(async () => {
    // The one place `features.push` can prevent real harm. Everything else the
    // kill switch touches is recoverable — a send skipped now goes out when the
    // switch flips back — but the iOS permission dialog shows ONCE per install,
    // and spending it while the backend is not sending buys a "no" we can never
    // undo. So the flag gates the prompt and nothing else; a subscription made
    // while push is off is still worth having.
    //
    // The server-side lever is authoritative and lives in
    // src/lib/push/kill-switch.ts; this is the client half of the same switch,
    // which until now was served to the app and read by nobody.
    if (!features.push) return getPermissionState();

    const state = await requestPermission();
    setPermission(state);

    if (state === 'granted' && signedIn) {
      try {
        await setDeviceOptedOut(false);
      } catch (error) {
        warn('push', 'Could not persist enabling push on this device', error);
        return state;
      }
      setOptedOut(false);
      const token = await getAccessToken();
      if (token) {
        const result = await syncRegistration(token);
        setRegistered(result.ok);
      }
    }
    return state;
  }, [signedIn, getAccessToken, features.push]);

  const disable = useCallback(async () => {
    let persisted = true;
    try {
      await setDeviceOptedOut(true);
    } catch (error) {
      persisted = false;
      warn('push', 'Could not persist this device push opt-out', error);
    }
    const token = await getAccessToken();
    if (token) await unregisterThisDevice(token);
    if (persisted) setOptedOut(true);
    setRegistered(false);
    return persisted;
  }, [getAccessToken]);

  const value = useMemo<PushValue>(
    () => ({ permission, optedOut, registered, enable, disable, refresh }),
    [permission, optedOut, registered, enable, disable, refresh],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushValue {
  return useContext(PushContext);
}
