// eddy-ios/app/(tabs)/profile.tsx
// Account, subscription, and the two controls App Review specifically looks
// for: Restore Purchases and account deletion.
//
// ── What is required here and why ─────────────────────────────────────────
//
//   * Sign in with Apple — the identity a purchase attaches to. Offered, never
//     forced: the free tier works with no account at all, and demanding one up
//     front would wall the first taste the whole funnel depends on.
//   * Restore Purchases (Guideline 3.1.1) — a reviewer will look for it, and a
//     real user reinstalling needs it.
//   * Delete Account (Guideline 5.1.1(v)) — in-app, and actually deleting. Not
//     deactivating, not emailing support.
//   * Auto-renew disclosure plus Terms and Privacy, shown WITH the subscription
//     controls rather than buried behind a link.
//
// Notification preferences show OS state rather than duplicating it. iOS owns
// the permission, so a switch here would be a second source of truth that can
// disagree with Settings — the section reports what is true and links to the
// place that can change it.
//
// Colour convention, as everywhere in this app: StyleSheet.create holds layout
// and type only — it runs once at import, so a colour written into it would be
// frozen at whichever scheme the app launched with. Colour comes from
// useTheme(), inline.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { APPLE_SIGN_IN_CANCELLED, useSession } from '@/hooks/useSession';
import { useAccount } from '@/hooks/useAccount';
import { deleteAccount, waitForEntitlement } from '@/api/client';
import {
  OFFER_CODE_REDEEM_URL,
  restorePurchases,
  subscriptionSummary,
  syncRedeemedPurchases,
} from '@/lib/purchases';
import { usePush } from '@/hooks/usePush';
import { notificationDetail } from '@/lib/notificationCopy';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { resolveEnvironment } from '@/lib/monitoring';
import { resetFirstRun } from '@/lib/onboarding';

/**
 * Not the same thing as the Feedback sheet below it. Feedback is one-way and
 * lands in our own store; support is a reply channel, and App Review expects a
 * way to reach a human from inside the app.
 *
 * The same address as eddy.guide/support and the privacy policy, deliberately.
 * Support arriving at two inboxes is how a request goes unanswered while
 * everyone assumes someone else has it.
 */
const SUPPORT_EMAIL = 'eddy@eddy.guide';

/**
 * Apple's own subscription-management screen. Eddy cannot cancel a subscription
 * on someone's behalf — only Apple can — so the honest control is one that
 * takes them where it actually happens.
 */
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

export default function ProfileScreen() {
  const { colors, elevation } = useTheme();
  const router = useRouter();
  const {
    session,
    ready,
    unavailable,
    isAnonymous,
    getAccessToken,
    signInWithApple,
    signOut,
    forgetSession,
  } = useSession();
  const { profile, entitlement, loaded, error, refresh } = useAccount();
  const { permission, optedOut, registered, enable, disable } = usePush();

  const [busy, setBusy] = useState<null | 'apple' | 'restore' | 'redeem' | 'delete'>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  /**
   * Whether the first-run keys have been cleared this session.
   *
   * The button has to say something afterwards or it looks like it did nothing:
   * clearing the keys changes what the NEXT cold start does and has no effect
   * on the screen it was tapped from. The label carries the next step.
   */
  const [firstRunCleared, setFirstRunCleared] = useState(false);

  const signedIn = Boolean(session) && !isAnonymous;

  /**
   * Will a push actually arrive on this phone?
   *
   * Every one of these has to be true, which is why the headline could not be
   * `permission === 'granted'` alone: iOS can allow notifications for an app
   * that has unregistered its token, and an account is what a notification is
   * addressed to. `registered` is deliberately not in here — it lags a launch
   * and a device that has not re-registered yet is going to, which the detail
   * sentence says in its own words.
   */
  const receiving = permission === 'granted' && !optedOut && signedIn;

  const handleSignIn = useCallback(async () => {
    setBusy('apple');
    try {
      await signInWithApple();
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed.';
      // Backing out of Apple's sheet is a decision, not an error.
      if (message !== APPLE_SIGN_IN_CANCELLED) {
        Alert.alert('Could not sign in', message);
      }
    } finally {
      setBusy(null);
    }
  }, [signInWithApple, refresh]);

  const handleRestore = useCallback(async () => {
    setBusy('restore');
    try {
      const result = await restorePurchases();
      // A successful restore reaches us through RevenueCat's webhook, so the
      // SERVER is what to re-read — the SDK's own response is not the authority
      // on entitlement.
      if (result.entitled) await refresh();
      Alert.alert(result.entitled ? 'Subscription restored' : 'Nothing to restore', result.message);
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  /**
   * Same ref-not-state reasoning as the paywall's copy of this flag: nothing
   * renders from it, it only marks the next foregrounding as a return from the
   * App Store's code-entry screen rather than an ordinary app switch.
   */
  const redeemPending = useRef(false);

  /**
   * Offer codes — the influencer month, the giveaway year — are redeemed on
   * the App Store's own screen, not in the app. This opens it; the effect
   * below finishes the job when they come back.
   */
  const handleRedeem = useCallback(() => {
    redeemPending.current = true;
    void Linking.openURL(OFFER_CODE_REDEEM_URL);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !redeemPending.current) return;
      redeemPending.current = false;

      void (async () => {
        setBusy('redeem');
        try {
          // Sync the receipt first — the redemption happened outside the app,
          // so RevenueCat has not heard about it until the app tells it.
          const entitled = await syncRedeemedPurchases();
          // Backing out of the App Store without redeeming is the common case,
          // and it gets silence: no alert, the card exactly as they left it.
          if (!entitled) return;

          // The SDK saw it; the card reads from the SERVER, which learns
          // through RevenueCat's webhook. Wait for it before refreshing so the
          // card flips to active rather than to a stale "no subscription".
          const token = await getAccessToken();
          const live = token ? await waitForEntitlement(token) : false;
          await refresh();

          Alert.alert(
            'Code redeemed',
            live
              ? 'Eddy Premium is active on your account.'
              : 'It can take a moment to show up. If this card still looks wrong in a minute, pull to refresh.',
          );
        } finally {
          setBusy(null);
        }
      })();
    });

    return () => subscription.remove();
  }, [getAccessToken, refresh]);

  const handleDisableAlerts = useCallback(async () => {
    try {
      const persisted = await disable();
      if (persisted) return;
      Alert.alert(
        'Alerts stopped for now',
        'Eddy could not save that preference on this device, so alerts may turn back on after the next launch. Please try again.',
      );
    } catch (error) {
      Alert.alert(
        'Could not stop alerts',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }, [disable]);

  const runDelete = useCallback(async () => {
    setBusy('delete');
    try {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert('Could not delete', 'You are not signed in on this device.');
        return;
      }

      // Unregister first, while the token still authenticates. After deletion
      // the device_tokens row is gone with the cascade anyway; doing it here
      // covers the case where deletion fails partway.
      await disable();

      const result = await deleteAccount(token);

      // signOut() would post to an endpoint whose user no longer exists, so the
      // session is dropped locally instead.
      await forgetSession();

      Alert.alert(
        'Account deleted',
        result.hadActiveEntitlement
          ? 'Your account and its data are gone. Your Apple subscription is still active — cancel it in Settings › Apple ID › Subscriptions to stop being billed.'
          : 'Your account and its data are gone.',
      );
    } catch (err) {
      Alert.alert('Could not delete', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }, [getAccessToken, forgetSession, disable]);

  const handleDelete = useCallback(() => {
    // Two steps, and the first names what is lost. This is the only
    // irreversible action in the app.
    Alert.alert(
      'Delete your account?',
      entitlement?.isActive
        ? 'This permanently deletes your account, saved floats and favorites.\n\nIt does NOT cancel your subscription — only you can do that, in your Apple ID settings. Cancel there first, or you will keep being billed.'
        : 'This permanently deletes your account, saved floats and favorites. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('This cannot be undone', 'Delete your Eddy account permanently?', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete permanently', style: 'destructive', onPress: () => void runDelete() },
            ]),
        },
      ],
    );
  }, [entitlement, runDelete]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'Your favorites stay on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          // Unregister BEFORE signing out: the call needs the token that is
          // about to be discarded. Otherwise this device keeps receiving
          // alerts for an account no longer on it.
          void (async () => {
            await disable();
            await signOut();
          })();
        },
      },
    ]);
  }, [signOut, disable]);

  const version = Constants.expoConfig?.version ?? '0.0.0';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>

        {/* ── Account ─────────────────────────────────────────────── */}
        <Section title="Account" muted={colors.textMuted}>
          {!ready ? (
            <ActivityIndicator color={colors.interactive} style={styles.pad} />
          ) : signedIn ? (
            <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
              <View style={styles.row}>
                <Ionicons name="person-circle-outline" size={26} color={colors.interactive} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {profile?.displayName ?? 'Signed in with Apple'}
                  </Text>
                  <Text style={[styles.rowNote, { color: colors.textMuted }]}>
                    Your favorites and floats sync across your iOS devices.
                  </Text>
                </View>
              </View>
              <Pressable onPress={handleSignOut} style={[styles.secondary, { borderColor: colors.border }]}>
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>Sign out</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                {unavailable ? 'Accounts are unavailable' : 'Not signed in'}
              </Text>
              <Text style={[styles.rowNote, { color: colors.textMuted }]}>
                {unavailable
                  ? 'Everything still works — your favorites are kept on this device.'
                  : 'Eddy works without an account. Sign in to sync your favorites across devices, and to subscribe.'}
              </Text>

              {!unavailable && (
                <View style={styles.appleWrap}>
                  {busy === 'apple' ? (
                    <ActivityIndicator color={colors.interactive} />
                  ) : (
                    // Apple's own button, not a facsimile: the Human Interface
                    // Guidelines require the real control, and its style has to
                    // follow the colour scheme.
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                      buttonStyle={
                        colors.scheme === 'dark'
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={10}
                      style={styles.appleButton}
                      onPress={handleSignIn}
                    />
                  )}
                </View>
              )}
            </View>
          )}
        </Section>

        {/* ── Subscription ────────────────────────────────────────── */}
        <Section title="Eddy Premium" muted={colors.textMuted}>
          <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
            <View style={styles.row}>
              <Otter mood={entitlement?.isActive ? 'green' : 'standard'} size={40} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {entitlement?.isActive ? 'Eddy Premium is active' : 'Eddy Premium'}
                </Text>
                <Text
                  style={[
                    styles.rowNote,
                    { color: entitlement?.billingIssue ? colors.error : colors.textMuted },
                  ]}
                >
                  {loaded ? subscriptionSummary(entitlement) : 'Checking…'}
                </Text>
              </View>
            </View>

            {/* The way IN, which this card had no version of.
                The only other route to the paywall is Eddy's read on a river,
                the one thing a subscription gates — so someone who simply wants
                to subscribe, or who dismissed an offer earlier and came back for
                it, arrived at a card that could only restore a purchase they had
                never made. `loaded` gates it so the button does not flash up
                under someone who is already subscribed. */}
            {loaded && !entitlement?.isActive && (
              <Pressable
                onPress={() => setPaywallOpen(true)}
                style={[styles.primary, { backgroundColor: colors.accentFill }]}
              >
                <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                  Get Eddy Premium
                </Text>
              </Pressable>
            )}

            {entitlement?.isActive && (
              <Pressable
                onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)}
                style={[styles.secondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                  Manage or cancel in Settings
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleRestore}
              disabled={busy === 'restore'}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
              </Text>
            </Pressable>

            {/* Subscription offer codes — redeemed on the App Store's screen,
                picked up here on return. Signed-in only, matching the
                paywall's identity guard: the entitlement a code grants has to
                land on a real account the moment the receipt syncs. Not gated
                on entitlement state — an offer for existing subscribers is a
                thing App Store Connect can issue. */}
            {signedIn && (
              <Pressable
                onPress={handleRedeem}
                disabled={busy === 'redeem'}
                style={[styles.secondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                  {busy === 'redeem' ? 'Checking your code…' : 'Redeem a code'}
                </Text>
              </Pressable>
            )}

            {/* Auto-renew disclosure. Required wherever a subscription is sold
                or managed, and it has to sit WITH the controls rather than
                behind a link. */}
            <Text style={[styles.legal, { color: colors.textSubtle }]}>
              Eddy Premium is an auto-renewing subscription billed through your Apple ID. It renews
              automatically unless turned off at least 24 hours before the period ends. Manage or
              cancel it in your Apple ID settings — deleting the app does not cancel it.
            </Text>

            <View style={styles.legalLinks}>
              <Pressable onPress={() => void Linking.openURL(TERMS_URL)}>
                <Text style={[styles.legalLink, { color: colors.interactive }]}>Terms</Text>
              </Pressable>
              <Text style={[styles.legal, { color: colors.textSubtle }]}>·</Text>
              <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)}>
                <Text style={[styles.legalLink, { color: colors.interactive }]}>Privacy</Text>
              </Pressable>
            </View>
          </View>
        </Section>

        {/* ── Notifications ───────────────────────────────────────── */}
        <Section title="Notifications" muted={colors.textMuted}>
          <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
            <View style={styles.row}>
              {/* ── "Alerts are on" next to a button reading "Turn on alerts" ──
                  The headline reported the OS PERMISSION and nothing else, so
                  stopping alerts on this device left the card saying they were
                  on — beside a button offering to turn them on, and a sentence
                  underneath saying they were stopped. Three controls, three
                  answers, and the one in the largest type was the wrong one.
                  It read as a preference that had not saved. It had: the
                  opt-out is what makes the button and the sentence change.

                  iOS permission is a PRECONDITION, not the state. This device
                  receives alerts when the permission is granted AND the device
                  has not opted out, and that conjunction is what the line says
                  now. `notificationDetail` below already ordered its cases this
                  way; the headline simply never agreed with it. */}
              <Ionicons
                name={receiving ? 'notifications' : 'notifications-off-outline'}
                size={22}
                color={receiving ? colors.success : colors.textMuted}
              />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {receiving ? 'Alerts are on' : 'Alerts are off'}
                </Text>
                <Text style={[styles.rowNote, { color: colors.textMuted }]}>
                  {notificationDetail({ permission, optedOut, registered, signedIn })}
                </Text>
              </View>
            </View>

            {/* Three different states, three different actions — and only one
                of them is a prompt we are still allowed to show. */}
            {((permission === 'undetermined' && signedIn) ||
              (permission === 'granted' && optedOut)) && (
              <Pressable
                onPress={() => void enable()}
                style={[styles.secondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                  Turn on alerts
                </Text>
              </Pressable>
            )}

            {(permission === 'denied' || permission === 'unsupported') && (
              // iOS will not show its dialog again, so Settings is the only
              // route left. Saying "turn on alerts" here would be a button
              // that cannot do what it says.
              <Pressable
                onPress={() => void Linking.openSettings()}
                style={[styles.secondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                  Open Settings
                </Text>
              </Pressable>
            )}

            {permission === 'granted' && registered && (
              <Pressable
                onPress={() => void handleDisableAlerts()}
                style={[styles.secondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                  Stop alerts on this device
                </Text>
              </Pressable>
            )}

            {/* Offered whatever the OS permission says. Someone whose alerts
                are currently off may still be setting up before they turn them
                on, and a control that appears only once you are already being
                notified is one you find by being woken up. */}
            {signedIn && (
              <Pressable
                onPress={() => router.push('/alerts/quiet-hours')}
                style={[styles.secondary, { borderColor: colors.border }]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                  Quiet hours
                </Text>
              </Pressable>
            )}

            <SafetyDisclaimer compact />
            <Text style={[styles.legal, { color: colors.textSubtle }]}>
              Readings come from USGS gauges and can trail the river by up to about an hour.
            </Text>
          </View>
        </Section>

        {/* ── Storage ─────────────────────────────────────────────── */}
        {/* Here because this is where someone goes looking, and because "what
            is this app keeping on my phone" had no in-app answer at all — a
            question App Review and privacy-minded users both ask directly. */}
        <Section title="Storage" muted={colors.textMuted}>
          <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
            <View style={styles.row}>
              <Ionicons name="phone-portrait-outline" size={22} color={colors.textMuted} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>On this phone</Text>
                <Text style={[styles.rowNote, { color: colors.textMuted }]}>
                  Eddy keeps every river&apos;s put-ins, hazards and last reading here so they
                  work with no signal.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => router.push('/storage')}
              style={[styles.secondary, { borderColor: colors.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                Manage storage
              </Text>
            </Pressable>

            {/* ── Re-running first run, off production only ──────────────
                First run is the one flow in the app that cannot be entered
                twice on a device: two AsyncStorage keys are written once and
                nothing clears them, so checking a change to the disclaimer or
                the river picker meant deleting the app and reinstalling from
                TestFlight.

                That is also why "I reinstalled and was not prompted" could not
                be investigated — there was no way to ask the device to do it
                again. See resetFirstRun in src/lib/onboarding.ts.

                NOT ON PRODUCTION. A control that clears a legal acknowledgement
                has no business in a shipped build, and the channel is read from
                monitoring's resolver rather than a second copy of the same
                logic. It relaunches nothing: the keys are cleared and the next
                cold start reads them, which is precisely the path being
                tested. */}
            {resolveEnvironment() !== 'production' ? (
              <Pressable
                onPress={() => {
                  void resetFirstRun().then(() => setFirstRunCleared(true));
                }}
                style={[styles.secondary, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Show the disclaimer and river picker again on next launch"
              >
                <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                  {firstRunCleared ? 'Cleared — force-quit and reopen' : 'Reset first run'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Section>

        {/* ── Telling us something is wrong ───────────────────────── */}
        <Section title="Feedback" muted={colors.textMuted}>
          <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
            <Text style={[styles.rowNote, { color: colors.textMuted }]}>
              Wrong reading, missing put-in, or something broken? The river and gauge screens each
              have their own report button, which arrives with the thing it is about attached — use
              those when you can. This one is for everything else.
            </Text>
            <Pressable
              onPress={() => setFeedbackOpen(true)}
              style={[styles.secondary, { borderColor: colors.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryText, { color: colors.textMuted }]}>Send feedback</Text>
            </Pressable>

            {/* Feedback goes one way. This is the one that answers back. */}
            <Pressable
              onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              style={[styles.secondary, { borderColor: colors.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
                Email support
              </Text>
            </Pressable>

            <Text style={[styles.legal, { color: colors.textSubtle }]}>
              Or write to {SUPPORT_EMAIL} from any mail app.
            </Text>
          </View>
        </Section>

        {/* ── Deleting the account ────────────────────────────────── */}
        {signedIn && (
          <Section title="Delete account" muted={colors.textMuted}>
            <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
              <Text style={[styles.rowNote, { color: colors.textMuted }]}>
                Deleting your account removes your profile, favorites and saved floats. This
                cannot be undone.
              </Text>
              <Pressable
                onPress={handleDelete}
                disabled={busy === 'delete'}
                style={[styles.danger, { borderColor: colors.error }]}
              >
                <Text style={[styles.dangerText, { color: colors.error }]}>
                  {busy === 'delete' ? 'Deleting…' : 'Delete account'}
                </Text>
              </Pressable>
            </View>
          </Section>
        )}

        {error && (
          <Text style={[styles.rowNote, styles.pad, { color: colors.textMuted }]}>{error}</Text>
        )}

        <Text style={[styles.version, { color: colors.textSubtle }]}>Eddy {version}</Text>
      </ScrollView>

      <FeedbackSheet
        visible={feedbackOpen}
        onDismiss={() => setFeedbackOpen(false)}
        context={{ type: 'general' }}
      />

      {/* onPurchased re-reads the profile so the card above flips to active
          without a relaunch. The sheet waits for the SERVER to confirm the
          entitlement, not merely for StoreKit, so by the time this fires
          /api/me/profile has the row. */}
      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => {
          setPaywallOpen(false);
          void refresh();
        }}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  muted,
  children,
}: {
  title: string;
  muted: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: muted }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  title: { ...t['3xl'], fontFamily: fonts.heading },
  section: { marginTop: 24 },
  sectionTitle: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.8, marginBottom: 8 },
  card: { borderRadius: 14, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...t.base, fontFamily: fonts.semibold },
  rowNote: { ...t.sm, fontFamily: fonts.body },
  appleWrap: { minHeight: 46, justifyContent: 'center' },
  appleButton: { height: 46, width: '100%' },
  primary: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
  secondary: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  secondaryText: { ...t.sm, fontFamily: fonts.medium },
  danger: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  dangerText: { ...t.sm, fontFamily: fonts.semibold },
  legal: { ...t.xs, fontFamily: fonts.body },
  legalLinks: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  legalLink: { ...t.xs, fontFamily: fonts.medium },
  pad: { paddingVertical: 8 },
  version: { ...t.xs, fontFamily: fonts.mono, textAlign: 'center', marginTop: 32 },
});
