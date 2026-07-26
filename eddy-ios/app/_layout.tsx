import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppConfigProvider } from '@/hooks/useAppConfig';
import { UpgradeGate } from '@/components/UpgradeGate';

// Remote config loads once here and wraps everything, so the version gate and
// feature flags have a single home. Both fail open — see useAppConfig.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppConfigProvider>
        <UpgradeGate>
          <Stack screenOptions={{ headerShown: false }} />
        </UpgradeGate>
      </AppConfigProvider>
    </SafeAreaProvider>
  );
}
