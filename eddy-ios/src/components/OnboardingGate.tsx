import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Otter } from '@/components/Otter';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import { acceptTerms, hasAcceptedTerms } from '@/lib/onboarding';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const TERMS_URL = 'https://eddy.guide/terms';
const PRIVACY_URL = 'https://eddy.guide/privacy';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void hasAcceptedTerms().then((value) => {
      if (active) setAccepted(value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (accepted === true) return <>{children}</>;
  if (accepted === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const agree = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await acceptTerms();
      setAccepted(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.body}>
        <Otter mood="flag" size={110} />
        <Text style={[styles.title, { color: colors.text }]}>Know before you go</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>Eddy helps you plan river trips using gauge readings, forecasts, and researched access information.</Text>
        <SafetyDisclaimer />
        <Text style={[styles.copy, { color: colors.textMuted }]}>By continuing, you agree to Eddy&apos;s Terms of Use and acknowledge the Privacy Policy.</Text>
        <View style={styles.links}>
          <Pressable onPress={() => void Linking.openURL(TERMS_URL)} hitSlop={8}>
            <Text style={[styles.link, { color: colors.interactive }]}>Terms of Use</Text>
          </Pressable>
          <Text style={{ color: colors.textSubtle }}>·</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={8}>
            <Text style={[styles.link, { color: colors.interactive }]}>Privacy Policy</Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.footer, { borderTopColor: colors.border }]}> 
        <Pressable
          accessibilityRole="button"
          onPress={() => void agree()}
          disabled={saving}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.accentFill, opacity: pressed || saving ? 0.7 : 1 }]}
        >
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>{saving ? 'Saving…' : 'I understand'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  title: { ...t['2xl'], fontFamily: fonts.displayBold, textAlign: 'center', marginTop: 12 },
  copy: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 12 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  link: { ...t.sm, fontFamily: fonts.semibold, textDecorationLine: 'underline' },
  footer: { padding: 20, borderTopWidth: 1 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  buttonText: { ...t.base, fontFamily: fonts.semibold },
});
