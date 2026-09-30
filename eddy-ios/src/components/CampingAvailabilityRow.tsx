import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/typography';
import { checkedLabel, currentNight, dateLabel, nightLine } from '@/lib/campingHeatmap';
import { CampgroundThumbnail } from './CampgroundThumbnail';

export function CampingAvailabilityRow({ row, overview, night, now, onPress }: {
  row: TrackedCampground; overview: CampingOverview; night: string; now: number; onPress: () => void;
}) {
  const { colors } = useTheme();
  const observation = currentNight(row, night, overview.maxObservationAgeSeconds, now);
  const status = nightLine(observation);
  const updated = observation ? checkedLabel(observation.checkedAt, now) : 'Availability needs an update';
  return <Pressable onPress={onPress} accessibilityRole="button"
    accessibilityLabel={`${row.name}. ${dateLabel(night)}. ${status}. ${updated}.${row.firstCome === 'present' ? ' First-come sites also offered.' : ''}`}
    accessibilityHint="Opens individual campsites for this night"
    style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
    <View style={styles.heading}>
      <CampgroundThumbnail url={row.imageUrl} />
      <Text style={[textStyles.cardTitle, { color: colors.text, flex: 1 }]}>{row.name}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} accessible={false} />
    </View>
    <Text style={[textStyles.body, { color: colors.text }]}>{status}</Text>
    <Text style={[textStyles.caption, { color: colors.textMuted }]}>{dateLabel(night)} · {updated}</Text>
    {row.firstCome === 'present' ? <Text style={[textStyles.caption, { color: colors.textMuted }]}>First-come sites also offered.</Text> : null}
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { minHeight: 44, paddingVertical: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
