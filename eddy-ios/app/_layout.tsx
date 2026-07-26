import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppConfigProvider } from '@/hooks/useAppConfig';
import { StarredRiversProvider } from '@/hooks/useStarredRivers';
import { UpgradeGate } from '@/components/UpgradeGate';

// Remote config loads once here and wraps everything, so the version gate and
// feature flags have a single home. Both fail open — see useAppConfig.
//
// Stars sit INSIDE the upgrade gate deliberately: if a build is too old to run,
// it should not be writing to the local store that a future version will sync.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppConfigProvider>
        <UpgradeGate>
          <StarredRiversProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </StarredRiversProvider>
        </UpgradeGate>
      </AppConfigProvider>
    </SafeAreaProvider>
  );
}
