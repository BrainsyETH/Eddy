/**
 * OS capability only: independent of remote push, accounts, and APNs tokens.
 *
 *   granted      alerts and sound
 *   provisional  iOS delivered quietly without asking; the full prompt can
 *                still be shown in the app, so Enable is the answer
 *   quiet        allowed, but alerts or sound were turned off in Settings;
 *                only Settings can change that
 *   ask          never asked
 *   settings     denied
 *   unknown      the read failed; a request re-reads and asks if it can
 */
export type NotificationAccess = 'unknown' | 'granted' | 'provisional' | 'quiet' | 'ask' | 'settings';
export interface NotificationPermissionSnapshot {
  granted: boolean;
  canAskAgain: boolean;
  provisional?: boolean;
  allowsAlert?: boolean;
  allowsSound?: boolean;
}
export function notificationAccess(permission: NotificationPermissionSnapshot | null): NotificationAccess {
  if (!permission) return 'unknown';
  if (permission.provisional) return 'provisional';
  if (permission.granted) {
    return permission.allowsAlert === false || permission.allowsSound === false ? 'quiet' : 'granted';
  }
  return permission.canAskAgain ? 'ask' : 'settings';
}
export function canDeliverNotification(access: NotificationAccess): boolean {
  return access === 'granted' || access === 'quiet' || access === 'provisional';
}
/** States the in-app prompt can improve; the rest need Settings or nothing. */
export function canRequestNotification(access: NotificationAccess): boolean {
  return access === 'ask' || access === 'provisional' || access === 'unknown';
}
