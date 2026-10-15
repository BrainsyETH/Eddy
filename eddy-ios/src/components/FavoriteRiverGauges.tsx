import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MapGauge } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import type { FavoriteGaugeReading } from '@/lib/favoriteGaugeReadings';
import { useTheme } from '@/theme/ThemeProvider';
import { conditionChipBorder, conditionInk, conditionOpaqueBg } from '@/theme/conditions';
import { fonts, type as t } from '@/theme/typography';

export function FavoriteRiverGauges({ readings, onOpenGauge }: {
  readings: FavoriteGaugeReading[];
  onOpenGauge: (gauge: MapGauge) => void;
}) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.3;
  return (
    <View style={[styles.list, { backgroundColor: colors.cardRaised }]}>
      {readings.map(({ gauge, place, reading, code, notice, accessibilityLabel }, index) => (
        <Pressable key={gauge.id}
          onPress={gauge.usgsSiteId ? () => onOpenGauge(gauge) : undefined}
          disabled={!gauge.usgsSiteId}
          accessibilityRole={gauge.usgsSiteId ? 'button' : undefined}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={gauge.usgsSiteId ? 'Opens this gauge' : undefined}
          style={({ pressed }) => [styles.row, index > 0 && styles.divider, {
            borderTopColor: colors.border, opacity: pressed ? 0.65 : 1,
          }]}>
          <View style={[styles.content, stacked && styles.stacked]}>
            <View style={[styles.location, stacked && styles.stackedLocation]}>
              <Text style={[styles.place, { color: colors.text }]}>{place}</Text>
              {notice ? <Text style={[styles.notice, { color: colors.textMuted }]}>{notice}</Text> : null}
            </View>
            <View style={[styles.pill, stacked && styles.stackedPill, {
              backgroundColor: conditionOpaqueBg(code), borderColor: conditionChipBorder(code),
            }]}>
              <Text style={[styles.value, { color: conditionInk(code) }]}>{reading}</Text>
            </View>
          </View>
          {gauge.usgsSiteId ? <ControlIcon name="chevron-forward" size={12} color={colors.textSubtle} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 12, marginRight: 8, borderRadius: 10, overflow: 'hidden' },
  row: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  content: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 3 },
  location: { flex: 1, minWidth: 0 },
  stackedLocation: { flexGrow: 0, flexBasis: 'auto' },
  place: { ...t.sm, fontFamily: fonts.medium },
  notice: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  pill: { alignSelf: 'center', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  stackedPill: { alignSelf: 'flex-start' },
  value: { ...t.sm, fontFamily: fonts.mono },
});
