import { Pressable, StyleSheet, Text, View } from 'react-native';
import { damBelowTakeOutLabel, type DamBelowTakeOut } from '@eddy/conditions/route-hazards';
import { ControlIcon } from '@/components/ControlIcon';
import { planHazardDestination, type PlanDetailDestination } from '@/lib/planDestinations';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * The low-water dams below a take-out. Each row opens the river's Hazards
 * section, the way an "Along the way" row opens its place — they were the one
 * list in the plan that went nowhere.
 */
export function PlanDownstreamDams({ dams, riverSlug, onOpenDetail }: {
  dams?: DamBelowTakeOut[];
  riverSlug: string;
  onOpenDetail: (destination: PlanDetailDestination) => void;
}) {
  const { colors } = useTheme();
  if (!dams?.length) return null;
  const destination = planHazardDestination(riverSlug);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Below your take-out</Text>
      {dams.map(dam => (
        <Pressable
          key={dam.id}
          disabled={!destination}
          onPress={destination ? () => onOpenDetail(destination) : undefined}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole={destination ? 'button' : undefined}
          accessibilityLabel={`${dam.name}, ${damBelowTakeOutLabel(dam)}`}
          accessibilityHint={destination ? 'Opens the river’s hazards' : undefined}
        >
          <View style={styles.text}>
            <Text style={[styles.name, { color: colors.text }]}>{dam.name}</Text>
            <Text style={[styles.detail, { color: colors.textMuted }]}>{damBelowTakeOutLabel(dam)}</Text>
          </View>
          {destination ? <ControlIcon name="chevron-forward" size={15} color={colors.textSubtle} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, borderRadius: 12, gap: 10 },
  heading: { ...t.lg, fontFamily: fonts.semibold },
  // 44pt: the rows are tap targets now.
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, gap: 2 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  detail: { ...t.sm, fontFamily: fonts.body },
});
