import * as Notifications from 'expo-notifications';
import { canRequestNotification, notificationAccess, type NotificationAccess } from './notificationAccess';

function interpret(permission: Notifications.NotificationPermissionsStatus): NotificationAccess {
  return notificationAccess({
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
    provisional: permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    allowsAlert: permission.ios?.allowsAlert ?? undefined,
    allowsSound: permission.ios?.allowsSound ?? undefined,
  });
}
export async function readNotificationAccess(): Promise<NotificationAccess> {
  try { return interpret(await Notifications.getPermissionsAsync()); }
  catch { return 'unknown'; }
}
/** Only after an explicit Enable action explaining why notifications are needed. */
export async function requestNotificationAccess(): Promise<NotificationAccess> {
  // Re-read: Settings or another screen may have changed permission in the meantime.
  const access = await readNotificationAccess();
  // Provisional (quiet) access upgrades through the same prompt; a failed
  // read is asked again rather than left as a dead Enable button.
  if (!canRequestNotification(access)) return access;
  try {
    return interpret(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } }));
  } catch { return 'unknown'; }
}
