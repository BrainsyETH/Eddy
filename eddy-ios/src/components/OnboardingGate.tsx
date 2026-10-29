import { openExternalLink } from '@/lib/openExternalLink';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EddySymbol } from '@/components/EddySymbol';
import { FloatingEddy, PressableScale, Rise } from '@/components/OnboardingMotion';
import { preloadTodayData } from '@/lib/firstRunPreload';
import { FirstRunPicker } from '@/components/FirstRunPicker';
import { OnboardingSignIn } from '@/components/OnboardingSignIn';
import { useSession } from '@/hooks/useSession';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import {
  acceptTerms,
  completePersonalization,
  hasAcceptedTerms,
  markPersonalizationPending,
  markSignInPending,
  needsMigrationRecord,
  readPersonalization,
  resolveFirstRun,
  stepAfterLegal,
  stepAfterPicker,
  type FirstRunSnapshot,
  type FirstRunStep,
} from '@/lib/onboarding';
import { report, warn } from '@/lib/monitoring';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { fontScale, height } = useWindowDimensions();
  const { accountsConfigured, ready, isAnonymous } = useSession();
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

  useEffect(() => {
    if (step === 'picker') preloadTodayData();
  }, [step]);

  const finishOnboarding = useCallback(async () => {
    await completePersonalization();
    setStep('app');
  }, []);

  /** Followed or skipped — offer an account only after the picker is finished. */
  const finishPicker = useCallback(async () => {
    const next = stepAfterPicker(accountsConfigured, ready && !isAnonymous);
    if (next === 'sign-in') await markSignInPending();
    else await completePersonalization();
    setStep(next);
  }, [accountsConfigured, ready, isAnonymous]);

  useEffect(() => {
    // Keychain can restore a permanent session on reinstall. Never ask again.
    if (step === 'sign-in' && (!accountsConfigured || (ready && !isAnonymous))) {
      void finishOnboarding();
    }
  }, [step, accountsConfigured, ready, isAnonymous, finishOnboarding]);

  if (step === 'app') return <>{children}</>;
  if (step === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (step === 'sign-in') {
    return <OnboardingSignIn onDone={() => void finishOnboarding()} />;
  }
  if (step === 'picker') {
    return <FirstRunPicker onDone={finishPicker} />;
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
      // Awaited: a kill between the write being queued and landing would
      // otherwise skip the picker for good on a brand-new install.
      if (next === 'picker') await markPersonalizationPending().catch(() => {});
      setStep(next);
      setSaving(false);
    }
  };

  // ── Where the disclaimer and terms sit ────────────────────────────────────
  // Beside the button that acknowledges them whenever they fit: in the pinned
  // footer, so nobody agrees to something scrolled out of view. At accessibility
  // text sizes or on a short screen, a footer holding four blocks would eat the
  // screen and could not scroll, so they move to the END of the scrolling body,
  // directly above the button, and only the button stays pinned.
  const legalInFooter = fontScale < 1.3 && height >= 700;
  const legal = (
    <View style={styles.legal}>
      <SafetyDisclaimer compact />
      <Text style={[styles.terms, { color: colors.textMuted }]}>
        By tapping {AGREE_LABEL}, you agree to Eddy&apos;s Terms of Use and acknowledge the Privacy Policy.
      </Text>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => void openExternalLink(TERMS_URL)} hitSlop={12}>
          <Text style={[styles.link, { color: colors.interactive }]}>Terms of Use</Text>
        </Pressable>
        <Text style={{ color: colors.textSubtle }}>·</Text>
        <Pressable accessibilityRole="link" onPress={() => void openExternalLink(PRIVACY_URL)} hitSlop={12}>
          <Text style={[styles.link, { color: colors.interactive }]}>Privacy Policy</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <FloatingEddy name="wave" size={150} />
        <Rise delay={180} style={styles.block}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Your day on the water starts here.</Text>
          <Text style={[styles.lede, { color: colors.textMuted }]}>Plan your next Ozarks float with Eddy.</Text>
        </Rise>
        <View style={styles.features}>
          {WELCOME_FEATURES.map((feature, index) => (
            <Rise key={feature.title} delay={340 + index * 110}>
              <View style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.border }]}
                accessible accessibilityLabel={`${feature.title}. ${feature.detail}`}>
                <View style={[styles.featureIcon, { backgroundColor: colors.selectionBg }]}>
                  <EddySymbol name={feature.symbol} size={30} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                  <Text style={[styles.featureDetail, { color: colors.textMuted }]}>{feature.detail}</Text>
                </View>
              </View>
            </Rise>
          ))}
        </View>
        {legalInFooter ? null : <View style={styles.legalInBody}>{legal}</View>}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border, paddingTop: legalInFooter ? 2 : 14 }]}>
        {legalInFooter ? legal : null}
        <PressableScale
          accessibilityRole="button"
          accessibilityHint="Accepts the Terms of Use and continues"
          onPress={() => void agree()}
          disabled={saving}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.accentFill, opacity: pressed || saving ? 0.7 : 1 }]}
        >
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>{saving ? 'Saving…' : AGREE_LABEL}</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

/**
 * The button's words, said once so the sentence under it can name it exactly.
 * "By tapping X" only means something when X is what the button says.
 */
const AGREE_LABEL = 'Agree & get started';

/**
 * Three things the app does, said as what the reader gets. Each line has to
 * stay true on a day with no data: these describe features, never a reading.
 */
const WELCOME_FEATURES = [
  { symbol: 'gauge', title: 'Live water levels', detail: 'Real-time gauges, rated for floating.' },
  { symbol: 'boatRamp', title: 'Access points and float times', detail: 'Put-ins, take-outs, and how long it takes.' },
  { symbol: 'alertWatch', title: 'Free river alerts', detail: 'Know when your river is floatable or running high.' },
] as const;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flexGrow: 1, paddingVertical: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  block: { alignSelf: 'stretch', alignItems: 'center' },
  title: { ...t['3xl'], fontFamily: fonts.displayBold, textAlign: 'center', marginTop: 14 },
  lede: { ...t.base, fontFamily: fonts.body, textAlign: 'center', marginTop: 8, paddingHorizontal: 6 },
  features: { alignSelf: 'stretch', gap: 10, marginTop: 22 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  // A fixed well, so a wide mark (the boat ramp) and a tall one (the bell)
  // hold the same slot — see EddySymbol's header.
  featureIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureCopy: { flex: 1, gap: 2 },
  featureTitle: { ...t.base, fontFamily: fonts.semibold },
  featureDetail: { ...t.sm, fontFamily: fonts.body },
  links: { flexWrap: 'wrap', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  link: { ...t.xs, fontFamily: fonts.semibold, textDecorationLine: 'underline' },
  legal: { alignSelf: 'stretch', gap: 8 },
  legalInBody: { alignSelf: 'stretch', marginTop: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 8, borderTopWidth: 1, gap: 10 },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 52 },
  buttonText: { ...t.base, fontFamily: fonts.semibold },
  terms: { ...t.xs, fontFamily: fonts.body, textAlign: 'center' },
});
