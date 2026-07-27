// eddy-ios/src/components/FilterChips.tsx
// A scrollable row of toggles.
//
// USED BY RIVER REPORTS, where "Floatable" and "High water" are mutually
// exclusive answers to "show me which rivers?". Chips are the right control for
// that: the choices are alternatives, one is always live, and the row reads as a
// single question with several answers.
//
// The Map used to share this in a multi-select mode, and no longer does — map
// layers are independent switches rather than alternatives, and dressing them as
// chips said the wrong thing about them while eating a band of the screen. See
// src/components/MapLayersSheet.tsx. The array-shaped `active` prop is what is
// left of that: single-select callers pass an array of one.
//
// A chip can carry a `count`, which is what makes an empty filter honest: a
// person tapping a filter that matches nothing should see a zero on the chip,
// not an unexplained empty list.

import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export interface FilterChip {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  count?: number;
  /**
   * Overrides the accent when active. The map uses it so a layer's chip is the
   * colour of its own pins — a legend and a control in one object.
   */
  activeColor?: string;
}

interface Props {
  chips: FilterChip[];
  /** Keys currently on. Single-select callers pass an array of one. */
  active: string[];
  onToggle: (key: string) => void;
  /** Horizontal padding for the scroll content, matching the host screen. */
  paddingHorizontal?: number;
}

function FilterChipsComponent({ chips, active, onToggle, paddingHorizontal = 16 }: Props) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexGrow: 0 is load-bearing, not tidiness. A horizontal ScrollView in a
      // column stretches to fill the cross axis by default, which makes every
      // chip as tall as the free space and squeezes whatever sits below it.
      style={styles.scroll}
      contentContainerStyle={[styles.row, { paddingHorizontal }]}
      keyboardShouldPersistTaps="handled"
    >
      {chips.map((chip) => {
        const on = active.includes(chip.key);
        const tint = chip.activeColor ?? colors.accent;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onToggle(chip.key)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? colors.cardRaised : colors.card,
                borderColor: on ? tint : colors.border,
                opacity: pressed ? 0.65 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              chip.count == null ? chip.label : `${chip.label}, ${chip.count}`
            }
          >
            {chip.icon ? (
              <Ionicons name={chip.icon} size={13} color={on ? tint : colors.textMuted} />
            ) : null}
            <Text style={[styles.label, { color: on ? colors.text : colors.textMuted }]}>
              {chip.label}
            </Text>
            {chip.count != null ? (
              <View style={[styles.count, { backgroundColor: on ? tint : colors.border }]}>
                <Text style={[styles.countText, { color: on ? colors.onAccent : colors.textMuted }]}>
                  {chip.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const FilterChips = memo(FilterChipsComponent);

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { ...t.xs, fontFamily: fonts.semibold },
  count: { minWidth: 18, paddingHorizontal: 5, borderRadius: 999, alignItems: 'center' },
  countText: { ...t.xs, fontFamily: fonts.semibold, fontSize: 11 },
});
