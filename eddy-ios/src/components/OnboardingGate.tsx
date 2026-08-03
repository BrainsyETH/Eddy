import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Otter } from '@/components/Otter';
import { FirstRunPicker } from '@/components/FirstRunPicker';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import {
  acceptTerms,
  completePersonalization,
  hasAcceptedTerms,
  markPersonalizationPending,
  needsMigrationRecord,
  readPersonalization,
  resolveFirstRun,
  stepAfterLegal,
  type FirstRunSnapshot,
  type FirstRunStep,
} from '@/lib/onboarding';
import { report, warn } from '@/lib/monitoring';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [step, setStep] = useState<FirstRunStep | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * The LAUNCH state of both keys, kept for the whole session.
   *
   * Held rather than re-read because after `acceptTerms()` lands the legal key
   * says "accepted", which is byte-identical to what a pre-picker install looks
   * like — and that install must skip the picker while the new user must see it.
   * Re-deriving from storage after the tap answers the wrong question, and only
   * on a real device, where nothing is watching. See stepAfterLegal.
   */
  const [snapshot, setSnapshot] = useState<FirstRunSnapshot | null>(null);

  // The .catch() is load-bearing, not defensive habit. Everything below this
  // component renders only once `step` stops being null, so a rejection with
  // no catch does not surface an error — it renders the blank fallback forever,
  // in a colour identical to the splash. Both readers already fail safe; this is
  // the second belt, for anything they cannot catch.
  useEffect(() => {
    let active = true;
    void Promise.all([hasAcceptedTerms(), readPersonalization()])
      .catch((error) => {
        report(error, { operation: 'onboarding.readFirstRun' });
        return [false, null] as const;
      })
      .then(([legalAccepted, personalization]) => {
        if (!active) return;
        const next: FirstRunSnapshot = { legalAccepted, personalization };
        setSnapshot(next);
        const resolved = resolveFirstRun(next);
        setStep(resolved);

        // ── Say which pane this launch chose ──────────────────────────
        // First run resolves once and is then unobservable on that device
        // forever, so a report that the disclaimer did not appear had nothing
        // to check it against — not the keys, not the build, not the step. On
        // a build with a DSN this is a breadcrumb attached to anything that
        // reports later; on one without, it is a console line a field tester
        // can read off a connected Mac. Either beats guessing.
        //
        // Names the inputs, not just the outcome: 'app' with legalAccepted
        // false would be a real bug, and 'app' with it true is simply somebody
        // who has used the app before.
        warn(
          'onboarding',
          `first run resolved to "${resolved}" ` +
            `(legal=${legalAccepted}, personalization=${personalization ?? 'none'})`,
        );

        // An install from before the picker existed. Settle it permanently, so a
        // later legal re-gate does not read the absent key as "never asked" and
        // show the picker to someone who has been following rivers for months.
        if (needsMigrationRecord(next)) void completePersonalization();
      });
    return () => {
      active = false;
    };
  }, []);

  /** Followed or skipped — either way the question has been asked. */
  const finishPicker = useCallback(() => {
    void completePersonalization();
    setStep('app');
  }, []);

  /**
   * No catalog and no cache, so there was nothing to ask with.
   *
   * Deliberately does NOT record completion: the state stays `pending`, and
   * somebody whose first launch happened in a dead zone gets the picker on a
   * later one instead of losing it to a bad minute of signal.
   */
  const skipPickerUnasked = useCallback(() => setStep('app'), []);

  if (step === 'app') return <>{children}</>;
  if (step === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (step === 'picker') {
    return <FirstRunPicker onDone={finishPicker} onUnavailable={skipPickerUnasked} />;
  }

  const agree = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await acceptTerms();
    } catch (error) {
      // The acknowledgement happened even if persistence did not. Let this
      // session continue, report the storage failure, and re-prompt next launch.
      report(error, { operation: 'onboarding.acceptTerms' });
    } finally {
      const next = snapshot ? stepAfterLegal(snapshot) : 'app';
      // Recorded BEFORE the picker renders, so an onboarding interrupted by a
      // kill resumes there instead of being lost to the migration branch.
      if (next === 'picker') void markPersonalizationPending();
      setStep(next);
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
