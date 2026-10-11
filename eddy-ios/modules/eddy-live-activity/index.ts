import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { ActivityAvailability, FloatActivitySnapshot } from '../../src/lib/floatActivity';

interface NativeFloatActivity {
  sync(snapshot: string | null, allowStart: boolean): Promise<ActivityAvailability>;
  addListener(event: 'onActivityState', listener: (event: { availability: ActivityAvailability }) => void): { remove(): void };
}
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<NativeFloatActivity>('EddyLiveActivity') : null;
export const supportsFloatActivity = native != null;
export function observeNativeFloatActivity(listener: (availability: ActivityAvailability) => void): void {
  // Process-lifetime observer, like the session store. Never ends the float.
  native?.addListener('onActivityState', (event) => listener(event.availability));
}
export async function syncNativeFloatActivity(snapshot: FloatActivitySnapshot | null, allowStart: boolean): Promise<ActivityAvailability> {
  if (!native) return 'unavailable';
  return native.sync(snapshot == null ? null : JSON.stringify(snapshot), allowStart);
}
