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
import { readNotificationAccess, requestNotificationAccess } from './notificationPermissions';
import type { NotificationAccess } from './notificationAccess';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerDeviceToken, releaseDeviceToken, unregisterDeviceToken } from '@/api/client';
import { heldDeviceId, needsRegistration, readPushLedger, registered, released, unregistered, writePushLedger } from '@/lib/pushLedger';
import { warn } from '@/lib/monitoring';
import { createDeviceClaimInbox, deviceClaimCode, type DeviceClaimState } from '@/lib/deviceClaim';

/**
 * Show notifications while the app is FOREGROUNDED.
 *
 * The default is to suppress them, which is wrong here: a river changing to
 * dangerous matters just as much when someone happens to have Eddy open, and
 * they may be looking at a different river entirely.
 */
export function installForegroundHandler(): void {
  Notifications.setNotificationHandler({
    // A device-claim code (deviceClaim.ts) is for the app, not the reader:
    // with Eddy open it is redeemed silently, so it is not shown.
    handleNotification: async (notification) => {
      const claim = deviceClaimCode(notification.request.content.data) !== null;
      return {
        shouldShowBanner: !claim,
        shouldShowList: !claim,
        shouldPlaySound: !claim,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Device-claim codes received and not yet redeemed (deviceClaim.ts). Module
 * state, like the handler: a code can arrive before the 409 that asked for it.
 */
const claimInbox = createDeviceClaimInbox();

/** Keep a device-claim code a notification carried, for the registration that needs it. */
export function noteDeviceClaim(code: string): void {
  claimInbox.note(code, Date.now());
}

/** The newest unexpired device-claim code, once. */
export function takeDeviceClaim(): string | null {
  return claimInbox.take(Date.now());
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

// Remote push keeps its device/token policy; local reminders use OS capability directly.
// Provisional permission intentionally permits remote delivery without re-prompting.
// Shared requests ask for alert/sound only: Eddy does not use notification badges.
function pushPermissionState(access: NotificationAccess): PermissionState {
  if (access === 'granted' || access === 'quiet' || access === 'provisional') return 'granted';
  if (access === 'ask') return 'undetermined';
  return access === 'settings' ? 'denied' : 'unsupported';
}

/** What the OS currently thinks, without prompting. */
export async function getPermissionState(): Promise<PermissionState> {
  // The simulator has no APNs connection, so a token can never be issued there.
  // Reporting that as "denied" would be misleading; it is not a user decision.
  if (!Device.isDevice) return 'unsupported';

  return pushPermissionState(await readNotificationAccess());
}

/**
 * Spend the one-shot prompt.
 *
 * Only call this AFTER a primer. Returns the resulting state rather than a
 * boolean so the caller can distinguish "said no" from "cannot ask".
 */
export async function requestPermission(): Promise<PermissionState> {
  if (!Device.isDevice) return 'unsupported';

  return pushPermissionState(await requestNotificationAccess());
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
  /**
   * Another account's row holds this iPhone's token and no proof passed
   * (deviceClaim.ts): whether the server pushed a claim code. Null otherwise.
   */
  held: DeviceClaimState | null;
}

/**
 * Acquire a token and hand it to the backend.
 *
 * Does NOT prompt. If permission has not been granted this returns without
 * side effects, so it is safe to call on every launch — which is the intent:
 * tokens rotate, and a stale one silently stops receiving.
 */
export async function syncRegistration(
  token: string,
  userId: string,
  options: { force?: boolean; now?: number; claimCode?: string } = {},
): Promise<RegistrationResult> {
  const state = await getPermissionState();
  if (state !== 'granted') return { ok: false, token: null, state, held: null };

  const pushToken = await getExpoPushToken();
  if (!pushToken) return { ok: false, token: null, state, held: null };

  // Anything owed from a sign-out goes first, so the release and this
  // registration cannot cross on the server.
  await settleOwedRelease();

  // Nothing changed since the last registration the server confirmed: same
  // account, same token, within a day. Every foreground used to POST again,
  // against a fail-closed limit (pushLedger.ts).
  const now = options.now ?? Date.now();
  const ledger = await readPushLedger();
  if (!options.force && !needsRegistration(ledger, userId, pushToken, now)) {
    return { ok: true, token: pushToken, state, held: null };
  }

  // The row id this install already holds for the token is the proof the
  // server needs to move it from another account (pushLedger.ts heldDeviceId).
  const previousDeviceId = heldDeviceId(ledger, pushToken);
  const result = await registerDeviceToken(token, {
    expoPushToken: pushToken,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    deviceName: Device.modelName ?? undefined,
    appVersion: Constants.expoConfig?.version ?? undefined,
    ...(previousDeviceId ? { previousDeviceId } : {}),
    ...(options.claimCode ? { claimCode: options.claimCode } : {}),
  });
  if (result.ok) await writePushLedger(registered(userId, pushToken, result.deviceId, now));

  // Held, and the claim code this refusal asked for may already be here: the
  // server pushes it before it answers. Redeem it now rather than wait for a
  // notification that has already come and gone. Once only: a code that was
  // itself refused is not offered again.
  if (result.held && !options.claimCode) {
    const code = takeDeviceClaim();
    if (code) return syncRegistration(token, userId, { ...options, force: true, claimCode: code });
  }

  return { ok: result.ok, token: pushToken, state, held: result.held };
}

/**
 * Send a release owed from an earlier sign-out, if there is one and there is
 * signal now. Safe to call at any time; never throws.
 */
export async function settleOwedRelease(): Promise<void> {
  const ledger = await readPushLedger();
  if (!ledger.release) return;
  if (await releaseDeviceToken(ledger.release.expoPushToken, ledger.release.deviceId)) {
    await writePushLedger(released(await readPushLedger()));
  }
}

/**
 * Stop this device receiving for the account that holds `token`.
 *
 * Called on sign-out, before account deletion, and by the Notifications
 * switch. A DELETE that does not land is no longer forgotten: the leaving
 * account would keep being notified on this phone. It is recorded as a
 * release owed (pushLedger.ts) and sent on a later launch with signal.
 * Resolves whether the server took it now.
 */
export async function unregisterThisDevice(token: string | null): Promise<boolean> {
  const ledger = await readPushLedger();
  const pushToken = (await getExpoPushToken()) ?? ledger.registration?.expoPushToken ?? null;
  if (!pushToken) return true;
  // No token (a session that could not be refreshed offline) is a DELETE
  // that cannot be sent: owed, the same as one that failed.
  const delivered = token ? await unregisterDeviceToken(token, pushToken).then(() => true, () => false) : false;
  await writePushLedger(unregistered(ledger, delivered));
  return delivered;
}
