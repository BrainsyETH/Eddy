// eddy-ios/src/components/PushPrimer.tsx
// The screen shown BEFORE the iOS notification prompt.
//
// ── Why a primer at all ──────────────────────────────────────────────────
//
// iOS shows its permission dialog once per install. A denial is permanent: the
// app can never ask again, only send someone to Settings, which almost nobody
// does. So the system prompt is a one-shot resource, and asking cold — before
// the person has any reason to want a notification — spends it at the worst
// possible odds.
//
// This sheet buys a second chance that iOS does not offer. Declining HERE
// leaves the real permission untouched, so the app can ask again later, at a
// better moment. Only "Turn on alerts" spends the prompt.
//
// It appears after someone has already asked to be told about a river, which
// is why the copy can be specific about what will arrive rather than making a
// general case for notifications.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';

interface Props {
  visible: boolean;
  /** The river this is about, so the promise is concrete. */
  riverName?: string;
  onAllow: () => void;
  onDismiss: () => void;
}

export function PushPrimer({ visible, riverName, onAllow, onDismiss }: Props) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.body}>
          {/* The scene IS the offer: this sheet says "we'll watch the gauge for
              you", and the green otter it replaced said only "things are fine",
              which is a claim about a river we have not read yet. */}
          <EddyScene name="checkingGauge" size={120} />

          <Text style={[styles.title, { color: colors.text }]}>
            {riverName ? `We'll watch the ${riverName}` : "We'll watch your rivers"}
          </Text>

          {/* "a notification", not "one notification": the subscription is
              standing, not one-shot. And the danger half of this promise is
              only true as of the switch to `kind: 'all'` — it was written
              against a subscription that asked for `floatable` alone, which
              matches no warning event at all. */}
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Turn on alerts and Eddy sends a notification when it becomes floatable — and when it
            turns dangerous.
          </Text>

          <View style={styles.points}>
            <Point
              symbol="alertWatch"
              text="Only when the condition actually changes. Never a daily digest."
              colors={colors}
            />
            <Point
              symbol="water"
              text="Only the rivers you follow, on their own schedule."
              colors={colors}
            />
            <Point
              icon="settings-outline"
              text="Turn them off any time in Profile."
              colors={colors}
            />
          </View>

          {/* The honest caveat, on the screen that makes the promise rather
              than buried in Settings. USGS reporting lag plus our cron cadence
              means an alert trails the river by roughly 20-75 minutes, and
              "instant" is a claim we cannot keep. */}
          <Text style={[styles.honesty, { color: colors.textSubtle }]}>
            Readings come from USGS gauges and can trail the river by up to about an hour.
          </Text>
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={onAllow}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>Turn on alerts</Text>
          </Pressable>

          {/* Deliberately not styled as a dismissal to avoid — declining here
              costs nothing, and pressuring someone into the system prompt is
              how a permanent denial gets made. */}
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
  symbol,
  text,
  colors,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  symbol?: EddySymbolName;
  text: string;
  colors: { textMuted: string; accent: string };
}) {
  return (
    <View style={styles.point}>
      {symbol ? (
        <EddySymbol name={symbol} size={18} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={colors.accent} />
      ) : null}
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
  honesty: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: 24 },
  footer: { padding: 20, borderTopWidth: 1, gap: 10 },
  primary: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { ...t.sm, fontFamily: fonts.medium },
});
