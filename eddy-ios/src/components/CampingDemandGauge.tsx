import { StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { type CampingDemand } from '@eddy/conditions/camping-demand';
import { campingPulseHeadline, campingPulseDetail, campingPulseAccessibilityLabel } from '@/lib/campingDemand';
import { CampingDemandMeter } from './CampingDemandMeter';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';

export function CampingDemandGauge({ demand }: { demand: CampingDemand }) {
  const { colors } = useTheme();
  const headline = campingPulseHeadline(demand);
  const detail = campingPulseDetail(demand);
  const checked = demand.checkedDay === 'today'
    ? 'Checked today'
    : demand.checkedDay === 'yesterday'
      ? 'Checked yesterday'
      : demand.checkedDay === 'earlier'
        ? 'Older reading — may be out of date'
        : null;

  return (
    <View
      accessible
      accessibilityLabel={campingPulseAccessibilityLabel(demand, 'Ozarks')}
      style={styles.summary}
    >
      <Text style={[styles.headline, { color: colors.text }]}>{headline}</Text>
      <Text style={[textStyles.caption, { color: colors.textMuted }]}>{detail}</Text>
      {demand.band !== null ? (
        <View style={styles.meter}>
          <CampingDemandMeter demand={demand} ticks />
        </View>
      ) : null}
      {demand.band !== null && demand.checkedDay !== 'today' && checked ? (
        <View style={styles.freshness}>
          {demand.checkedDay === 'earlier' ? (
            <ControlIcon name="alert-circle-outline" size={16} color={colors.text} />
          ) : null}
          <Text style={[textStyles.caption, styles.note, { color: colors.text }]}>{checked}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingVertical: 4 },
  headline: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  meter: { marginTop: 6, marginBottom: 2 },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  note: { flexShrink: 1 },
});
