// eddy-ios/src/components/PaywallSheet.tsx
// The contextual paywall, shown when a 402 comes back from subscribing.
//
// WHY CONTEXTUAL AND NOT AN ONBOARDING WALL: this appears at the moment someone
// has already chosen a river and asked to be told about it. That is the
// north-star event in the strategy, and the ask lands far better after the
// intent than before it.
//
// What must NEVER appear behind this sheet:
//   • condition colours and readings — always free
//   • hazards — safety data behind a paywall is a liability
//   • safety alerts — the alert engine already makes `warning` free
// The offer below is deliberately about being told FIRST, not about being told
// at all.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The river that triggered it, so the offer can name what they just asked for. */
  riverName?: string;
}

const BENEFITS = [
  {
    icon: 'notifications' as const,
    title: 'Know before you drive',
    body: 'A push the moment a river you follow becomes floatable — not the evening you get home and check.',
  },
  {
    icon: 'water' as const,
    title: 'Every river you follow',
    body: 'Follow as many rivers as you like. Each one watched on its own schedule.',
  },
  {
    icon: 'cloud-offline' as const,
    title: 'Maps that work with no signal',
    body: 'Download a river before you leave and keep the map, access points and hazards on the water.',
  },
];

export function PaywallSheet({ visible, onClose, riverName }: Props) {
  const { colors, elevation } = useTheme();

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

          <Text style={[styles.title, { color: colors.text }]}>Be first to know</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {riverName
              ? `We'll watch the ${riverName} and tell you the moment it's worth the drive.`
              : "We'll watch your rivers and tell you the moment they're worth the drive."}
          </Text>

          {BENEFITS.map((benefit) => (
            <View
              key={benefit.title}
              style={[styles.benefit, { backgroundColor: colors.card }, elevation(1)]}
            >
              <View style={[styles.benefitIcon, { backgroundColor: colors.cardRaised }]}>
                <Ionicons name={benefit.icon} size={19} color={colors.accent} />
              </View>
              <View style={styles.benefitText}>
                <Text style={[styles.benefitTitle, { color: colors.text }]}>{benefit.title}</Text>
                <Text style={[styles.benefitBody, { color: colors.textMuted }]}>{benefit.body}</Text>
              </View>
            </View>
          ))}

          {/* The honesty line. USGS reporting lag plus our cron cadence means an
              alert trails the real river by roughly 20-75 minutes — measured at
              31 on the first live events. Promising "instant" here would be a
              claim we cannot keep, and the refund would cost more than the
              conversion. */}
          <Text style={[styles.honesty, { color: colors.textSubtle }]}>
            Readings come from USGS gauges and can trail the river by up to about an hour. We tell
            you as soon as we see it.
          </Text>

          <Text style={[styles.freeNote, { color: colors.textSubtle }]}>
            River conditions, gauge readings and hazard information are always free.
          </Text>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {/* Purchases cannot be wired until the Apple Developer enrollment
              clears and RevenueCat has products, so this states that plainly
              rather than presenting a button that silently does nothing. */}
          <View style={[styles.pending, { backgroundColor: colors.cardRaised }]}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.pendingText, { color: colors.textMuted }]}>
              Subscriptions aren&apos;t open yet — coming soon.
            </Text>
          </View>

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
  },
  benefitText: { flex: 1 },
  benefitTitle: { ...t.sm, fontFamily: fonts.semibold },
  benefitBody: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  honesty: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: 14 },
  freeNote: { ...t.xs, fontFamily: fonts.medium, textAlign: 'center', marginTop: 10 },
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
