// eddy-ios/src/components/PaywallSheet.tsx
// The contextual paywall, shown when a 402 comes back from subscribing.
//
// WHY CONTEXTUAL AND NOT AN ONBOARDING WALL: this appears at the moment someone
// has already asked for the specific thing it sells. The ask lands far better
// after the intent than before it.
//
// What must NEVER appear behind this sheet:
//   • condition colours and readings — always free
//   • hazards — safety data behind a paywall is a liability
//   • ALERTS, all of them — see the header of the alert-subscriptions route
//
// That last line used to read "safety alerts", carving out `warning` while the
// floatability push stayed paid. The carve-out did not survive contact: the only
// route that could create a subscription demanded payment for every kind, so the
// free warning was unreachable, and the app asked for `kind: 'floatable'`, which
// matches no warning anyway. Alerting is free in its entirety now.
//
// So is the offline map download, in the sense that it no longer exists — it
// was removed rather than kept as a thin paid line. That leaves exactly ONE
// entitlement gate in the app: EddyTake, Eddy's written read on a river.
// Commentary, never the water.
//
// EVERY STRING ON THIS SHEET COMES FROM src/lib/premiumCopy.ts. It is not
// centralised for tidiness: the gauge screen carried a second, contradictory
// pitch for months, and neither surface could have caught the other.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { APPLE_SIGN_IN_CANCELLED, useSession } from '@/hooks/useSession';
import { waitForEntitlement } from '@/api/client';
import {
  fetchOfferings,
  identifyUser,
  packageCta,
  PREMIUM_UNAVAILABLE_COPY,
  purchasePackage,
  purchasesUnavailableReason,
  restorePurchases,
  type PurchasePackage,
} from '@/lib/purchases';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import {
  PREMIUM_BENEFITS,
  PREMIUM_FORECAST_CAVEAT,
  PREMIUM_FREE_NOTE,
  PREMIUM_TITLE,
  premiumSubtitle,
} from '@/lib/premiumCopy';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The river that triggered it, so the offer can name what they just asked for. */
  riverName?: string;
  /**
   * Fired once the entitlement is live on the SERVER, not merely bought.
   *
   * The caller's job is to finish what the user originally asked for — they
   * tapped "notify me", hit the wall, and paid; the subscription they wanted
   * still has to be created.
   */
  onPurchased?: () => void;
}

// App Store review requires a subscription screen to link to both the terms
// (EULA) and the privacy policy. These are not optional decoration — a paywall
// without them is a rejection.

export function PaywallSheet({ visible, onClose, riverName, onPurchased }: Props) {
  const { colors, elevation } = useTheme();
  const { session, isAnonymous, getAccessToken, signInWithApple } = useSession();

  const [packages, setPackages] = useState<PurchasePackage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'apple' | 'buy' | 'restore'>(null);

  const userId = session?.user?.id ?? null;
  const signedIn = Boolean(userId) && !isAnonymous;
  const blocked = purchasesUnavailableReason(userId, isAnonymous);

  // Offerings load only once someone is signed in, because that is the earliest
  // point the SDK is configured — see identifyUser. Loading them behind the
  // sign-in step also means the prices shown are the ones this Apple ID will
  // actually be charged.
  useEffect(() => {
    if (!visible || !signedIn || !userId) return;

    let cancelled = false;
    (async () => {
      await identifyUser(userId, isAnonymous);
      const result = await fetchOfferings();
      if (cancelled) return;
      setPackages(result.packages);
      setLoadError(result.status === 'unavailable' ? PREMIUM_UNAVAILABLE_COPY : null);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, signedIn, userId, isAnonymous]);

  const handleSignIn = useCallback(async () => {
    setBusy('apple');
    try {
      await signInWithApple();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed.';
      if (message !== APPLE_SIGN_IN_CANCELLED) Alert.alert('Could not sign in', message);
    } finally {
      setBusy(null);
    }
  }, [signInWithApple]);

  const handleBuy = useCallback(
    async (pkg: PurchasePackage) => {
      setBusy('buy');
      try {
        const outcome = await purchasePackage(pkg);

        // Backing out of Apple's sheet is a decision, not a failure. Say
        // nothing at all and leave the paywall as they left it.
        if (outcome.status === 'cancelled') return;

        if (outcome.status === 'error') {
          Alert.alert('Purchase failed', outcome.message);
          return;
        }

        // StoreKit is done, but the entitlement reaches us through
        // RevenueCat's webhook. Wait for the server before claiming anything.
        const token = await getAccessToken();
        const live = token ? await waitForEntitlement(token) : false;

        if (!live) {
          // Their money moved and Apple has the receipt. The only true
          // statement is that it has not reached us yet, so say that and let
          // them go — never imply the purchase did not happen.
          Alert.alert(
            'Thanks — you are subscribed',
            'It can take a moment to show up. If anything still looks locked in a minute, pull to refresh.',
          );
        }

        onPurchased?.();
        onClose();
      } finally {
        setBusy(null);
      }
    },
    [getAccessToken, onPurchased, onClose],
  );

  const handleRestore = useCallback(async () => {
    setBusy('restore');
    try {
      const result = await restorePurchases();
      if (result.entitled) {
        const token = await getAccessToken();
        if (token) await waitForEntitlement(token);
        onPurchased?.();
        onClose();
        return;
      }
      Alert.alert('Nothing to restore', result.message);
    } finally {
      setBusy(null);
    }
  }, [getAccessToken, onPurchased, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.handleRow}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Otter mood="green" size={120} />

          {/* Every string on this sheet comes from premiumCopy.ts — see its
              header for why, and for the rule that it may name only what is
              actually gated. */}
          <Text style={[styles.title, { color: colors.text }]}>{PREMIUM_TITLE}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {premiumSubtitle(riverName)}
          </Text>

          {PREMIUM_BENEFITS.map((benefit) => (
            <View
              key={benefit.title}
              style={[styles.benefit, { backgroundColor: colors.card }, elevation(1)]}
            >
              <View style={[styles.benefitIcon, { backgroundColor: colors.cardRaised }]}>
                <EddySymbol name={benefit.symbol as EddySymbolName} size={benefit.symbolSize ?? 19} />
              </View>
              <View style={styles.benefitText}>
                <Text style={[styles.benefitTitle, { color: colors.text }]}>{benefit.title}</Text>
                <Text style={[styles.benefitBody, { color: colors.textMuted }]}>{benefit.body}</Text>
              </View>
            </View>
          ))}

          {/* Forecast uncertainty belongs on the screen that takes money for
              the outlook. A general river disclaimer does not say this. */}
          <Text style={[styles.forecastCaveat, { color: colors.error }]}>
            {PREMIUM_FORECAST_CAVEAT}
          </Text>

          <Text style={[styles.freeNote, { color: colors.textSubtle }]}>{PREMIUM_FREE_NOTE}</Text>

          {/* Apple also requires the renewal terms themselves to be visible on
              the purchase screen, not only inside the linked document. */}
          <Text style={[styles.legal, { color: colors.textSubtle }]}>
            Subscriptions renew automatically unless auto-renew is turned off at least 24 hours
            before the period ends. Manage or cancel in your Apple ID settings.
          </Text>

          <View style={styles.legalLinks}>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
              <Text style={[styles.legalLink, { color: colors.textMuted }]}>Terms of Use</Text>
            </Pressable>
            <Text style={[styles.legalLink, { color: colors.textSubtle }]}>·</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
              <Text style={[styles.legalLink, { color: colors.textMuted }]}>Privacy Policy</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {/* SIGN IN FIRST, ALWAYS. A purchase made before there is a permanent
              Supabase user id attaches the entitlement to an anonymous id that
              a reinstall replaces — the buyer then has no route back to what
              they paid for. This ordering is the fix, so the purchase controls
              genuinely do not exist until someone is signed in. */}
          {!signedIn ? (
            <>
              <Text style={[styles.signInNote, { color: colors.textMuted }]}>
                Sign in first so your subscription follows you to a new phone.
              </Text>
              {busy === 'apple' ? (
                <ActivityIndicator color={colors.interactive} style={styles.footerBusy} />
              ) : (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={
                    colors.scheme === 'dark'
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={12}
                  style={styles.appleButton}
                  onPress={handleSignIn}
                />
              )}
            </>
          ) : blocked || loadError ? (
            <View style={[styles.pending, { backgroundColor: colors.cardRaised }]}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.pendingText, { color: colors.textMuted }]}>
                {loadError ?? PREMIUM_UNAVAILABLE_COPY}
              </Text>
            </View>
          ) : packages === null ? (
            <ActivityIndicator color={colors.interactive} style={styles.footerBusy} />
          ) : (
            packages.map((pkg) => (
              <Pressable
                key={pkg.id}
                onPress={() => void handleBuy(pkg)}
                disabled={busy !== null}
                style={({ pressed }) => [
                  pkg.recommended ? styles.primary : styles.secondary,
                  {
                    backgroundColor: pkg.recommended ? colors.accentFill : 'transparent',
                    borderColor: colors.border,
                    opacity: pressed || busy !== null ? 0.6 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    pkg.recommended ? styles.primaryText : styles.secondaryText,
                    { color: pkg.recommended ? colors.onAccent : colors.textMuted },
                  ]}
                >
                  {busy === 'buy' ? 'One moment…' : packageCta(pkg)}
                </Text>
              </Pressable>
            ))
          )}

          {/* Restore has to be reachable from the purchase screen itself, not
              only from Profile — a reviewer looks for it here, and so does
              anyone who already paid and is seeing this wall by mistake. */}
          {signedIn && (
            <Pressable onPress={() => void handleRestore()} disabled={busy !== null} hitSlop={8}>
              <Text style={[styles.restore, { color: colors.textMuted }]}>
                {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.secondaryText, { color: colors.textMuted }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  signInNote: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginBottom: 10 },
  appleButton: { height: 50, alignSelf: 'stretch' },
  footerBusy: { paddingVertical: 16 },
  primary: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
  restore: { ...t.xs, fontFamily: fonts.medium, textAlign: 'center', paddingVertical: 4 },
  handleRow: { alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 14 },
  body: { paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center' },
  title: { ...t['2xl'], fontFamily: fonts.displayBold, marginTop: 8, textAlign: 'center' },
  subtitle: {
    ...t.sm,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    gap: 13,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitText: { flex: 1 },
  benefitTitle: { ...t.sm, fontFamily: fonts.semibold },
  benefitBody: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  forecastCaveat: { ...t.xs, fontFamily: fonts.semibold, alignSelf: 'stretch', marginTop: 14 },
  freeNote: { ...t.xs, fontFamily: fonts.medium, alignSelf: 'stretch', marginTop: 10 },
  legal: { ...t.xs, fontFamily: fonts.body, alignSelf: 'stretch', marginTop: 14 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  legalLink: { ...t.xs, fontFamily: fonts.semibold, textDecorationLine: 'underline' },
  footer: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28, borderTopWidth: 1, gap: 10 },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  pendingText: { ...t.sm, fontFamily: fonts.semibold },
  secondary: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secondaryText: { ...t.sm, fontFamily: fonts.semibold },
});
