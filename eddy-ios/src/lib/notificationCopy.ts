// eddy-ios/src/lib/notificationCopy.ts
// The sentence under Notifications in Eddy Settings.
//
// Pure and separate from the screen so it can be tested — the same arrangement
// as alertCopy.ts and readingCopy.ts. What it encodes is a precedence order,
// and precedence is exactly the kind of thing that looks right in review and
// is wrong in the one state nobody tried.

import type { DeviceClaimState } from './deviceClaim';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type NotificationControlKind = 'switch' | 'settings-link' | 'status';

/** Which control the Settings row can honestly offer in the current state. */
export function notificationControlKind(
  pushAvailable: boolean,
  permission: NotificationPermission,
): NotificationControlKind {
  if (!pushAvailable || permission === 'unsupported') return 'status';
  if (permission === 'denied') return 'settings-link';
  return 'switch';
}

/**
 * One sentence describing why alerts will or will not arrive.
 *
 * The order matters: each case rules out the ones below it, and the FIRST
 * blocker is the only one worth telling someone about. Listing every reason at
 * once is how a settings screen becomes unreadable.
 */
export function notificationDetail({
  permission,
  registered,
  optedOut = false,
  held = null,
}: {
  permission: NotificationPermission;
  registered: boolean;
  optedOut?: boolean;
  /** Another account holds this iPhone's token (deviceClaim.ts). */
  held?: DeviceClaimState | null;
}): string {
  if (permission === 'unsupported') {
    // A simulator has no APNs connection, so no token can ever be issued. Not
    // a decision anyone made, and not something to fix.
    return 'Push alerts need a real device.';
  }
  if (permission === 'denied') {
    return 'Off in iOS Settings. Alerts still appear in the Alerts tab.';
  }
  if (optedOut) {
    return 'Alerts are stopped on this device.';
  }
  if (permission === 'undetermined') {
    return 'Get a push when a followed river becomes floatable or dangerous.';
  }
  if (!registered && held) {
    // Not a connection problem, so not "will retry": a reinstall left this
    // iPhone's alerts on the account it used before, and only a confirmation
    // pushed to this iPhone can move them. Say what is happening and the one
    // thing that finishes or retries it.
    const lead = 'This iPhone’s alerts are still linked to the Eddy account it used before.';
    if (held === 'limited') return `${lead} Tap the confirmation Eddy already sent, or pull down in Eddy Settings to send another in an hour.`;
    if (held === 'unavailable') return `${lead} Eddy couldn’t send a confirmation just now. Pull down in Eddy Settings to try again.`;
    return `${lead} Eddy sent this iPhone a confirmation and finishes as soon as it arrives. If nothing changes, pull down in Eddy Settings to try again.`;
  }
  if (!registered) {
    return 'Connecting now. Eddy will retry on the next launch.';
  }
  return 'This device will get a push when a followed river changes condition.';
}
