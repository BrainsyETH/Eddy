// eddy-ios/src/components/dam/TailwaterStatusRow.tsx
// One quiet row of dam operations, directly under the live status card on a
// hydropower tailwater's river screen. The iOS half of the web component of the
// same name — same shared derivation, same strings, so the two platforms cannot
// describe one dam differently.
//
// ── Why it is subordinate, and stays that way ──────────────────────────────
// The condition chip above is Eddy's verdict about FLOATING, and it remains the
// only coloured judgement on the screen. This row is fact. It borrows nothing
// from the condition palette — no conditionBg, no conditionInk — because a
// second coloured chip under the first reads as a second rating, and a reader
// would then have to decide which to believe.
//
// ── Why the whole row is the target ────────────────────────────────────────
// It replaces the muted "X Dam controls this reach" line that used to sit at
// the very bottom of the screen, below the outfitters. That link was correct
// and unfindable: the controlling fact about the river, filed under trivia. One
// row, near the reading it explains, and one handoff to the dam screen.
//
// No fetch of its own — the dam is already in the screen's state.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import { buildTailwaterStatus } from '@eddy/conditions/tailwater-status';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function TailwaterStatusRow({ dam }: { dam: DamSnapshot | null }) {
  const { colors } = useTheme();
  const router = useRouter();

  if (!dam) return null;
  // Null for a flood-control project with no powerhouse — every sentence this
  // row can produce is about turbines. See buildTailwaterStatus.
  const status = buildTailwaterStatus(dam);
  if (!status) return null;

  return (
    <Pressable
      onPress={() => router.push(`/dam/${status.damId}`)}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
      accessibilityRole="button"
      // The headline names the dam, so it is a sufficient accessible name on
      // its own — no separate "opens the dam page" label to fall out of sync.
      accessibilityLabel={status.headline}
    >
      <Ionicons
        name={status.tone === 'generating' ? 'flash-outline' : 'water-outline'}
        size={16}
        color={colors.interactive}
        style={styles.icon}
      />

      <View style={styles.body}>
        <Text style={[styles.headline, { color: colors.text }]}>{status.headline}</Text>

        {status.supporting.map((line) => (
          <Text key={line} style={[styles.supporting, { color: colors.textMuted }]}>
            {line}
          </Text>
        ))}

        {/* colors.warm, never a condition colour — a rise must not borrow the
            ladder's red, which on this screen means "do not float". */}
        {status.safetyNote ? (
          <Text style={[styles.safety, { color: colors.warm }]}>{status.safetyNote}</Text>
        ) : null}
      </View>

      <Ionicons
        name="chevron-forward"
        size={15}
        color={colors.textSubtle}
        style={styles.icon}
      />
    </Pressable>
  );
}

// Layout only — every colour is applied inline from the theme. No
// marginHorizontal: the ScrollView already pads 16, and a second inset would
// step this row in from the card above it.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, minWidth: 0 },
  headline: { ...t.sm, fontFamily: fonts.semibold },
  supporting: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  safety: { ...t.sm, fontFamily: fonts.medium, marginTop: 4 },
});
