// eddy-ios/src/components/dam/DamRow.tsx
// One USACE project in a list.
//
// Leads with generating state rather than a release number, because that is the
// fact a wading angler acts on and the number is context for it. A dam that
// publishes no turbine flow says neither — Kansas City district posts nothing
// to CWMS, and "Not generating" for those would be an observation nobody made.
//
// The state chip takes its colour from `accent`, never conditionColor():
// generating is a fact about machinery, not a verdict about whether a river is
// floatable, and borrowing that palette would make the app appear to have
// issued a call it has not.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function DamRowComponent({ dam, onPress }: { dam: DamSnapshot; onPress: () => void }) {
  const { colors } = useTheme();
  const release = dam.metrics.release;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.cardRaised : colors.card },
      ]}
      accessibilityRole="button"
    >
      <View style={styles.main}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {dam.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {[
            dam.lakeName,
            dam.state,
            dam.tailwaterFishery === 'trout' ? 'trout tailwater' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <View style={styles.right}>
        {dam.generating !== null ? (
          <View style={styles.stateRow}>
            <Ionicons
              name={dam.generating ? 'flash' : 'flash-off-outline'}
              size={13}
              color={dam.generating ? colors.accent : colors.textSubtle}
            />
            <Text
              style={[
                styles.state,
                { color: dam.generating ? colors.accent : colors.textSubtle },
              ]}
            >
              {dam.generating ? 'Generating' : 'Idle'}
            </Text>
          </View>
        ) : null}
        {release ? (
          <Text style={[styles.release, { color: colors.text }]}>
            {Math.round(release.value).toLocaleString()} cfs
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const DamRow = memo(DamRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
  },
  main: { flex: 1, gap: 2 },
  name: { ...t.base, fontFamily: fonts.semibold },
  meta: { ...t.xs },
  right: { alignItems: 'flex-end', gap: 2 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  state: { ...t.xs, fontFamily: fonts.semibold },
  release: { ...t.sm, fontFamily: fonts.heading },
});
