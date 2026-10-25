/** OS capability only: independent of remote push, accounts, and APNs tokens. */
export type NotificationAccess = 'unknown' | 'granted' | 'quiet' | 'ask' | 'settings';
export interface NotificationPermissionSnapshot {
  granted: boolean;
  canAskAgain: boolean;
  provisional?: boolean;
  allowsAlert?: boolean;
  allowsSound?: boolean;
}
export function notificationAccess(permission: NotificationPermissionSnapshot | null): NotificationAccess {
  if (!permission) return 'unknown';
  if (permission.provisional) return 'quiet';
  if (permission.granted) {
    return permission.allowsAlert === false || permission.allowsSound === false ? 'quiet' : 'granted';
  }
  return permission.canAskAgain ? 'ask' : 'settings';
}
export function canDeliverNotification(access: NotificationAccess): boolean {
  return access === 'granted' || access === 'quiet';
}
