// eddy-ios/src/lib/push.ts
// Permission, token acquisition, and registration with the backend.
//
// ── The one-shot problem ─────────────────────────────────────────────────
//
// iOS shows the notification permission dialog ONCE per install. Deny it and
// the app can never ask again — it can only send someone to Settings, which
// almost nobody does. That single dialog is therefore the most expensive
// prompt in the app, and it is why nothing here calls
// requestPermissionsAsync() on its own: the caller shows a primer first (see
// PushPrimer), explains what the notification is for, and only then spends the
// prompt on someone who has already said yes to the idea.
//
// ── Why registration needs an account ────────────────────────────────────
//
// POST /api/me/device-tokens requires a permanent user, and the RLS policy in
// migration 00183 enforces it independently. Push identity is purchase
// identity: an anonymous id gets replaced on reinstall, and the token would
// then belong to a user nobody can bill or entitle.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerDeviceToken, unregisterDeviceToken } from '@/api/client';
import { warn } from '@/lib/monitoring';

/**
 * Show notifications while the app is FOREGROUNDED.
 *
 * The default is to suppress them, which is wrong here: a river changing to
 * dangerous matters just as much when someone happens to have Eddy open, and
 * they may be looking at a different river entirely.
 */
export function installForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** What the OS currently thinks, without prompting. */
export async function getPermissionState(): Promise<PermissionState> {
  // The simulator has no APNs connection, so a token can never be issued there.
  // Reporting that as "denied" would be misleading; it is not a user decision.
  if (!Device.isDevice) return 'unsupported';

  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    // Undetermined only if iOS will still show the dialog. Once it will not,
    // "denied" is the honest state even if the raw status says otherwise,
    // because the only remaining path is Settings.
    return canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Spend the one-shot prompt.
 *
 * Only call this AFTER a primer. Returns the resulting state rather than a
 * boolean so the caller can distinguish "said no" from "cannot ask".
 */
export async function requestPermission(): Promise<PermissionState> {
  if (!Device.isDevice) return 'unsupported';

  try {
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') return 'granted';
    return canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * This device's Expo push token, or null.
 *
 * `projectId` is REQUIRED and is the classic way this fails. Without it the
 * call throws at runtime with a message about being unable to determine the
 * project — and only in a real build, because it is never reached in Expo Go
 * on a simulator. It comes from the same `extra.eas.projectId` that `eas init`
 * wrote into app.json.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    // Older/dev-client shapes expose it here instead.
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (!projectId) {
    warn('push', 'no EAS projectId — cannot request a push token');
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data ?? null;
  } catch (err) {
    // A device with no network, or APNs entitlement missing from the build.
    // Non-fatal: alerts are a feature, not a precondition for running.
    warn('push', 'could not obtain a token', err);
    return null;
  }
}

export interface RegistrationResult {
  ok: boolean;
  token: string | null;
  state: PermissionState;
}

/**
 * Acquire a token and hand it to the backend.
 *
 * Does NOT prompt. If permission has not been granted this returns without
 * side effects, so it is safe to call on every launch — which is the intent:
 * tokens rotate, and a stale one silently stops receiving.
 */
export async function syncRegistration(token: string): Promise<RegistrationResult> {
  const state = await getPermissionState();
  if (state !== 'granted') return { ok: false, token: null, state };

  const pushToken = await getExpoPushToken();
  if (!pushToken) return { ok: false, token: null, state };

  const ok = await registerDeviceToken(token, {
    expoPushToken: pushToken,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    deviceName: Device.modelName ?? undefined,
    appVersion: Constants.expoConfig?.version ?? undefined,
  });

  return { ok, token: pushToken, state };
}

/**
 * Stop this device receiving.
 *
 * Called on sign-out and before account deletion. Failure is swallowed: the
 * backend prunes tokens that fail with DeviceNotRegistered anyway, so a missed
 * unregister costs a few wasted sends rather than a wrong notification.
 */
export async function unregisterThisDevice(token: string): Promise<void> {
  const pushToken = await getExpoPushToken();
  if (!pushToken) return;
  await unregisterDeviceToken(token, pushToken).catch(() => {});
}
