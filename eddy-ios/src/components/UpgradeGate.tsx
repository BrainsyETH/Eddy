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
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';

export function UpgradeGate({ children }: { children: ReactNode }) {
  const { upgradeRequired, config } = useAppConfig();
  const { colors } = useTheme();

  if (!upgradeRequired) return <>{children}</>;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.body}>
        {/* The "flag" mood is the canonical caution otter — a dead end still
            gets a face rather than a wall of text. */}
        <Otter mood="flag" size={110} />
        <Text style={[styles.title, { color: colors.text }]}>Time to update Eddy</Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>
          {config?.upgradeMessage ??
            'This version is out of date and can no longer show accurate river conditions. Please update from the App Store.'}
        </Text>
        <Text style={[styles.footnote, { color: colors.textSubtle }]}>
          River conditions change fast — an outdated app could show you the wrong water.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { ...t['2xl'], fontFamily: fonts.heading, marginTop: 14, marginBottom: 12, textAlign: 'center' },
  message: { ...t.base, fontFamily: fonts.body, textAlign: 'center' },
  footnote: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: 24 },
});
