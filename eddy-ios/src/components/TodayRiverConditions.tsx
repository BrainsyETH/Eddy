import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { RiverListItem } from '@eddy/types';
import type { TodayRiverFilter } from '@/components/TodayHub';
import { formatReading, primaryReading } from '@/lib/readingCopy';
import { conditionBg, conditionColor, conditionLabel } from '@/theme/conditions';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

interface Props {
  rivers: RiverListItem[];
  total: number;
  counts: Record<'floatable' | 'low' | 'high' | 'unknown', number>;
  photos: ReadonlyMap<string, string>;
  onBrowse: (filter: TodayRiverFilter) => void;
  onOpenRiver: (slug: string) => void;
}

/** Compact overview; every count keeps the existing river-list filter shortcut. */
export function TodayRiverConditions({ rivers, total, counts, photos, onBrowse, onOpenRiver }: Props) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.3;
  const summaries = [
    { key: 'floatable', label: 'Floatable', code: 'good', icon: 'water-outline' },
    { key: 'low', label: 'Low', code: 'low', icon: 'arrow-down-outline' },
    { key: 'high', label: 'High', code: 'high', icon: 'arrow-up-outline' },
    { key: 'unknown', label: 'No fresh reading', code: 'unknown', icon: 'time-outline' },
  ] as const;

  return (
    <View>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.text }]}>River Conditions</Text>
        <Pressable
          onPress={() => onBrowse('all')}
          accessibilityRole="button"
          accessibilityLabel={`Browse all ${total} rivers`}
          style={({ pressed }) => [styles.browse, { opacity: pressed ? 0.65 : 1 }]}
        >
          <Text style={[styles.browseText, { color: colors.interactive }]}>All {total}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.interactive} />
        </Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.summary}>
          {summaries.filter(({ key }) => key === 'floatable' || key === 'low' || counts[key] > 0).map(({ key, label, code, icon }) => (
            <Pressable
              key={key}
              onPress={() => onBrowse(key)}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${counts[key]} ${counts[key] === 1 ? 'river' : 'rivers'}`}
              style={({ pressed }) => [styles.count, stacked && styles.countStacked, {
                backgroundColor: counts[key] > 0 ? conditionBg(code) : colors.cardRaised,
                opacity: pressed ? 0.65 : 1,
              }]}
            >
              <Ionicons name={icon} size={17} color={colors.text} />
              <Text style={[styles.countText, { color: colors.text }]}>
                <Text style={styles.countNumber}>{counts[key]}</Text> {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {rivers.map((river) => (
          <CompactRiverRow key={river.id} river={river} photoUrl={photos.get(river.slug)}
            stacked={stacked} onPress={() => onOpenRiver(river.slug)} />
        ))}
      </View>
    </View>
  );
}

function CompactRiverRow({ river, photoUrl, stacked, onPress }: {
  river: RiverListItem;
  photoUrl?: string;
  stacked: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const code = river.currentCondition?.code ?? 'unknown';
  const reading = river.currentCondition ? primaryReading(river.currentCondition) : null;
  const measurement = reading ? formatReading(reading.value, reading.unit) : 'No fresh reading';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.river, { borderTopColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${river.name}, ${conditionLabel(code)}, ${measurement}`}
    >
      <View style={[styles.thumbnail, { backgroundColor: colors.selectionBg }]}
        accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="water-outline" size={22} color={colors.interactive} />
        {photoUrl && failedPhoto !== photoUrl ? (
          <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" recyclingKey={photoUrl}
            accessible={false} accessibilityIgnoresInvertColors onError={() => setFailedPhoto(photoUrl)} />
        ) : null}
      </View>
      <View style={[styles.riverBody, stacked && styles.riverBodyStacked]}>
        <View style={[styles.riverCopy, stacked && styles.riverCopyStacked]}>
          <Text style={[styles.riverName, { color: colors.text }]}>{river.name}</Text>
          <Text style={[styles.riverMeta, { color: colors.textMuted }]}>{measurement}</Text>
        </View>
        <View style={[styles.status, stacked && styles.statusStacked]}>
          <View style={[styles.statusDot, { backgroundColor: conditionColor(code) }]} />
          <Text style={[styles.statusText, { color: colors.text }]}>{conditionLabel(code)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, marginBottom: 8, paddingHorizontal: 2 },
  title: { ...textStyles.sectionTitle, flexShrink: 1 },
  browse: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 },
  browseText: { ...t.sm, fontFamily: fonts.semibold },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, overflow: 'hidden' },
  summary: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: { flexBasis: '45%', flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 44, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  countStacked: { flexBasis: '100%' },
  countText: { ...t.sm, fontFamily: fonts.medium, flexShrink: 1 },
  countNumber: { ...t.lg, fontFamily: fonts.heading },
  river: { minHeight: 74, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumbnail: { width: 44, height: 48, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  riverBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  riverBodyStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 5 },
  riverCopy: { flex: 1, minWidth: 0 },
  riverCopyStacked: { flexGrow: 0, flexBasis: 'auto' },
  riverName: { ...t.sm, fontFamily: fonts.semibold },
  riverMeta: { ...t.xs, fontFamily: fonts.mono, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '40%' },
  statusStacked: { maxWidth: '100%', alignSelf: 'flex-start' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 1 },
});
