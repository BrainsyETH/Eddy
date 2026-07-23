import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch } from '@/lib/api';

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice || Platform.OS !== 'ios') return null;
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === 'granted' ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId || String(projectId).startsWith('REPLACE_')) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await apiFetch('/api/me/device-tokens', {
    method: 'PUT',
    body: JSON.stringify({
      token,
      deviceName: Device.deviceName,
      appVersion: Application.nativeApplicationVersion,
    }),
  }, true);
  return token;
}
