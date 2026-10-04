import { StyleSheet, Text, View } from 'react-native';
import { damBelowTakeOutLabel, type DamBelowTakeOut } from '@eddy/conditions/route-hazards';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function PlanDownstreamDams({ dams }: { dams?: DamBelowTakeOut[] }) {
  const { colors } = useTheme();
  if (!dams?.length) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Below your take-out</Text>
      {dams.map(dam => (
        <View key={dam.id} style={styles.row}>
          <Text style={[styles.name, { color: colors.text }]}>{dam.name}</Text>
          <Text style={[styles.detail, { color: colors.textMuted }]}>{damBelowTakeOutLabel(dam)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, borderRadius: 12, gap: 10 },
  heading: { ...t.lg, fontFamily: fonts.semibold },
  row: { gap: 2 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  detail: { ...t.sm, fontFamily: fonts.body },
});
