// eddy-ios/src/components/RiverVisuals.tsx
// What the river looks like — at a level, not in general.
//
// A reading is a number and a band track is a diagram; neither tells someone who
// has not floated this river what 900 cfs actually looks like from a gravel bar.
// These photos do, and every one of them carries the reading it was taken at, so
// the card is a continuation of the reading card above it rather than a gallery.
//
// ── Which level gets shown ──────────────────────────────────────────────────
// The endpoint's `visuals` array holds only photos matching the river's CURRENT
// band, and it is empty more often than not — the Current River has four
// verified photos and zero in today's band. A card that read only that field
// would be blank on most rivers most days, which is why this falls back through
// `byLevel` to the nearest band instead and SAYS which level it is showing. A
// photo of a different level presented as today's water would be worse than no
// photo at all.
//
// ── It disappears rather than empties ───────────────────────────────────────
// Photos come from verified community submissions, so coverage is thin and
// uneven — three rivers of twenty-four today. There is no empty state, no
// "no photos yet" placeholder and no upload prompt: a card that exists only to
// apologise for itself is worse than a screen that is simply shorter.

import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ConditionCode, RiverVisual, RiverVisualsResponse } from '@eddy/types';
import { CONDITION_ORDER } from '@eddy/conditions';
import { conditionBg, conditionChipBorder, conditionInk, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading } from '@/lib/readingCopy';

/**
 * The band to lead with, and every band that has photos.
 *
 * Today's band wins when it has any. Otherwise the NEAREST one by position on
 * the condition ladder — a river photographed at Good is a far better answer for
 * a Flowing day than one photographed in flood, and CONDITION_ORDER is already
 * the worst-to-best sequence that makes "nearest" meaningful.
 */
function pickLevel(data: RiverVisualsResponse): ConditionCode | null {
  const withPhotos = data.byLevel.filter((g) => g.visuals.length > 0);
  if (withPhotos.length === 0) return null;

  const exact = withPhotos.find((g) => g.code === data.currentCondition);
  if (exact) return exact.code;

  const currentIndex = CONDITION_ORDER.indexOf(data.currentCondition);
  if (currentIndex === -1) return withPhotos[0].code;

  return withPhotos.reduce((best, group) => {
    const distance = (code: ConditionCode) => {
      const i = CONDITION_ORDER.indexOf(code);
      // A band off the ladder (unknown) is a last resort, never a near miss.
      return i === -1 ? Number.MAX_SAFE_INTEGER : Math.abs(i - currentIndex);
    };
    return distance(group.code) < distance(best) ? group.code : best;
  }, withPhotos[0].code);
}

/** The reading a photo was taken at, in the unit it was banded on. */
function visualReading(visual: RiverVisual): string | null {
  if (visual.thresholdUnit === 'cfs') {
    return visual.dischargeCfs != null ? formatReading(visual.dischargeCfs, 'cfs') : null;
  }
  if (visual.thresholdUnit === 'ft') {
    return visual.gaugeHeightFt != null ? formatReading(visual.gaugeHeightFt, 'ft') : null;
  }
  // No declared unit: same rule as everywhere else — prefer stage, never invent
  // a unit for a number that did not declare one.
  if (visual.gaugeHeightFt != null) return formatReading(visual.gaugeHeightFt, 'ft');
  if (visual.dischargeCfs != null) return formatReading(visual.dischargeCfs, 'cfs');
  return null;
}

export function RiverVisuals({ data }: { data: RiverVisualsResponse }) {
  const { colors, elevation } = useTheme();
  const [level, setLevel] = useState<ConditionCode | null>(() => pickLevel(data));

  const bands = data.byLevel.filter((g) => g.visuals.length > 0);
  const active = bands.find((g) => g.code === level) ?? bands[0];
  if (!active) return null;

  const isToday = active.code === data.currentCondition;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]}>What it looks like</Text>
        {/* Never let a photo of another level pass as today's water. */}
        <Text style={[styles.sub, { color: colors.textSubtle }]}>
          {isToday ? 'At today’s level' : `At ${conditionLabel(active.code).toLowerCase()}, not today’s level`}
        </Text>
      </View>

      {/* Only offered when there is something to switch BETWEEN. One band is
          not a choice, and a lone chip reads as a filter that does nothing. */}
      {bands.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.levelScroll}
          contentContainerStyle={styles.levelRow}
        >
          {bands.map((group) => {
            const on = group.code === active.code;
            return (
              <Pressable
                key={group.code}
                onPress={() => setLevel(group.code)}
                style={({ pressed }) => [
                  styles.levelChip,
                  {
                    backgroundColor: on ? conditionBg(group.code) : 'transparent',
                    borderColor: on ? conditionChipBorder(group.code) : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text
                  style={[
                    styles.levelText,
                    { color: on ? conditionInk(group.code) : colors.textMuted },
                  ]}
                >
                  {conditionLabel(group.code)} {group.visuals.length}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.photoRow}
      >
        {active.visuals.map((visual) => {
          const reading = visualReading(visual);
          return (
            <View key={visual.id} style={styles.photo}>
              <Image
                source={{ uri: visual.imageUrl }}
                style={[styles.image, { backgroundColor: colors.cardRaised }]}
                accessibilityLabel={visual.description || 'River photo'}
                resizeMode="cover"
              />
              {reading ? (
                <Text style={[styles.reading, { color: colors.text }]}>{reading}</Text>
              ) : null}
              {visual.accessPointName ? (
                <Text style={[styles.caption, { color: colors.textSubtle }]} numberOfLines={1}>
                  {visual.accessPointName}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingVertical: 14, marginBottom: 18 },
  head: { paddingHorizontal: 14 },
  title: { ...t.lg, fontFamily: fonts.heading },
  sub: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  levelScroll: { flexGrow: 0, flexShrink: 0 },
  levelRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  levelChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  levelText: { ...t.xs, fontFamily: fonts.semibold },
  photoRow: { gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  photo: { width: 220 },
  image: { width: 220, height: 150, borderRadius: 12 },
  reading: { ...t.sm, fontFamily: fonts.mono, marginTop: 7 },
  caption: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
});
