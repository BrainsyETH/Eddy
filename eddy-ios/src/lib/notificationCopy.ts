// eddy-ios/src/lib/notificationCopy.ts
// The sentence under Notifications in Eddy Settings.
//
// Pure and separate from the screen so it can be tested — the same arrangement
// as alertCopy.ts and readingCopy.ts. What it encodes is a precedence order,
// and precedence is exactly the kind of thing that looks right in review and
// is wrong in the one state nobody tried.

export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

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
}: {
  permission: NotificationPermission;
  registered: boolean;
  optedOut?: boolean;
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
  if (!registered) {
    return 'Connecting now. Eddy will retry on the next launch.';
  }
  return 'This device will get a push when a followed river changes condition.';
}
