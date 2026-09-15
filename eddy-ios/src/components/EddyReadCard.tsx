import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { RiverListItem } from '@eddy/types';
import type { EddySays } from '@/lib/eddySays';
import { writtenAge } from '@/lib/eddySays';
import { conditionBg, conditionChipBorder, conditionInk, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  river: RiverListItem;
  says: Pick<EddySays, 'generatedAt'>;
  onPress: () => void;
  compact?: boolean;
  standalone?: boolean;
}

const BLUR_INTENSITY = 34;

export function BlurredReadPreview({ lines = 3 }: { lines?: number }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={styles.blurWrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.readShape}>
        {Array.from({ length: lines }, (_, index) => (
          <View
            key={index}
            style={[
              styles.readLine,
              index === lines - 1 ? styles.readLineLast : null,
              { backgroundColor: colors.textMuted },
            ]}
          />
        ))}
      </View>
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blurOverlay}
        pointerEvents="none"
      />
    </View>
  );
}

/** Metadata-only index card. No free summary or premium report is rendered here.
 * The narrowed prop cannot carry prose; the destination owns entitlement checks.
 */
export function EddyReadCard({ river, says, onPress, compact = false, standalone = false }: Props) {
  const { colors, elevation } = useTheme();
  const code = river.currentCondition?.code ?? 'unknown';
  const age = writtenAge(says.generatedAt);
  const action = 'View full read';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact ? styles.compact : null,
        standalone ? styles.standalone : null,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Eddy's read for ${river.name}. ${action}`}
    >
      <View style={styles.head}>
        <View style={styles.nameWrap}>
          <Text style={[styles.kicker, { color: colors.accent }]}>EDDY&apos;S READ</Text>
          <Text style={[styles.name, { color: colors.text }]} >{river.name}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) }]}>
          <Text style={[styles.pillText, { color: conditionInk(code) }]}>{conditionLabel(code)}</Text>
        </View>
      </View>
      <BlurredReadPreview lines={compact ? 3 : 4} />
      <View style={styles.foot}>
        {age ? <Text style={[styles.age, { color: colors.textSubtle }]}>{age}</Text> : <View />}
        <View style={styles.footAction}>
          <Text style={[styles.footActionText, { color: colors.interactive }]}>{action}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.interactive} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14 },
  compact: { width: '100%', minHeight: 190, marginHorizontal: 0, marginBottom: 0 },
  standalone: { width: 'auto', height: 'auto', minHeight: 190, marginHorizontal: 0, marginBottom: 0 },
  head: { flexDirection: 'column', alignItems: 'flex-start', gap: 10 },
  nameWrap: { alignSelf: 'stretch', minWidth: 0 },
  kicker: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7 },
  name: { ...t.lg, fontFamily: fonts.heading, marginTop: 2 },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
  blurWrap: { position: 'relative', overflow: 'hidden', borderRadius: 8, marginTop: 11 },
  readShape: { gap: 7, paddingVertical: 3 },
  readLine: { height: 8, borderRadius: 4, opacity: 0.45 },
  readLineLast: { width: '68%' },
  blurOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto', paddingTop: 10 },
  footAction: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  footActionText: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 1 },
  age: { ...t.xs, fontFamily: fonts.body },
});
