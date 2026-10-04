import { requireOptionalNativeModule } from 'expo';
import type { NetworkState } from 'expo-network';

/** An optional optimization: older dev clients still use the loader's grace period.
 * Importing expo-network at runtime would throw before that fallback could run. */
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
