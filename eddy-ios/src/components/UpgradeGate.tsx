// eddy-ios/src/components/UpgradeGate.tsx
// Blocks the app when the server says this build is no longer supported.
//
// This is the only screen in the app with no way out, so the bar for showing it
// is deliberately high: it renders solely when a reachable config reports a
// min_supported_version above this build. Config unreachable, config missing,
// or version unknown all fall through to the normal app.

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useAppConfig } from '@/hooks/useAppConfig';
import { COLORS } from '@/theme/conditions';

export function UpgradeGate({ children }: { children: ReactNode }) {
  const { upgradeRequired, config } = useAppConfig();

  if (!upgradeRequired) return <>{children}</>;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Time to update Eddy</Text>
        <Text style={styles.message}>
          {config?.upgradeMessage ??
            'This version is out of date and can no longer show accurate river conditions. Please update from the App Store.'}
        </Text>
        <Text style={styles.footnote}>
          River conditions change fast — an outdated app could show you the wrong water.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  message: { color: COLORS.textMuted, fontSize: 16, textAlign: 'center', lineHeight: 24 },
  footnote: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 24, opacity: 0.8 },
});
