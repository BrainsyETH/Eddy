// eddy-ios/src/components/ConditionCodeChips.tsx
// The conditions an alert option will actually notify about, in their own colours.
//
// A legend, not a control — nothing here is tappable, and the chips exist
// because "Only high and dangerous water" is a sentence you have to translate,
// while a red Flood chip beside an orange High chip is the thing itself. The
// same colours appear on the river screens and on the feed rows, so the answer
// to "which of these will reach me?" is already in the user's eye.
//
// bg + ink, never solid-as-text: the canonical condition system is explicit that
// white text must not go on the light fills, and several solids (lime-500,
// yellow-500) fail 4.5:1 as small text on the warm off-white canvas.

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { conditionBg, conditionChipBorder, conditionChipInk, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function ConditionCodeChipsInner({ codes }: { codes: string[] }) {
  const { isDark } = useTheme();
  if (codes.length === 0) return null;

  return (
    <View style={styles.row}>
      {codes.map((code) => (
        <View
          key={code}
          style={[
            styles.chip,
            { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
          ]}
        >
          <Text style={[styles.text, { color: conditionChipInk(code, isDark) }]}>{conditionLabel(code)}</Text>
        </View>
      ))}
    </View>
  );
}

export const ConditionCodeChips = memo(ConditionCodeChipsInner);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  text: { ...t.xs, fontFamily: fonts.semibold },
});
