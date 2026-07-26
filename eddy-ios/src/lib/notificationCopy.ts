// eddy-ios/src/lib/notificationCopy.ts
// The sentence under "Alerts are on/off" in Profile.
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
  signedIn,
}: {
  permission: NotificationPermission;
  registered: boolean;
  signedIn: boolean;
}): string {
  if (permission === 'unsupported') {
    // A simulator has no APNs connection, so no token can ever be issued. Not
    // a decision anyone made, and not something to fix.
    return 'Push alerts need a real device — the simulator cannot receive them.';
  }
  if (permission === 'denied') {
    return 'Notifications are turned off for Eddy in iOS Settings. Alerts still appear in the Alerts tab.';
  }
  if (!signedIn) {
    return 'Sign in to get alerts on this device. The Alerts tab works without an account.';
  }
  if (permission === 'undetermined') {
    return 'Get a push the moment a river you follow becomes floatable, or turns dangerous.';
  }
  if (!registered) {
    return 'Allowed, but this device has not registered yet. It will retry on the next launch.';
  }
  return 'This device will get a push when a river you follow changes condition.';
}
