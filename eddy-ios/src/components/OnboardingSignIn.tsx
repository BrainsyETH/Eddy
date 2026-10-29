import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppleSignInButton } from '@/components/AppleSignInButton';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import { FloatingEddy, Rise } from '@/components/OnboardingMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * What an alert looks like when it lands, shown before anybody is asked to
 * sign in for one.
 *
 * Worded as the server words it — buildNotification in
 * missouri-float-planner/src/lib/alerts/fanout.ts — so the preview is a promise
 * the real notification keeps. Marked "Example" on screen: it is not a reading
 * and must never be mistaken for one. One example, held still: a card that
 * swaps its words on a timer pulls the eye while somebody is reading or
 * deciding whether to sign in.
 */
const EXAMPLE_ALERT = {
  title: 'Current River is floatable',
  body: 'Conditions just came up to floatable. Check the latest reading before you go.',
} as const;

const BENEFITS = [
  { icon: 'notifications-outline', text: 'Alerts when your river is floatable or running high' },
  { icon: 'phone-portrait-outline', text: 'Your favorites on any iPhone you sign in on' },
  { icon: 'lock-closed-outline', text: 'No new password, and you can choose to hide your email' },
] as const;

export function OnboardingSignIn({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <FloatingEddy name="wave" size={118} />
        <Rise delay={160} style={styles.block}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Never miss a good river day.</Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            Sign in to create free river alerts.
          </Text>
        </Rise>
        <Rise delay={320} style={styles.block}>
          <ExampleAlert />
        </Rise>
        <View style={styles.benefits}>
          {BENEFITS.map((benefit, index) => (
            <Rise key={benefit.text} delay={480 + index * 100}>
              <View style={styles.benefit}>
                <View style={[styles.benefitIcon, { backgroundColor: colors.selectionBg }]}>
                  <ControlIcon name={benefit.icon} size={17} color={colors.interactive} />
                </View>
                <Text style={[styles.benefitText, { color: colors.text }]}>{benefit.text}</Text>
              </View>
            </Rise>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {/* Apple's own control, never a facsimile — see AppleSignInButton. It is
            made the screen's one strong shape instead: full width, taller than
            the default, with nothing competing beside it. */}
        <AppleSignInButton onSignedIn={onDone} onBusyChange={setBusy} height={54} cornerRadius={14} />
        <Text style={[styles.note, { color: colors.textMuted }]}>
          You pick which alerts to create. Notifications stay off until you allow them.
        </Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }}
          accessibilityHint="Continues without an account. You can sign in later in Settings."
          disabled={busy} onPress={onDone}
          style={({ pressed }) => [styles.skip, { opacity: pressed || busy ? 0.5 : 1 }]}>
          <Text style={[styles.skipText, { color: colors.interactive }]}>Maybe later</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** A lock-screen style notification, so the benefit is seen before it is asked for. */
function ExampleAlert() {
  const { colors, elevation } = useTheme();
  const alert = EXAMPLE_ALERT;
  return (
    <View style={styles.example}>
      <Text style={[styles.exampleLabel, { color: colors.textSubtle }]}>EXAMPLE ALERT</Text>
      <View accessible accessibilityLabel={`Example alert. ${alert.title}. ${alert.body}`}
        style={[styles.notification, { backgroundColor: colors.card, borderColor: colors.border }, elevation(1)]}>
        <View style={[styles.appIcon, { backgroundColor: colors.selectionBg }]}>
          <EddySymbol name="eddyRated" size={26} />
        </View>
        <View style={styles.notificationCopy}>
          <View style={styles.notificationHead}>
            <Text style={[styles.appName, { color: colors.textMuted }]}>EDDY</Text>
            <Text style={[styles.appName, { color: colors.textSubtle }]}>now</Text>
          </View>
          <Text style={[styles.notificationTitle, { color: colors.text }]}>{alert.title}</Text>
          <Text style={[styles.notificationBody, { color: colors.textMuted }]}>{alert.body}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  block: { alignSelf: 'stretch', alignItems: 'center' },
  title: { ...t['3xl'], fontFamily: fonts.displayBold, textAlign: 'center', marginTop: 14 },
  copy: { ...t.base, fontFamily: fonts.body, textAlign: 'center', marginTop: 8, paddingHorizontal: 6 },
  example: { alignSelf: 'stretch', marginTop: 22, gap: 6 },
  exampleLabel: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.8, textAlign: 'center' },
  notification: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 18, padding: 12 },
  appIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1, gap: 2 },
  notificationHead: { flexDirection: 'row', justifyContent: 'space-between' },
  appName: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.4 },
  notificationTitle: { ...t.sm, fontFamily: fonts.semibold },
  notificationBody: { ...t.sm, fontFamily: fonts.body },
  benefits: { alignSelf: 'stretch', gap: 12, marginTop: 22 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  benefitText: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, borderTopWidth: 1, gap: 6 },
  note: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: 4 },
  skip: { paddingVertical: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { ...t.base, fontFamily: fonts.semibold },
});
