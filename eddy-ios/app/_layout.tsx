import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppConfigProvider } from '@/hooks/useAppConfig';
import { SessionProvider } from '@/hooks/useSession';
import { StarredRiversProvider } from '@/hooks/useStarredRivers';
import { UpgradeGate } from '@/components/UpgradeGate';

// Remote config loads once here and wraps everything, so the version gate and
// feature flags have a single home. Both fail open — see useAppConfig.
//
// Stars sit INSIDE the upgrade gate deliberately: if a build is too old to run,
// it should not be writing to the local store that a future version will sync.
//
// SessionProvider wraps the star store because the store syncs against whatever
// session exists. It is deliberately NOT a gate: it acquires an anonymous
// identity in the background and every failure is non-fatal, so the app is fully
// usable with no session at all.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppConfigProvider>
        <UpgradeGate>
          <SessionProvider>
            <StarredRiversProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </StarredRiversProvider>
          </SessionProvider>
        </UpgradeGate>
      </AppConfigProvider>
    </SafeAreaProvider>
  );
}
