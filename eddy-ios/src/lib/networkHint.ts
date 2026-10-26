import { requireOptionalNativeModule } from 'expo';
import type { NetworkState } from 'expo-network';

/** An optional optimization: older dev clients wait for the live request to settle.
 * Importing expo-network at runtime would throw before that request could run. */
export async function networkHintsOffline(): Promise<boolean> {
  try {
    const network = requireOptionalNativeModule<{
      getNetworkStateAsync?: () => Promise<NetworkState>;
    }>('ExpoNetwork');
    const state = await network?.getNetworkStateAsync?.();
    return state?.isConnected === false || state?.isInternetReachable === false;
  } catch {
    // Missing native capability or a failed query means unknown, not offline.
    return false;
  }
}
