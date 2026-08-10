// eddy-ios/src/components/AppleSignInButton.tsx
// Apple's own button, and the four things every caller was reimplementing.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// Three screens had already written the same handler: set busy, call
// signInWithApple, swallow a cancel, surface a real failure, tell the caller.
// The Alerts tab needed a fourth, and a fourth copy of a rule about which errors
// are shown to people is a fourth chance to get that rule wrong. AlertSignInSheet
// had the best version of it, so this is that one, lifted.
//
// ── Apple's control, never a facsimile ───────────────────────────────────────
// AppleAuthenticationButton is a native view. The Human Interface Guidelines
// require the real control — a hand-built black pill with an apple on it is a
// review risk and, more to the point, is not the button people have learnt.
//
// ── A cancel is a decision ───────────────────────────────────────────────────
// Backing out of the Apple sheet raises ERR_REQUEST_CANCELED, which useSession
// turns into APPLE_SIGN_IN_CANCELLED. Showing an error for it tells somebody
// something went wrong when they are the thing that stopped it.
//
// ── What is NOT handled here, and why ────────────────────────────────────────
// `isAvailableAsync()`. Nothing in this app has ever called it and nothing
// should: Expo SDK 57's deployment target is well past iOS 13, so Sign in with
// Apple is present on every device that can run the binary. The gate that IS
// real is `unavailable` — Supabase not configured — which no caller checked
// before this, and which would otherwise show a button whose only outcome is
// "Accounts are unavailable right now."

import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { APPLE_SIGN_IN_CANCELLED, useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function AppleSignInButton({
  onSignedIn,
  cornerRadius = 12,
  height = 50,
  style,
}: {
  /** Fired once a permanent session exists. Callers refresh whatever they hold. */
  onSignedIn: () => void;
  cornerRadius?: number;
  /**
   * The button's height, which is ALSO the spinner's.
   *
   * One number for both because the spinner replaces the button rather than
   * covering it, and a 20pt indicator where a 50pt button was collapses
   * everything below it for the length of the Apple sheet.
   */
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { signInWithApple, unavailable } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithApple();
      onSignedIn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not sign in.';
      if (message !== APPLE_SIGN_IN_CANCELLED) setError(message);
    } finally {
      setBusy(false);
    }
  }, [signInWithApple, onSignedIn]);

  // No accounts, no button. Drawing one whose only possible outcome is an error
  // is worse than the screen's own signed-out copy standing alone.
  if (unavailable) return null;

  return (
    <View style={style}>
      {busy ? (
        // Announced, not silent. A bare ActivityIndicator is invisible to
        // VoiceOver, so the control simply vanished mid-flow with nothing
        // taking its place in the accessibility tree.
        <View
          style={[styles.busy, { height }]}
          accessibilityRole="progressbar"
          accessibilityLabel="Signing in"
          accessibilityState={{ busy: true }}
        >
          <ActivityIndicator color={colors.interactive} />
        </View>
      ) : (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            colors.scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={cornerRadius}
          style={[styles.button, { height }]}
          onPress={() => void handleSignIn()}
        />
      )}

      {/* Inline rather than an Alert. This can appear inside a list's empty
          state, where a modal would cover the thing it is about. */}
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: '100%' },
  busy: { alignItems: 'center', justifyContent: 'center' },
  error: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 10 },
});
