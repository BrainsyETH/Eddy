import { Pressable, StyleSheet, Text, View } from 'react-native';
import { damBelowTakeOutLabel, hazardAbovePutInLabel, type DamBelowTakeOut, type HazardAbovePutIn } from '@eddy/conditions/route-hazards';
import { ControlIcon } from '@/components/ControlIcon';
import { planHazardDestination, type PlanDetailDestination } from '@/lib/planDestinations';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * Fixed hazards just outside the route: a danger above the put-in (the dam
 * over a tailwater ramp) and the low-water dams below a take-out. Each row
 * opens the river's Hazards section, the way an "Along the way" row opens
 * its place.
 */
export function PlanDownstreamDams({ dams, above, riverSlug, onOpenDetail }: {
  dams?: DamBelowTakeOut[];
  above?: HazardAbovePutIn[];
  riverSlug: string;
  onOpenDetail: (destination: PlanDetailDestination) => void;
}) {
  const { colors } = useTheme();
  const destination = planHazardDestination(riverSlug);
  const group = (heading: string, rows: { id: string; name: string; label: string }[]) => rows.length ? (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]}>{heading}</Text>
      {rows.map(row => (
        <Pressable
          key={row.id}
          disabled={!destination}
          onPress={destination ? () => onOpenDetail(destination) : undefined}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole={destination ? 'button' : undefined}
          accessibilityLabel={`${row.name}, ${row.label}`}
          accessibilityHint={destination ? 'Opens the river’s hazards' : undefined}
        >
          <View style={styles.text}>
            <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
            <Text style={[styles.detail, { color: colors.textMuted }]}>{row.label}</Text>
          </View>
          {destination ? <ControlIcon name="chevron-forward" size={15} color={colors.textSubtle} /> : null}
        </Pressable>
      ))}
    </View>
  ) : null;
  return (
    <>
      {group('Above your put-in', (above ?? []).map(h => ({ id: h.id, name: h.name, label: hazardAbovePutInLabel(h) })))}
      {group('Below your take-out', (dams ?? []).map(d => ({ id: d.id, name: d.name, label: damBelowTakeOutLabel(d) })))}
    </>
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
