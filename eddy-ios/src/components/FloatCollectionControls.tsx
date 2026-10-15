import { StyleSheet, Text, View } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { ControlIcon } from './ControlIcon';
import { floatRiverChoices, type RiverEntry } from '@/lib/floatCollection';
import { useTheme } from '@/theme/ThemeProvider';
import { type as t } from '@/theme/typography';

export function FloatCollectionControls({
  items,
  river,
  onRiver,
  sort,
  onSort,
  defaultOrder = 'Most recent',
}: {
  items: readonly RiverEntry[];
  river: string;
  onRiver: (value: string) => void;
  sort: 'default' | 'river';
  onSort: (value: 'default' | 'river') => void;
  defaultOrder?: string;
}) {
  const { colors, isDark } = useTheme();
  const rivers = floatRiverChoices(items);
  const riverLabel = rivers.find((item) => item.riverSlug === river)?.riverName ?? 'All Rivers';
  return (
    <View style={styles.row}>
      <MenuView
        style={{ maxWidth: '100%', flexShrink: 1 }}
        themeVariant={isDark ? 'dark' : 'light'}
        shouldOpenOnLongPress={false}
        title="Filter by river"
        actions={[
          { id: '__all', title: 'All Rivers', state: river ? ('off' as const) : ('on' as const) },
          ...rivers.map((item) => ({
            id: item.riverSlug,
            title: item.riverName,
            state: river === item.riverSlug ? ('on' as const) : ('off' as const),
          })),
        ]}
        onPressAction={({ nativeEvent }) => onRiver(nativeEvent.event === '__all' ? '' : nativeEvent.event)}
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Filter by river, ${riverLabel}`}
          style={[styles.control, { backgroundColor: colors.cardRaised }]}
        >
          <Text style={[t.sm, styles.text, { color: colors.interactive }]}>{riverLabel}</Text>
          <ControlIcon name="chevron-down" size={14} color={colors.interactive} />
        </View>
      </MenuView>
      <MenuView
        style={{ maxWidth: '100%', flexShrink: 1 }}
        themeVariant={isDark ? 'dark' : 'light'}
        shouldOpenOnLongPress={false}
        title="Sort floats"
        actions={[
          { id: 'default', title: defaultOrder, state: sort === 'default' ? 'on' : 'off' },
          { id: 'river', title: 'River A–Z', state: sort === 'river' ? 'on' : 'off' },
        ]}
        onPressAction={({ nativeEvent }) => onSort(nativeEvent.event === 'river' ? 'river' : 'default')}
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Sort, ${sort === 'river' ? 'River A to Z' : defaultOrder}`}
          style={[styles.control, { backgroundColor: colors.cardRaised }]}
        >
          <Text style={[t.sm, styles.text, { color: colors.interactive }]}>
            {sort === 'river' ? 'River A–Z' : defaultOrder}
          </Text>
          <ControlIcon name="chevron-down" size={14} color={colors.interactive} />
        </View>
      </MenuView>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 12 },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  text: { flexShrink: 1 },
});
