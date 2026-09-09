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
//   * Auto-renew disclosure plus Terms and Privacy remain on PaywallSheet, the
//     point of sale. Settings keeps direct links without repeating legal copy.
//
// Notification preferences distinguish Eddy's device opt-out from iOS
// permission. A switch appears only while Eddy can honor it; denied permission
// links to iOS Settings, and the remote kill switch renders unavailable state.
//
// Colour convention, as everywhere in this app: StyleSheet.create holds layout
// and type only — it runs once at import, so a colour written into it would be
// frozen at whichever scheme the app launched with. Colour comes from
// useTheme(), inline.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
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
import { deleteAccount, refreshEntitlement, waitForEntitlement } from '@/api/client';
import {
  entitlementMatchesSnapshot,
  OFFER_CODE_REDEEM_URL,
  readEntitlementSnapshot,
  redemptionAlert,
  restoreAlert,
  restorePurchases,
  subscriptionSummary,
  SUPPORT_EMAIL,
  syncRedeemedPurchases,
  type EntitlementSnapshot,
} from '@/lib/purchases';
import { usePush } from '@/hooks/usePush';
import { useAppConfig } from '@/hooks/useAppConfig';
import { notificationDetail } from '@/lib/notificationCopy';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { PaywallSheet } from '@/components/PaywallSheet';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { report, resolveEnvironment } from '@/lib/monitoring';
import { resetFirstRun } from '@/lib/onboarding';

/**
 * Apple's own subscription-management screen. Eddy cannot cancel a subscription
 * on someone's behalf — only Apple can — so the honest control is one that
 * takes them where it actually happens.
 */
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/**
 * How long a confirmed purchase may hide the buy button while the server
 * catches up.
 *
 * Three minutes. A webhook that has not landed in that time is usually not
 * coming this session — a lost delivery, or a sandbox account the server has
 * never heard of — and past it the "catching up" note is still true while
 * hiding "Get Eddy Premium" no longer is: it has stopped covering a gap and
 * started masking an unsubscribed account for the rest of the session, which
 * is exactly what confirmPending's own comment promises it never does. Long
 * enough that an ordinary slow webhook never sees the button flash back.
 */
const CONFIRM_PENDING_MAX_MS = 3 * 60_000;

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
  const { features } = useAppConfig();

  const [busy, setBusy] = useState<null | 'apple' | 'restore' | 'redeem' | 'delete'>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [alertsBusy, setAlertsBusy] = useState(false);

  /**
   * The App Store has confirmed a purchase the server has not caught up with.
   *
   * The gap this covers: a purchase or restore whose webhook had not landed by
   * the time waitForEntitlement gave up. The alert says "you are subscribed" —
   * truthfully — and refresh() then re-reads the OLD server state, so without
   * this flag the card renders "Get Eddy Premium" seconds after that alert.
   * A buy button under a subscription confirmation reads as the app calling
   * its own alert a lie.
   *
   * While set, the card says the account is catching up instead of offering a
   * second purchase. Cleared the moment the server agrees (the effect below),
   * so it can never mask a real unsubscribed state for longer than the gap it
   * names.
   *
   * ── And the gap has a ceiling ───────────────────────────────────────────
   * "The moment the server agrees" is a moment that can fail to arrive — a
   * lost webhook, a sandbox purchase the server will never see — and then
   * the button stayed hidden for the whole session, which broke the promise
   * above. So the flag is the moment it was raised rather than a boolean, and
   * the timer effect below reopens the button after CONFIRM_PENDING_MAX_MS.
   * The catching-up note stays beside it — that part is still true — and
   * Restore is available throughout, as it always was. A stamp rather than a
   * boolean so that raising it AGAIN (a restore after the window closed) is a
   * new value and restarts the window rather than being ignored as no change.
   */
  const [confirmPendingSince, setConfirmPendingSince] = useState<number | null>(null);
  const confirmPending = confirmPendingSince !== null;
  /**
   * True once CONFIRM_PENDING_MAX_MS has passed with no agreement from the
   * server. Reset whenever the pending state is raised, cleared with it.
   */
  const [confirmWindowClosed, setConfirmWindowClosed] = useState(false);
  const beginConfirmPending = useCallback(() => {
    setConfirmWindowClosed(false);
    setConfirmPendingSince(Date.now());
  }, []);
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
   * The other half of confirmPending: one more server poll, then the truth.
   *
   * waitForEntitlement already gave up once by the time this runs, so this is
   * deliberately the LAST automatic attempt — after it, the card's catch-up
   * note and the pull-to-refresh gesture carry the recovery rather than a
   * silent retry loop. If the poll succeeds, refresh() flips the card and the
   * effect below clears the flag.
   */
  const settleConfirmPending = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (token) {
        // Reconcile BEFORE polling, same as the restore path itself: the case
        // this pending state exists for — a transfer onto an account with no
        // entitlement row — is exactly the one polling alone can wait out
        // forever. See refreshEntitlement in src/api/client.ts.
        await refreshEntitlement(token);
        await waitForEntitlement(token);
      }
    } catch {
      // Every callee above swallows its own failures today — this catch makes
      // that contract LOCAL rather than a property of four other functions'
      // internals. Callers fire-and-forget this promise, so a rejection here
      // would be unhandled, skip the refresh below, and strand confirmPending
      // over a card that then hides the buy button indefinitely.
    } finally {
      // The card catches up whatever the poll did. refresh() itself never
      // rejects — useAccount.load absorbs failures into its own error state.
      await refresh();
    }
  }, [getAccessToken, refresh]);

  useEffect(() => {
    if (entitlement?.isActive) setConfirmPendingSince(null);
  }, [entitlement?.isActive]);

  /**
   * The ceiling on confirmPending. One timer per raising of the flag, and its
   * cleanup is what cancels it: the effect above nulls the stamp when the
   * server agrees, which re-runs this with nothing to do and clears the timer
   * on the way — and an unmount clears it the same way, so a screen that was
   * closed mid-window never sets state on a component that is gone.
   */
  useEffect(() => {
    if (confirmPendingSince === null) return;
    const remaining = Math.max(0, CONFIRM_PENDING_MAX_MS - (Date.now() - confirmPendingSince));
    const timer = setTimeout(() => setConfirmWindowClosed(true), remaining);
    return () => clearTimeout(timer);
  }, [confirmPendingSince]);

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

      // The SDK finding an entitlement is Apple's answer, not ours. The SERVER
      // is the authority, so ask it to reconcile with RevenueCat and then wait
      // for it to agree before saying anything was restored.
      //
      // refreshEntitlement is what makes that terminate for the case this whole
      // path exists for: restoring onto an account that did not buy — anyone
      // who deleted their account and signed in again — arrives as a TRANSFER
      // carrying no entitlement state, which polling alone can wait out
      // forever. See src/api/client.ts.
      let serverConfirmed = false;
      if (result.entitled) {
        const token = await getAccessToken();
        if (token) {
          await refreshEntitlement(token);
          serverConfirmed = await waitForEntitlement(token);
        }
        await refresh();
      }

      // Apple said yes and the server has not — the card would otherwise
      // offer a second purchase under the "Purchase found" alert. See
      // confirmPending.
      if (result.entitled && !serverConfirmed) {
        beginConfirmPending();
        void settleConfirmPending();
      }

      const alert = restoreAlert(result, serverConfirmed);
      Alert.alert(alert.title, alert.message);
    } finally {
      setBusy(null);
    }
  }, [getAccessToken, refresh, settleConfirmPending, beginConfirmPending]);

  /**
   * Same ref-not-state reasoning as the paywall's copy of this flag: nothing
   * renders from it, it only marks the next foregrounding as a return from the
   * App Store's code-entry screen rather than an ordinary app switch.
   */
  const redeemPending = useRef(false);

  /**
   * What the entitlement looked like BEFORE the App Store opened, which is the
   * only moment it can be read honestly: RevenueCat observes StoreKit on its
   * own and may have refreshed CustomerInfo by the time the app foregrounds,
   * so a baseline taken on the return trip can already contain the redemption
   * it was meant to predate.
   */
  const redeemBaseline = useRef<EntitlementSnapshot | null>(null);

  /**
   * Offer codes — the influencer month, the giveaway year — are redeemed on
   * the App Store's own screen, not in the app. This opens it; the effect
   * below finishes the job when they come back.
   *
   * The open is awaited rather than fired and forgotten. It rejects when
   * nothing on the device can handle an App Store URL — Screen Time or an MDM
   * profile hiding the store, a simulator without it — and the old form left
   * `redeemPending` set through that failure, so the next unrelated
   * foregrounding, hours later, would be mistaken for a return trip.
   */
  const handleRedeem = useCallback(async () => {
    setBusy('redeem');
    try {
      redeemBaseline.current = await readEntitlementSnapshot();
      redeemPending.current = true;
      await Linking.openURL(OFFER_CODE_REDEEM_URL);
    } catch (error) {
      redeemPending.current = false;
      redeemBaseline.current = null;
      report(error, { operation: 'offerCode.openRedeemUrl', surface: 'profile' });
      Alert.alert(
        'Could not open the App Store',
        'Codes are redeemed on the App Store’s own screen. Open the App Store, tap your account picture, and choose “Redeem Gift Card or Code”.',
      );
    } finally {
      // Cleared either way. On success the app is already leaving, so nothing
      // is visible between here and the listener below setting it again.
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !redeemPending.current) return;
      redeemPending.current = false;

      const before = redeemBaseline.current;
      redeemBaseline.current = null;

      void (async () => {
        setBusy('redeem');
        try {
          // Sync the receipt first — the redemption happened outside the app,
          // so RevenueCat has not heard about it until the app tells it. The
          // baseline is what turns "Premium is on" into "Premium CHANGED":
          // this control is offered to existing subscribers too, and for them
          // backing out of Apple's screen leaves an active entitlement that
          // says nothing about whether a code was accepted.
          const result = await syncRedeemedPurchases(before);

          // Only a real change is worth waiting on the server for. The card
          // reads from the SERVER, which learns through RevenueCat's webhook,
          // so wait for it before refreshing — otherwise the card flips to a
          // stale "no subscription" a beat after the good news.
          //
          // And wait for THIS change, not for any entitlement at all: an
          // existing subscriber is already active server-side, so "is there an
          // entitlement" is satisfied on the first poll and would confirm an
          // extension against the renewal date they had before they redeemed.
          let serverConfirmed = false;
          if (result.status === 'changed' && result.entitled) {
            const target = result.snapshot;
            const token = await getAccessToken();
            serverConfirmed = token
              ? await waitForEntitlement(token, {
                  until: (entitlement) => entitlementMatchesSnapshot(entitlement, target),
                })
              : false;
            await refresh();
          }

          // Silence for the common case — someone who looked and backed out —
          // and honest copy for the rest. Nothing here claims a code was
          // accepted: see RedemptionSyncResult for why the app cannot know.
          const alert = redemptionAlert(result, serverConfirmed);
          if (alert) Alert.alert(alert.title, alert.message);
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

  const handleAlertToggle = useCallback(
    async (next: boolean) => {
      setAlertsBusy(true);
      try {
        if (!next) {
          await handleDisableAlerts();
          return;
        }
        await enable();
      } catch (error) {
        Alert.alert(
          'Could not change alerts',
          error instanceof Error ? error.message : 'Please try again.',
        );
      } finally {
        setAlertsBusy(false);
      }
    },
    [enable, handleDisableAlerts],
  );

  const version = Constants.expoConfig?.version ?? '0.0.0';

  const notificationSummary = features.push
    ? notificationDetail({ permission, optedOut, registered, signedIn })
    : 'Temporarily unavailable. Alerts still appear in the Alerts tab.';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        // The gesture the restore and redemption alerts point at ("pull down
        // on Eddy's Settings tab"). This screen is where entitlement state renders,
        // and useAccount re-reads only on mount — so without this, "check
        // again in a moment" had no mechanism short of leaving the tab.
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
            tintColor={colors.interactive}
          />
        }
      >
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        {/* Identity is the page anchor, not another labelled settings group. */}
        <View style={[styles.accountCard, { backgroundColor: colors.card }, elevation(1)]}>
          {!ready ? (
            <ActivityIndicator color={colors.interactive} style={styles.pad} />
          ) : (
            <>
              <View style={styles.accountRow}>
                <View style={[styles.accountIcon, { backgroundColor: colors.selectionBg }]}>
                  <Ionicons name="person-outline" size={24} color={colors.interactive} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {signedIn
                      ? (profile?.displayName ?? 'Signed in with Apple')
                      : unavailable
                        ? 'Accounts unavailable'
                        : 'Not signed in'}
                  </Text>
                  <Text style={[styles.rowNote, { color: colors.textMuted }]}>
                    {signedIn
                      ? 'Favorites and saved floats sync across devices.'
                      : unavailable
                        ? 'Your favorites stay on this device.'
                        : 'Sign in to sync favorites and saved floats.'}
                  </Text>
                </View>
              </View>

              {!signedIn && !unavailable ? (
                <View style={styles.appleWrap} pointerEvents={busy === null ? 'auto' : 'none'}>
                  {busy === 'apple' ? (
                    <ActivityIndicator color={colors.interactive} />
                  ) : (
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
              ) : null}
            </>
          )}
        </View>

        {/* Premium is the only promotional surface and therefore owns the only
            filled action on the page. Restore and redeem remain discoverable,
            but read as utilities rather than competing calls to action. */}
        <Section title="Eddy Premium" muted={colors.textMuted}>
          <View style={[styles.premiumCard, { backgroundColor: colors.card }, elevation(1)]}>
            <View style={styles.premiumHead}>
              <Otter mood={entitlement?.isActive ? 'green' : 'standard'} size={40} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {entitlement?.isActive
                    ? 'Premium is active'
                    : entitlement?.billingIssue
                      ? 'Premium is inactive'
                      : 'Free plan'}
                </Text>
                <Text
                  style={[
                    styles.rowNote,
                    { color: entitlement?.billingIssue ? colors.error : colors.textMuted },
                  ]}
                >
                  {!loaded
                    ? 'Checking…'
                    : confirmPending && !entitlement?.isActive
                      ? 'Purchase found — your account is catching up. Pull down to check again.'
                      : entitlement?.billingIssue && !entitlement.isActive
                        ? 'Check your Apple ID payment method to restore access.'
                        : entitlement?.isActive
                          ? subscriptionSummary(entitlement)
                          : 'Unlock Eddy’s full river outlook.'}
                </Text>
              </View>
            </View>

            {loaded && !entitlement?.isActive && (!confirmPending || confirmWindowClosed) && (
              <Pressable
                onPress={() => setPaywallOpen(true)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel="View Eddy Premium"
                accessibilityState={{ disabled: busy !== null }}
                style={[styles.primary, { backgroundColor: colors.accentFill }]}
              >
                <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                  View Eddy Premium
                </Text>
              </Pressable>
            )}

            {entitlement?.isActive && (
              <Pressable
                onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel="Manage or cancel subscription"
                accessibilityState={{ disabled: busy !== null }}
                style={[styles.primary, { backgroundColor: colors.accentFill }]}
              >
                <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                  Manage or cancel subscription
                </Text>
              </Pressable>
            )}

            <View style={styles.purchaseUtilities}>
              <Pressable
                onPress={handleRestore}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel="Restore purchases"
                accessibilityState={{ disabled: busy !== null, busy: busy === 'restore' }}
                style={({ pressed }) => [styles.utilityAction, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.utilityText, { color: colors.interactive }]}>
                  {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </Pressable>
              {signedIn && (
                <>
                  <View style={[styles.utilityDivider, { backgroundColor: colors.border }]} />
                  <Pressable
                    onPress={() => void handleRedeem()}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    accessibilityLabel="Redeem a code"
                    accessibilityState={{ disabled: busy !== null, busy: busy === 'redeem' }}
                    style={({ pressed }) => [styles.utilityAction, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.utilityText, { color: colors.interactive }]}>
                      {busy === 'redeem' ? 'Checking…' : 'Redeem code'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </Section>

        <Section title="Preferences" muted={colors.textMuted}>
          <View style={[styles.group, { backgroundColor: colors.card }, elevation(1)]}>
            {signedIn ? (
              <>
                {features.push &&
                permission !== 'denied' &&
                permission !== 'unsupported' ? (
                  <NotificationSettingsRow
                    checked={receiving}
                    detail={notificationSummary}
                    disabled={alertsBusy}
                    onToggle={() => void handleAlertToggle(!receiving)}
                  />
                ) : (
                  <SettingsRow
                    icon="notifications-outline"
                    title="Notifications"
                    detail={notificationSummary}
                    onPress={permission === 'denied' ? () => void Linking.openSettings() : undefined}
                    external={permission === 'denied'}
                  />
                )}
                <SettingsRow
                  icon="moon-outline"
                  title="Quiet hours"
                  detail="Choose when notifications stay silent"
                  onPress={() => router.push('/alerts/quiet-hours')}
                />
              </>
            ) : null}
            <SettingsRow
              icon="cloud-offline-outline"
              title="Offline storage"
              detail="River details saved for offline use"
              onPress={() => router.push('/storage')}
              last
            />
          </View>
        </Section>

        <Section title="Help" muted={colors.textMuted}>
          <View style={[styles.group, { backgroundColor: colors.card }, elevation(1)]}>
            <SettingsRow
              icon="chatbubble-ellipses-outline"
              title="Send feedback"
              detail="Report a problem or share an idea"
              onPress={() => setFeedbackOpen(true)}
            />
            <SettingsRow
              icon="mail-outline"
              title="Email support"
              detail={SUPPORT_EMAIL}
              onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              external
            />
            <SettingsRow
              icon="document-text-outline"
              title="Terms of Use"
              onPress={() => void Linking.openURL(TERMS_URL)}
              external
            />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Privacy Policy"
              onPress={() => void Linking.openURL(PRIVACY_URL)}
              external
              last={resolveEnvironment() === 'production'}
            />
            {resolveEnvironment() !== 'production' ? (
              <SettingsRow
                icon="refresh-outline"
                title={firstRunCleared ? 'First run reset' : 'Reset first run'}
                detail={firstRunCleared ? 'Force-quit and reopen Eddy' : 'Show onboarding on next launch'}
                onPress={() => {
                  void resetFirstRun().then(() => setFirstRunCleared(true));
                }}
                last
              />
            ) : null}
          </View>
        </Section>

        {signedIn && (
          <Section title="Account" muted={colors.textMuted}>
            <View style={[styles.group, { backgroundColor: colors.card }, elevation(1)]}>
              <SettingsRow
                icon="log-out-outline"
                title="Sign out"
                onPress={handleSignOut}
                disabled={busy !== null}
              />
              <SettingsRow
                icon="trash-outline"
                title={busy === 'delete' ? 'Deleting…' : 'Delete account'}
                detail="Permanently removes your Eddy account"
                onPress={handleDelete}
                disabled={busy !== null}
                busy={busy === 'delete'}
                destructive
                last
              />
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
          entitlement — but only for as long as waitForEntitlement is willing
          to poll, so serverConfirmed can arrive false with the purchase real.
          That is the confirmPending path: the card says the account is
          catching up rather than re-offering the buy button under an alert
          that just said "you are subscribed". */}
      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={({ serverConfirmed }) => {
          setPaywallOpen(false);
          if (serverConfirmed) {
            void refresh();
          } else {
            beginConfirmPending();
            void settleConfirmPending();
          }
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
      <Text style={[styles.sectionTitle, { color: muted }]}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * The row is the switch.
 *
 * A nested native Switch inside an accessible Pressable is swallowed by that
 * parent on iOS. Giving the row the switch role and drawing the native control
 * through a pointer-events-none wrapper produces one truthful VoiceOver stop
 * and makes the full 58pt row the touch target. This is the same pattern as
 * MapLayersSheet.
 */
function NotificationSettingsRow({
  checked,
  detail,
  disabled,
  onToggle,
}: {
  checked: boolean;
  detail: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityState={{ checked, disabled, busy: disabled }}
        accessibilityLabel="Notifications"
        accessibilityHint={detail}
        style={({ pressed }) => [
          styles.settingsRow,
          { opacity: disabled ? 0.55 : pressed ? 0.62 : 1 },
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.selectionBg }]}>
          <Ionicons
            name={checked ? 'notifications' : 'notifications-outline'}
            size={19}
            color={colors.interactive}
          />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Notifications</Text>
          <Text style={[styles.rowNote, { color: colors.textMuted }]}>{detail}</Text>
        </View>
        <View pointerEvents="none">
          <Switch
            value={checked}
            trackColor={{ false: colors.border, true: colors.interactive }}
            thumbColor={colors.onInteractive}
            ios_backgroundColor={colors.border}
          />
        </View>
      </Pressable>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
    </View>
  );
}

function SettingsRow({
  icon,
  title,
  detail,
  onPress,
  disabled = false,
  busy = false,
  destructive = false,
  external = false,
  last = false,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
  external?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const ink = destructive ? colors.error : colors.interactive;

  return (
    <View>
      <Pressable
        onPress={onPress}
        disabled={!onPress || disabled}
        accessibilityRole={onPress ? (external ? 'link' : 'button') : undefined}
        accessibilityState={onPress ? { disabled, busy } : undefined}
        style={({ pressed }) => [
          styles.settingsRow,
          { opacity: disabled ? 0.55 : pressed ? 0.62 : 1 },
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: destructive ? 'transparent' : colors.selectionBg }]}>
          <Ionicons name={icon} size={19} color={ink} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: destructive ? colors.error : colors.text }]}>
            {title}
          </Text>
          {detail ? <Text style={[styles.rowNote, { color: colors.textMuted }]}>{detail}</Text> : null}
        </View>
        {onPress ? (
          <Ionicons
            name={external ? 'open-outline' : 'chevron-forward'}
            size={external ? 17 : 18}
            color={colors.textSubtle}
          />
        ) : null}
      </Pressable>
      {!last ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  title: { ...t['3xl'], fontFamily: fonts.heading },
  section: { marginTop: 22 },
  sectionTitle: { ...t.sm, fontFamily: fonts.semibold, marginBottom: 8, marginLeft: 2 },
  accountCard: { borderRadius: 14, padding: 16, gap: 14, marginTop: 18 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  premiumCard: { borderRadius: 14, padding: 16, gap: 14 },
  premiumHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...t.base, fontFamily: fonts.semibold },
  rowNote: { ...t.sm, fontFamily: fonts.body },
  appleWrap: { minHeight: 46, justifyContent: 'center' },
  appleButton: { height: 46, width: '100%' },
  primary: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
  purchaseUtilities: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  utilityAction: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  utilityText: { ...t.sm, fontFamily: fonts.medium },
  utilityDivider: { width: StyleSheet.hairlineWidth, height: 20 },
  group: { borderRadius: 14, overflow: 'hidden' },
  settingsRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  pad: { paddingVertical: 8 },
  version: { ...t.xs, fontFamily: fonts.mono, textAlign: 'center', marginTop: 32 },
});
