import type { DeviceClaimState } from './deviceClaim';
import { notificationDetail, type NotificationPermission } from './notificationCopy';

export interface NotificationSnapshot {
  permission: NotificationPermission;
  optedOut: boolean;
  registered: boolean;
  held: DeviceClaimState | null;
}

export interface AlertNotificationNotice {
  message: string;
  action: 'ask' | 'enable' | 'settings' | 'retry' | null;
}

/** An enabled rule and a phone that can receive it are separate facts. */
export function alertNotificationNotice(
  status: NotificationSnapshot,
  pushAvailable: boolean,
): AlertNotificationNotice | null {
  if (!pushAvailable) return { message: 'Notifications are temporarily unavailable. Your alerts remain saved.', action: null };
  if (status.permission === 'unsupported') return { message: 'Push notifications need a supported physical device.', action: null };
  if (status.permission === 'denied') return { message: 'Notifications are off in iOS Settings. This iPhone won’t receive your alerts.', action: 'settings' };
  if (status.permission === 'undetermined') return { message: 'Allow notifications so this iPhone can receive your alerts.', action: 'ask' };
  if (status.optedOut) return { message: 'Notifications are paused on this iPhone. Your alerts remain saved.', action: 'enable' };
  if (!status.registered) return {
    message: status.held
      ? notificationDetail(status)
      : 'This iPhone isn’t connected for notifications. Your alerts remain saved.',
    action: 'retry',
  };
  return null;
}
