import { StyleSheet, Text, View } from 'react-native';
import type { CampingDemand } from '@eddy/conditions/camping-demand';
import { campingPulsePills } from '@/lib/campingDemand';
import { CAMPING_BAND_STYLES } from '@/theme/campingDemand';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';

/** Decorative children of a labeled row/gauge button; the parent announces
 * the complete result, including the meaning of the number and coverage. */
export function CampingDemandPills({ demand, centered = false }: {
  demand: CampingDemand;
  centered?: boolean;
}) {
  const { colors } = useTheme();
  const { status, percent } = campingPulsePills(demand);
  const band = demand.band === null ? null : CAMPING_BAND_STYLES[demand.band];
  return (
    <View
      style={[styles.row, centered && styles.centered]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.pill, { backgroundColor: band?.fill ?? colors.selectionBg }]}>
        <Text style={[textStyles.caption, styles.status, { color: band?.ink ?? colors.textMuted }]}>
          {status}
        </Text>
      </View>
      {percent !== null ? (
        <View style={[styles.pill, { backgroundColor: colors.selectionBg }]}>
          <Text style={[textStyles.caption, styles.percent, { color: colors.text }]}>{percent}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexShrink: 1 },
  centered: { justifyContent: 'center' },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, flexShrink: 1 },
  status: { fontFamily: fonts.semibold, textAlign: 'center' },
  percent: { fontFamily: fonts.monoMedium, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
