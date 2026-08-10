// eddy-ios/src/components/AlertSignInSheet.tsx
// The sheet shown when someone asks for alerts without a permanent account.
//
// ── Why this exists instead of reusing PaywallSheet ──────────────────────
//
// This is the sheet that used to be the paywall. Subscribing was entitlement-
// gated, so every failure on the way to a subscription — no session, a refused
// anonymous sign-in, an expired token — arrived at the same place: an offer to
// sell something. That was wrong even while alerts were paid, because an auth
// outage is our problem and the screen blamed it on not having bought anything.
// Now that alerting is free it would be indefensible, since there is nothing to
// sell at all.
//
// ── Why an account is still required ─────────────────────────────────────
//
// A notification needs somewhere to go. An anonymous Supabase id is replaced on
// reinstall, which would leave the token attached to a user nobody can reach,
// and the RLS policy in migration 00183 enforces a permanent user independently
// of anything the app does. So this is not a tier — it is the address.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { AppleSignInButton } from '@/components/AppleSignInButton';

interface Props {
  visible: boolean;
  /** The river this is about, so the sheet names what they just asked for. */
  riverName?: string;
  /** Fired once a permanent session exists — the caller retries the subscribe. */
  onSignedIn: () => void;
  onDismiss: () => void;
}

export function AlertSignInSheet({ visible, riverName, onSignedIn, onDismiss }: Props) {
  const { colors } = useTheme();
  // The busy/cancel/error handling this sheet used to own now lives in
  // AppleSignInButton — it was about to be written a fourth time. "Not right
  // now" no longer disables while signing in: the button replaces itself with a
  // spinner, so there is nothing to double-tap, and a dismiss during the Apple
  // sheet is a thing somebody is entitled to do.
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.body}>
          <EddyScene name="checkingGauge" size={120} />

          <Text style={[styles.title, { color: colors.text }]}>
            {riverName ? `Sign in to watch the ${riverName}` : 'Sign in to watch this river'}
          </Text>

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Alerts are free. An account is how Eddy knows which phone to send them to.
          </Text>

          <View style={styles.points}>
            <Point
              icon="notifications-outline"
              text="Free — floatable and dangerous alike, on every river you follow."
              colors={colors}
            />
            <Point
              icon="lock-closed-outline"
              text="Apple never shares your email unless you choose to."
              colors={colors}
            />
            <Point
              icon="eye-outline"
              text="The Alerts tab and every condition on this screen stay free without one."
              colors={colors}
            />
          </View>

        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <AppleSignInButton onSignedIn={onSignedIn} />

          <Pressable onPress={onDismiss} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: colors.textMuted }]}>Not right now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Point({
  icon,
  text,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  colors: { textMuted: string; interactive: string };
}) {
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color={colors.interactive} />
      <Text style={[styles.pointText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  title: { ...t['2xl'], fontFamily: fonts.displayBold, marginTop: 10, textAlign: 'center' },
  subtitle: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 10 },
  points: { alignSelf: 'stretch', gap: 14, marginTop: 26 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointText: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  footer: { padding: 20, borderTopWidth: 1, gap: 10 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { ...t.sm, fontFamily: fonts.medium },
});
