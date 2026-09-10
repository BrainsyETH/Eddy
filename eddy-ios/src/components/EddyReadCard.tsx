import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiverListItem } from '@eddy/types';
import type { EddySays } from '@/lib/eddySays';
import { writtenAge } from '@/lib/eddySays';
import { conditionBg, conditionChipBorder, conditionInk, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  river: RiverListItem;
  says: EddySays;
  onPress: () => void;
  compact?: boolean;
}

/** A free summary card. Its prop type cannot carry the premium full report. */
export function EddyReadCard({ river, says, onPress, compact = false }: Props) {
  const { colors, elevation } = useTheme();
  const code = river.currentCondition?.code ?? 'unknown';
  const age = writtenAge(says.generatedAt);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact ? styles.compact : null,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
        elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Eddy's read for ${river.name}`}
    >
      <View style={styles.head}>
        <View style={styles.nameWrap}>
          <Text style={[styles.kicker, { color: colors.accent }]}>EDDY&apos;S READ</Text>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{river.name}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) }]}>
          <Text style={[styles.pillText, { color: conditionInk(code) }]}>{conditionLabel(code)}</Text>
        </View>
      </View>
      <Text style={[styles.read, { color: colors.textMuted }]} numberOfLines={compact ? 3 : 4}>
        {says.text}
      </Text>
      <View style={styles.foot}>
        {age ? <Text style={[styles.age, { color: colors.textSubtle }]}>{age}</Text> : <View />}
        <Ionicons name="chevron-forward" size={16} color={colors.interactive} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14 },
  compact: { width: 286, marginHorizontal: 0, marginBottom: 0 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nameWrap: { flex: 1, minWidth: 0 },
  kicker: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7 },
  name: { ...t.lg, fontFamily: fonts.heading, marginTop: 2 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
  read: { ...t.sm, fontFamily: fonts.body, lineHeight: 20, marginTop: 9 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  age: { ...t.xs, fontFamily: fonts.body },
});
