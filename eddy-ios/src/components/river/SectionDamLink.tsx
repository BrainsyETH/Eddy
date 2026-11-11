// eddy-ios/src/components/river/SectionDamLink.tsx
// On a sectioned river, the dam row shown for the section the dam does NOT
// control: "Clearwater Dam · View Lower Black ›", switching the report to
// that section.
//
// The release panel itself stays scoped to the section below the dam
// (sectionShowsDam): Clearwater's outflow says nothing about Lesterville's
// water, and pinning it under the upper reading would qualify the wrong
// number. But before sections, every Black River reader saw the dam; hiding
// it outright left the upper stretch with no path to it at all.
//
// Same hairline-rule idiom as TailwaterStatusRow, so the two rows read as the
// same object in the same slot as the reader switches sections. A `button`,
// not a `link`: it changes this screen in place.

import { Pressable, StyleSheet, Text } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function SectionDamLink({ damName, sectionTitle, onPress }: {
  damName: string;
  sectionTitle: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${damName}. View ${sectionTitle}.`}
      accessibilityHint={`Shows the ${sectionTitle} report.`}
      style={({ pressed }) => [styles.row, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <ControlIcon name="water-outline" size={16} color={colors.interactive} />
      <Text style={[styles.label, { color: colors.interactive }]}>{damName} · View {sectionTitle}</Text>
      <ControlIcon name="chevron-forward" size={15} color={colors.textSubtle} />
    </Pressable>
  );
}

// Layout only — every colour is applied inline from the theme.
const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    marginBottom: 10,
  },
  label: { ...t.sm, fontFamily: fonts.semibold, flex: 1, minWidth: 0 },
});
