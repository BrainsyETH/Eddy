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
// ── Why a divider and not a card ───────────────────────────────────────────
// A hairline rule with no fill. It shipped as a bordered rounded box sitting
// under the live status card, which is also a bordered rounded box; stacked,
// the two read as competing objects rather than as a line qualifying a reading.
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
import {
  buildTailwaterStatus,
  tailwaterStatusVoiceOver,
} from '@eddy/conditions/tailwater-status';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function TailwaterStatusRow({ dam }: { dam: DamSnapshot | null }) {
  const { colors } = useTheme();
  const router = useRouter();

  if (!dam) return null;
  // Null for a flood-control project with no powerhouse — every sentence
  // buildTailwaterStatus can produce is about turbines. But the DAM is still
  // the controlling fact about this river, so the handoff renders anyway,
  // reduced to the one sentence that is true of a project with no powerhouse.
  // When this row replaced the old "controls this reach" link it inherited
  // that link's job, and returning null here walked off with it: the Black —
  // the one ACTIVE dam-controlled river — lost its only path from the river
  // screen to Clearwater's release figure, forecast and alert button.
  //
  // Web needs no equivalent: its river page renders RiverDamPanel separately,
  // so Clearwater keeps its panel there regardless of this row.
  const status = buildTailwaterStatus(dam);
  if (!status) {
    return (
      <Pressable
        onPress={() => router.push(`/dam/${dam.id}`)}
        style={({ pressed }) => [
          styles.row,
          { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${dam.name} controls this reach. Opens ${dam.name} details.`}
      >
        <Ionicons name="water-outline" size={16} color={colors.interactive} style={styles.icon} />
        <View style={styles.body}>
          <Text style={[styles.headline, { color: colors.text }]}>
            {dam.name} controls this reach
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} style={styles.icon} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(`/dam/${status.damId}`)}
      style={({ pressed }) => [
        styles.row,
        { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
      accessibilityRole="button"
      // ── Why the label is composed and not the headline ──────────────────
      // An accessibilityLabel REPLACES the label React Native aggregates from
      // the children. This carried the headline alone, so VoiceOver heard
      // "Bull Shoals Dam is generating" and none of the lines that qualify it —
      // not the generator equivalent, not the movement, not the "may still be
      // moving downstream" correction. A partial label is the single option
      // that drops content silently: DamRow sets none at all so the children
      // are read, and RiverRow / GaugeRow compose every field.
      //
      // Built in shared/ rather than here so the spoken order is testable and
      // the two platforms cannot drift. Web needs no equivalent: its row is an
      // <a> with no aria-label, so the browser already reads all of it.
      //
      // `button`, not `link`: PlanResult states the house rule as "a link, not
      // a button: it LEAVES for the browser". This push stays in the app.
      accessibilityLabel={tailwaterStatusVoiceOver(status)}
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
  // A hairline rule, not a card. It shipped bordered and rounded directly under
  // the status card, which is also bordered and rounded — a second outline on
  // the first, reading as another object competing with the reading rather than
  // as a line qualifying it.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    marginBottom: 10,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, minWidth: 0 },
  headline: { ...t.sm, fontFamily: fonts.semibold },
  supporting: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
});
