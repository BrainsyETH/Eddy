import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppleSignInButton } from '@/components/AppleSignInButton';
import { EddyScene } from '@/components/EddyScene';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function OnboardingSignIn({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <EddyScene name="wave" size={160} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Keep up with your rivers.</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          Sign in to set river alerts and sync your favorites across devices.
        </Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          You choose which alerts to create and whether to allow notifications. You can also sign in later in Settings.
        </Text>
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <AppleSignInButton onSignedIn={onDone} onBusyChange={setBusy} />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }}
          disabled={busy} onPress={onDone}
          style={({ pressed }) => [styles.skip, { opacity: pressed || busy ? 0.5 : 1 }]}>
          <Text style={[styles.skipText, { color: colors.interactive }]}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  title: { ...t['2xl'], fontFamily: fonts.displayBold, textAlign: 'center', marginTop: 16 },
  copy: { ...t.base, fontFamily: fonts.body, textAlign: 'center', marginTop: 14 },
  note: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 18 },
  footer: { padding: 20, borderTopWidth: 1, gap: 8 },
  skip: { paddingVertical: 14, alignItems: 'center' },
  skipText: { ...t.base, fontFamily: fonts.semibold },
});
