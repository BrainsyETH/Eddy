import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_FLOAT_DOWNLOAD_KEY, restoreSetupDownload } from '@/lib/floatSetupDownload';
import { readTripPackage } from './tripDownloads';
import type { TripPackage } from '@/lib/tripDownload';

/** Only a package explicitly downloaded by the paddler can restore a setup. */
export async function readPendingFloatSetup(): Promise<{ pkg: TripPackage; boatType?: string } | null> {
  try {
    return await restoreSetupDownload(await AsyncStorage.getItem(PENDING_FLOAT_DOWNLOAD_KEY), readTripPackage);
  } catch { return null; }
}

export async function savePendingFloatSetup(pkg: TripPackage, boatType: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_FLOAT_DOWNLOAD_KEY, JSON.stringify({ tripKey: pkg.tripKey, boatType }));
}

export async function clearPendingFloatSetup(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_FLOAT_DOWNLOAD_KEY).catch(() => {});
}
