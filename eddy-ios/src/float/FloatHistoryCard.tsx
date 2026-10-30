// eddy-ios/src/float/FloatHistoryCard.tsx
// One completed float in History (docs/float-history-card-plan.md, phase 3).
//
// The river is the card's identity; the otter and its mood are secondary.
// Every word comes from floatHistoryDisplay.ts, which is tested for the states
// a card has to survive: untracked, partly tracked, no put-in, no condition,
// and a reading too old to rate. The condition badge is flat and straight
// here; the tilted stamp belongs to the share image.

import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { FloatMoodOtter } from '@/components/Otter';
import { historyCardModel } from '@/lib/floatHistoryDisplay';
import { conditionBg, conditionChipBorder, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

export function FloatHistoryCard({
  trip,
  onOpen,
  elevation,
}: {
  trip: CompletedFloat;
  onOpen: () => void;
  elevation?: ViewStyle;
}) {
  const { colors, isDark } = useTheme();
  const card = historyCardModel(trip);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.accessibilityLabel}
      accessibilityHint="Opens the recap"
      onPress={onOpen}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }, elevation]}
    >
      <View style={styles.top}>
        <View style={styles.grow}>
          <Text style={[textStyles.cardTitle, { color: colors.text }]}>{card.river}</Text>
          <Text style={[t.base, { color: colors.text }]}>{card.route}</Text>
          {card.startedOnWater ? (
            <Text style={[t.sm, { color: colors.textMuted }]}>Started on the water</Text>
          ) : null}
          {trip.startNote ? (
            <Text numberOfLines={2} style={[t.sm, { color: colors.textMuted }]}>{trip.startNote}</Text>
          ) : null}
        </View>
        <FloatMoodOtter mood={card.mood} size={44} />
      </View>
      {card.moodLine ? (
        <Text style={[t.sm, { fontFamily: fonts.display, color: colors.textMuted }]}>{card.moodLine}</Text>
      ) : null}
      <View style={styles.bottom}>
        <View style={styles.grow}>
          <Text style={[t.sm, { color: colors.textMuted }]}>{card.date}</Text>
          <Text style={[t.sm, { fontFamily: fonts.mono, color: colors.text }]}>{card.stats}</Text>
          {card.trackingNote ? (
            <Text style={[t.xs, { color: colors.textMuted }]}>{card.trackingNote}</Text>
          ) : null}
        </View>
        {card.badge ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: conditionBg(card.badge.code, isDark),
                borderColor: conditionChipBorder(card.badge.code, isDark),
              },
            ]}
          >
            <Text style={[t.xs, { fontFamily: fonts.monoMedium, color: conditionInk(card.badge.code, isDark) }]}>
              {card.badge.text}
            </Text>
          </View>
        ) : null}
        <ControlIcon name="chevron-forward" size={18} color={colors.interactive} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 16, gap: 8 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  // Wraps rather than truncates at the largest text sizes: the stats and the
  // badge drop below one another instead of squeezing the river's name.
  bottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  grow: { flex: 1, minWidth: 160, gap: 2 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});
