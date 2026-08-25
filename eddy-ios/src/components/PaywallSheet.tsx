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
// EDDY'S TAKE IS NOW GATED WHOLE — the written read, the weather paragraph and
// the bottom line together, where the first of the three used to be sold alone.
// The list above is unchanged by that and is what makes it defensible: the
// condition band, the reading, the trend, the hazards, the agency notices, the
// 72-hour strip and every alert are facts about the river and stay free. What
// is sold is Eddy's writing about them. See the header of EddyTake.
//
// AND IT IS NOW THE ONLY GATE. The offline map download was this sheet's other
// trigger; it was removed rather than kept as a thin paid line, because it sold
// basemap tiles while the half that makes a river readable without a signal
// shipped free to everyone. One gate, one thing sold.
//
// EVERY WORD OF THE PITCH COMES FROM src/lib/premiumCopy.ts. It is not
// centralised for tidiness: the gauge screen carried a second, contradictory
// pitch for months, and neither surface could have caught the other. The
// numbers — plan titles, prices, the monthly equivalent, the saving and the
// renewal terms — come from src/lib/purchases.ts instead, because they are
// derived from what the store returned rather than written. Nothing on this
// screen is a string literal in this file except the two link labels and the
// renewal paragraph App Review requires verbatim.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { APPLE_SIGN_IN_CANCELLED, useSession } from '@/hooks/useSession';
import { refreshEntitlement, waitForEntitlement } from '@/api/client';
import {
  fetchOfferings,
  identifyUser,
  OFFER_CODE_REDEEM_URL,
  packageCadence,
  packageCta,
  packagePriceLabel,
  packageTerms,
  PREMIUM_UNAVAILABLE_COPY,
  purchasePackage,
  purchasesUnavailableReason,
  readEntitlementSnapshot,
  redemptionAlert,
  restoreAlert,
  restorePurchases,
  savingsLabel,
  syncRedeemedPurchases,
  type EntitlementSnapshot,
  type PurchasePackage,
} from '@/lib/purchases';
import { report } from '@/lib/monitoring';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import {
  PREMIUM_BENEFITS,
  PREMIUM_FORECAST_CAVEAT,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'apple' | 'buy' | 'restore' | 'redeem'>(null);

  /**
   * Set when "Redeem code" sends someone to the App Store, read when the app
   * foregrounds again. A ref rather than state because nothing renders from
   * it — it exists so the return trip is distinguishable from every other
   * reason the app comes back to the foreground with this sheet open.
   */
  const redeemPending = useRef(false);

  /**
   * The entitlement as it stood before that trip, so the return can tell a
   * redemption from a look-and-back-out. Cleared with the flag above and for
   * the same reason: a stale baseline is worse than none, because a comparison
   * against it would be confidently wrong rather than merely silent.
   */
  const redeemBaseline = useRef<EntitlementSnapshot | null>(null);

  const userId = session?.user?.id ?? null;
  const signedIn = Boolean(userId) && !isAnonymous;
  // Restore and Redeem sit in two columns until the text is large enough that a
  // column would break "Restore purchases" across two lines. See the footer.
  const { fontScale } = useWindowDimensions();
  const sideBySide = fontScale <= 1.3;
  const blocked = purchasesUnavailableReason(userId, isAnonymous);

  // YEARLY IS THE DEFAULT, and it is derived rather than stored so that it is
  // the default *every* time the sheet opens — a visit that ended on Monthly
  // without buying does not decide what the next one is preselecting. Holding
  // only the explicit tap in state and falling back through `recommended` also
  // means the choice never has to be reconciled with a package list that
  // arrives after the sheet does, or with an offering that changed shape
  // between two opens.
  const selected =
    packages?.find((pkg) => pkg.id === selectedId) ??
    packages?.find((pkg) => pkg.recommended) ??
    packages?.[0] ??
    null;

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

  /**
   * Offer codes are redeemed on the App Store's own screen, not in the app —
   * see OFFER_CODE_REDEEM_URL for why the in-app sheet lost. The real work is
   * the effect below, which finishes the story when they come back.
   *
   * The open is awaited. It rejects when nothing on the device can handle an
   * App Store URL — Screen Time or an MDM profile hiding the store, a
   * simulator without it — and fired-and-forgotten it left `redeemPending` set
   * through that failure with no way for anyone to know the tap did nothing.
   */
  const handleRedeem = useCallback(async () => {
    setBusy('redeem');
    try {
      // Before the store opens, not after: RevenueCat observes StoreKit itself
      // and may have refreshed CustomerInfo by the time the app foregrounds.
      redeemBaseline.current = await readEntitlementSnapshot();
      redeemPending.current = true;
      await Linking.openURL(OFFER_CODE_REDEEM_URL);
    } catch (error) {
      redeemPending.current = false;
      redeemBaseline.current = null;
      report(error, { operation: 'offerCode.openRedeemUrl', surface: 'paywall' });
      Alert.alert(
        'Could not open the App Store',
        'Codes are redeemed on the App Store’s own screen. Open the App Store, tap your account picture, and choose “Redeem Gift Card or Code”.',
      );
    } finally {
      // On success the app is already leaving, so nothing is visible between
      // here and the listener below setting it again on the return trip.
      setBusy(null);
    }
  }, []);

  // The return trip from the App Store. Success is a redemption that shows up
  // once the receipt is synced; the far more common return is someone who
  // looked and backed out, which must produce no alert, no error, nothing —
  // the sheet simply still there, as they left it.
  useEffect(() => {
    if (!visible) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !redeemPending.current) return;
      redeemPending.current = false;

      const before = redeemBaseline.current;
      redeemBaseline.current = null;

      void (async () => {
        setBusy('redeem');
        try {
          const result = await syncRedeemedPurchases(before);

          // A sync that FAILED is not a cancellation, and until now it looked
          // like one. Someone who tapped a button deserves to hear that the
          // check did not run; everything else this returns is still silent.
          if (result.status === 'error') {
            const alert = redemptionAlert(result, false);
            if (alert) Alert.alert(alert.title, alert.message);
            return;
          }

          // Entitled is the whole question HERE, deliberately unlike Profile:
          // this sheet's job is to stop walling someone who has Premium, and
          // that is true however they came by it. It has no claim to make
          // about a code, so it needs no proof that one was redeemed.
          if (!result.entitled) return;

          // Same contract as a purchase: StoreKit is done, the server learns
          // through RevenueCat's webhook, so wait for the backend before the
          // caller re-runs whatever hit the paywall.
          const token = await getAccessToken();
          if (token) await waitForEntitlement(token);
          onPurchased?.();
          onClose();
        } finally {
          setBusy(null);
        }
      })();
    });

    return () => subscription.remove();
  }, [visible, getAccessToken, onPurchased, onClose]);

  const handleRestore = useCallback(async () => {
    setBusy('restore');
    try {
      const result = await restorePurchases();
      if (result.entitled) {
        const token = await getAccessToken();
        let serverConfirmed = false;
        if (token) {
          // Reconcile before polling. A restore onto an account that did not
          // buy — anyone who deleted their account and signed in again —
          // reaches the server as a TRANSFER carrying no entitlement state, so
          // there may be no webhook for the poll below to wait for. See
          // refreshEntitlement in src/api/client.ts.
          await refreshEntitlement(token);
          serverConfirmed = await waitForEntitlement(token);
        }

        // The sheet closes either way: the purchase is real, and holding
        // someone on a paywall they have paid past is worse than a card that
        // catches up a moment later. But it must not close SILENTLY when the
        // server has not agreed, or Premium simply stays locked with no
        // explanation — which is exactly what a restore after account deletion
        // used to do.
        if (!serverConfirmed) {
          const alert = restoreAlert(result, false);
          Alert.alert(alert.title, alert.message);
        }
        onPurchased?.();
        onClose();
        return;
      }

      const alert = restoreAlert(result, false);
      Alert.alert(alert.title, alert.message);
    } finally {
      setBusy(null);
    }
  }, [getAccessToken, onPurchased, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      // Fires however the sheet went away — the close button, a swipe down, or
      // a purchase completing — which is what makes the fallback above resolve
      // back to Yearly on the next open. See `selected`. The redeem flag dies
      // with the sheet too, so a closed paywall cannot claim a later
      // foregrounding as its return trip.
      onDismiss={() => {
        setSelectedId(null);
        redeemPending.current = false;
        redeemBaseline.current = null;
      }}
    >
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

          {/* THE FREE NOTE IS GONE, and it is worth saying why rather than
              leaving a gap here for someone to helpfully refill.

              It listed everything a subscription does NOT gate — conditions,
              readings, the trend, hazards, alerts, float plans, and that the
              last ones you saw stay on the phone. Every word was true and the
              instinct was right: a paywall straight about the free half is the
              only kind worth trusting about the paid one.

              But it was a seven-item feature list, in small grey type, on the
              screen where somebody has already decided to look at the price —
              and it spent that moment enumerating reasons not to pay. The honesty
              is not lost: premiumCopy's own rule is still that nothing here may
              name a free capability, premium-copy.test.ts still enforces it, and
              the Terms say what is free at length. This screen sells the report
              and states the renewal terms, which is what it is for. */}

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
            <>
              {/* CHOOSE, THEN BUY — one row per plan and one button, rather
                  than a button per plan.

                  Two plans as two buttons made the yearly one a decision
                  between two prices with nothing to compare them by: $69.99
                  beside $9.99 reads as expensive beside cheap, when it is in
                  fact the cheaper of the two. Rows carry the monthly
                  equivalent and the saving, so the comparison is on the screen
                  instead of in the reader's head — and the one the offer is
                  built around starts selected. */}
              <View style={styles.options}>
                {packages.map((pkg) => {
                  const isSelected = pkg.id === selected?.id;
                  const cadence = packageCadence(pkg);
                  const saving = savingsLabel(pkg);
                  const price = packagePriceLabel(pkg);
                  // "Best value" is a comparison, so it needs something to
                  // compare against. An offering that ships one plan gets the
                  // row without the ribbon rather than a superlative over an
                  // empty field.
                  const showBadge = pkg.recommended && packages.length > 1;

                  return (
                    <View key={pkg.id} style={showBadge ? styles.optionSlot : undefined}>
                      <Pressable
                        onPress={() => setSelectedId(pkg.id)}
                        disabled={busy !== null}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected, disabled: busy !== null }}
                        accessibilityLabel={[pkg.title, price, cadence, saving]
                          .filter(Boolean)
                          .join(', ')}
                        style={({ pressed }) => [
                          styles.option,
                          // The same depth the benefit cards above carry, so a
                          // plan reads as one more Eddy card rather than as a
                          // form control. elevation() sets a 1px border of its
                          // own; the object after it restores the 2px the
                          // selected state needs.
                          elevation(1),
                          {
                            backgroundColor: isSelected ? colors.selectionBg : colors.card,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.accentFill : colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <View style={styles.optionMain}>
                          <View style={styles.optionTitleRow}>
                            <Text
                              style={[
                                styles.optionTitle,
                                { color: isSelected ? colors.selectionText : colors.text },
                              ]}
                            >
                              {pkg.title}
                            </Text>
                            {/* Green rather than the brand coral: coral fails
                                contrast at this size on both selected
                                surfaces, and a saving is good news. */}
                            {saving ? (
                              <Text style={[styles.optionSaving, { color: colors.success }]}>
                                {saving}
                              </Text>
                            ) : null}
                          </View>
                          {cadence ? (
                            <Text style={[styles.optionCadence, { color: colors.textMuted }]}>
                              {cadence}
                            </Text>
                          ) : null}
                        </View>

                        {price ? (
                          <Text
                            style={[
                              styles.optionPrice,
                              { color: isSelected ? colors.selectionText : colors.text },
                            ]}
                          >
                            {price}
                          </Text>
                        ) : null}
                      </Pressable>

                      {/* Sits ON the card's top edge, so it labels the plan
                          rather than floating above the group. Rendered after
                          the row and not inside it so the row's own padding
                          does not have to make space for it.

                          THE ONE BRANDED OBJECT DOWN HERE. A coral sticker in
                          Fredoka with Eddy's face on it — DESIGN.md's own badge
                          and display face, and the mark it uses everywhere the
                          product is speaking as Eddy rather than as an
                          interface. The face is also the honest reading of the
                          claim: "best value" is a recommendation, and this is
                          whose. Everything else in the chooser stays in the
                          app's ordinary selection idiom, because a plan row
                          that behaves differently from every other selectable
                          row in the app is a cost the branding does not pay
                          for. */}
                      {showBadge ? (
                        <View
                          pointerEvents="none"
                          style={[styles.badge, { backgroundColor: colors.emphasisFill }]}
                        >
                          <EddySymbol name="eddyRated" size={13} />
                          <Text style={[styles.badgeText, { color: colors.onEmphasis }]}>
                            BEST VALUE
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {selected ? (
                <>
                  <Pressable
                    onPress={() => void handleBuy(selected)}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.primary,
                      {
                        backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
                        opacity: busy !== null ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                      {busy === 'buy' ? 'One moment…' : packageCta(selected)}
                    </Text>
                  </Pressable>

                  {/* What the button above actually costs. The row states the
                      price; this states the commitment, and for a trial it is
                      the only place that says what happens when it ends. */}
                  <Text style={[styles.terms, { color: colors.textMuted }]}>
                    {packageTerms(selected)}
                  </Text>
                </>
              ) : null}
            </>
          )}

          {/* Restore has to be reachable from the purchase screen itself, not
              only from Profile — a reviewer looks for it here, and so does
              anyone who already paid and is seeing this wall by mistake.

              These are text links rather than the bordered buttons they used to
              be: a full-width outlined button is the shape of the thing being
              offered, and none of these is that. Dismissing also still has the
              close control at the top of the sheet and the swipe.

              TWO COLUMNS, not a separator run. The version that clipped was
              "Restore purchases · Redeem a code · Not now" on ONE line: ~300pt
              against the ~327pt this sheet has on a 375pt phone, and it could
              not wrap, because the "·" separators are siblings of the links and
              a wrap orphans one at the head of the next line. One Dynamic Type
              step past default pushed it out of the sheet.

              Columns fix that at the root. There are no separators to orphan,
              and each column wraps INSIDE itself, so the row grows in height
              rather than running off the edge — which is why footerAction sets
              minHeight and not height. Stacking them was the other way to stop
              the clipping, and it cost the plan chooser two full rows of the
              height it is short of.

              Above fontScale 1.3 they stack anyway. Past that step a column is
              narrow enough that "Restore purchases" breaks to "Restore /
              purchases", and a two-line label beside a one-line one reads as a
              layout accident rather than a pair. This is the only place in the
              app that reads fontScale; it is here because it is the only place
              with two side-by-side labels that must not wrap. */}
          <View style={styles.footerLinks}>
            {signedIn ? (
              <View style={sideBySide ? styles.footerPair : styles.footerStack}>
                <Pressable
                  onPress={() => void handleRestore()}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Restore purchases"
                  accessibilityState={{ disabled: busy !== null, busy: busy === 'restore' }}
                  style={[styles.footerAction, sideBySide ? styles.footerColumn : null]}
                >
                  <Text style={[styles.footerLink, { color: colors.textMuted }]}>
                    {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
                  </Text>
                </Pressable>
                {/* Signed-in only, like every purchase control on this sheet
                    and for the same reason: the entitlement a code grants
                    arrives through the receipt, and it has to land on a real
                    account the moment it does. */}
                <Pressable
                  onPress={() => void handleRedeem()}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Redeem a code"
                  accessibilityState={{ disabled: busy !== null, busy: busy === 'redeem' }}
                  style={[styles.footerAction, sideBySide ? styles.footerColumn : null]}
                >
                  <Text style={[styles.footerLink, { color: colors.textMuted }]}>
                    {busy === 'redeem' ? 'Checking…' : 'Redeem a code'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              style={styles.footerAction}
            >
              <Text style={[styles.footerLink, { color: colors.textMuted }]}>Not now</Text>
            </Pressable>
          </View>
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
  terms: { ...t.xs, fontFamily: fonts.body, textAlign: 'center' },
  footerLinks: { alignSelf: 'stretch', alignItems: 'stretch' },
  // 44pt is Apple's minimum touch target, and it is the row's own height here
  // rather than hitSlop: stacked links with overlapping slop have an ambiguous
  // boundary, and the one resolved by render order is not the one anyone aims
  // at. minHeight, not height, so the row grows with the text instead of
  // clipping it.
  footerPair: { flexDirection: 'row', alignSelf: 'stretch' },
  footerStack: { alignSelf: 'stretch', alignItems: 'stretch' },
  // minWidth 0 is what lets the label wrap inside its own half instead of
  // forcing the row wider than the sheet.
  footerColumn: { flex: 1, minWidth: 0 },
  footerAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  footerLink: { ...t.sm, fontFamily: fonts.medium, textAlign: 'center' },

  // ── The plan chooser ──────────────────────────────────────────────────────
  options: { alignSelf: 'stretch', gap: 10 },
  // Room above the recommended row for the badge that overhangs it. Only that
  // row gets it, so an offering without one loses the gap too.
  optionSlot: { paddingTop: 9 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    // The same width whether or not it is selected — a border that thickens on
    // selection reflows both rows under the thumb that just tapped one.
    borderWidth: 2,
  },
  optionMain: { flex: 1 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { ...t.base, fontFamily: fonts.semibold },
  optionSaving: { ...t.xs, fontFamily: fonts.semibold },
  optionCadence: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  optionPrice: { ...t.base, fontFamily: fonts.semibold },
  badge: {
    position: 'absolute',
    top: 0,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 7,
    paddingRight: 10,
    paddingVertical: 3,
    // DESIGN.md §4: standard badges are pills, condition badges are not. This
    // is a standard badge.
    borderRadius: 999,
  },
  // Below the type scale on purpose: it is a label on an object, not a line of
  // copy, and tracking it out is what keeps it legible that small. Fredoka
  // because DESIGN.md gives the display face to the brand name and mascot
  // callouts, and a sticker with the otter on it is the second of those.
  badgeText: { fontSize: 10, lineHeight: 14, letterSpacing: 0.8, fontFamily: fonts.display },
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
});
