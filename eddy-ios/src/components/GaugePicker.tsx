// eddy-ios/src/components/GaugePicker.tsx
// Which gauge the river screen's reading card is showing.
//
// WHY THIS EXISTS: a river screen used to show exactly one number, from the
// river's primary gauge, with no indication that others existed. The Current
// River has five, and today they do not agree — good at Van Buren, low at
// Montauk, flowing at Akers. Someone floating the upper river was reading a
// verdict about water ninety miles downstream of where they were going, and had
// no way to tell.
//
// ── The primary is still the river's verdict ────────────────────────────────
// Picking a different gauge changes what this SCREEN reads, not what the river
// is rated. The chip on the rivers list, the alerts and the statewide map all
// stay on the primary, because "is the Current floatable" has to have one
// answer and the primary gauge is the editorial choice of which. This is a
// second opinion, offered where a second opinion is useful, and labelled.
//
// What it moves has GROWN, which is why the strip moved above the reading card
// rather than sitting under it: the reading, its scale, the 72-hour weather and
// Eddy's own report are all re-read for the picked station now. A control that
// changes most of a screen should be at the top of it.
//
// Rendered only when there is a choice to make: one gauge, no picker.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MapGauge } from '@eddy/types';
import { EddySymbol } from '@/components/EddySymbol';
import { conditionColor } from '@/theme/conditions';
import { gaugeConditionCode, gaugeLink } from '@/lib/gaugeCondition';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  gauges: MapGauge[];
  /** Grades each gauge against THIS river's ladder — see gaugeLink. */
  riverSlug: string;
  selectedId: string;
  onSelect: (gaugeId: string) => void;
}

/**
 * Gauges are named for where they are ("Current River at Van Buren, MO"), and
 * the river's name is the longest and least useful part of that on its own
 * screen — five chips all starting "Current River" say nothing five times.
 *
 * USGS uses four prepositions between the river and the place; anything else
 * falls through and keeps the full name, which is long but never wrong.
 */
function shortName(name: string, riverName: string | null | undefined): string {
  if (!riverName) return name;
  // Escaped: these come from the database, and a river with a "." or "(" in its
  // name would otherwise build a pattern that matches the wrong thing or throws.
  const escaped = riverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trimmed = name.replace(new RegExp(`^${escaped}\\s+(at|near|below|above)\\s+`, 'i'), '');
  return trimmed || name;
}

export function GaugePicker({ gauges, riverSlug, selectedId, onSelect }: Props) {
  const { colors } = useTheme();
  if (gauges.length < 2) return null;

  const riverName = gaugeLink(gauges[0], riverSlug)?.riverName ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <EddySymbol name="gauge" size={14} />
        <Text style={[styles.label, { color: colors.textSubtle }]}>GAUGES ON THIS RIVER</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {gauges.map((gauge) => {
          const selected = gauge.id === selectedId;
          const code = gaugeConditionCode(gauge, riverSlug);
          const primary = gaugeLink(gauge, riverSlug)?.isPrimary;
          return (
            <Pressable
              key={gauge.id}
              onPress={() => onSelect(gauge.id)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.cardRaised : colors.card,
                  borderColor: selected ? colors.accent : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show the reading from ${gauge.name}`}
            >
              {/* The gauge's own condition, so the choice is informed before it
                  is made — you can see which stretch is running from here. */}
              <View style={[styles.dot, { backgroundColor: conditionColor(code) }]} />
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? colors.text : colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {shortName(gauge.name, riverName)}
              </Text>
              {/* Named, because it is the one the rest of the app agrees with. */}
              {primary ? (
                <Text style={[styles.primaryTag, { color: colors.textSubtle }]}>Rated</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits ABOVE the reading card now rather than inside it, so the margins are
  // the screen's own rather than the card's: 4pt of optical inset to line the
  // eyebrow up with the river name and the card edge below, and a gap under it
  // for the card the whole strip introduces.
  wrap: { marginBottom: 12 },
  // The mark rides with the label rather than above the row, so the eyebrow
  // stays one object and the chips below keep their own left edge.
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  label: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.6 },
  // Horizontal scroll rather than a wrap: a river can have five gauges with
  // long place names, and a wrapping grid would push the reading card itself
  // off the first screen.
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 999 },
  chipText: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 1 },
  primaryTag: { ...t.xs, fontFamily: fonts.body },
});
