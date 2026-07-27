// eddy-ios/src/components/ConditionFilterBar.tsx
// Narrow the statewide network to the conditions you care about.
//
// ── Why chips here, when map layers are a sheet ─────────────────────────────
// README.md's chips-vs-sheet ruling sends map LAYERS to a sheet because they
// are additive switches — "also draw this" — and chips imply "narrow to this".
// This control genuinely means narrow to this, so chips are the honest shape.
//
// But it is still the map screen, which wants every pixel, so the strip is not
// permanent: it lives behind a filter button beside the layers button and
// collapses again. That keeps the ruling's real complaint — a permanent band
// eating the one view that needs the room — while using the control whose
// meaning actually matches.
//
// ── Counts, and zeroes ──────────────────────────────────────────────────────
// Every chip carries a live statewide count, and a zero stays visible and
// tappable. FilterChips.tsx puts it well: someone tapping a filter that matches
// nothing should see a zero on the chip, not an unexplained empty map. The
// counts come from summarizeConditionCounts — the canonical calculation — so
// this strip and the Search tab's headline can never disagree.
//
// Each chip wears its own condition colour when active, so the strip doubles as
// the legend for the lines on the map. Same idea as the layers sheet, where a
// row is the colour of the pins it toggles.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CONDITION_ORDER, FLOATABLE_NOW, type ConditionCounts } from '@eddy/conditions';
import { conditionColor, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { FilterChips, type FilterChip } from '@/components/FilterChips';

/** The button that opens the strip. Dotted while a filter is on. */
export function ConditionFilterButton({
  onPress,
  filtering,
}: {
  onPress: () => void;
  filtering: boolean;
}) {
  const { colors, floating } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        floating(),
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Filter rivers by condition"
    >
      <Ionicons name="options-outline" size={19} color={colors.accent} />
      {filtering ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
    </Pressable>
  );
}

interface Props {
  counts: ConditionCounts;
  active: ReadonlySet<string>;
  onToggle: (code: string) => void;
  onSetAll: (codes: string[]) => void;
  onClear: () => void;
}

function ConditionFilterBarComponent({ counts, active, onToggle, onSetAll, onClear }: Props) {
  const { colors } = useTheme();

  const chips: FilterChip[] = CONDITION_ORDER.map((code) => ({
    key: code,
    label: conditionLabel(code),
    count: counts.byCode[code],
    activeColor: conditionColor(code),
  }));

  const filtering = active.size > 0;
  const matching = [...active].reduce(
    (sum, code) => sum + (counts.byCode[code as keyof typeof counts.byCode] ?? 0),
    0,
  );
  // "Show me the floatable ones" is the question behind this control often
  // enough to deserve one tap. FLOATABLE_NOW is flowing+good only — high water
  // is deliberately NOT folded in, because positive copy must never absorb it.
  const floatableCodes = [...FLOATABLE_NOW];
  const floatableOn =
    active.size === floatableCodes.length && floatableCodes.every((c) => active.has(c));

  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.head}>
        <Text style={[styles.heading, { color: colors.textMuted }]}>River conditions</Text>
        <Pressable
          onPress={() => (floatableOn ? onClear() : onSetAll(floatableCodes))}
          accessibilityRole="button"
          accessibilityState={{ selected: floatableOn }}
          accessibilityLabel={
            floatableOn ? 'Clear the floatable filter' : 'Show only floatable rivers'
          }
          style={({ pressed }) => [
            styles.floatablePill,
            {
              backgroundColor: floatableOn ? conditionColor('flowing') : 'transparent',
              borderColor: floatableOn ? conditionColor('flowing') : colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.floatableText,
              // Near-black on the light condition fill. White would be
              // illegible on it — the same rule the condition chips follow.
              { color: floatableOn ? '#1A1814' : colors.textMuted },
            ]}
          >
            {counts.floatableNow}/{counts.total} floatable
          </Text>
        </Pressable>
      </View>

      <FilterChips chips={chips} active={[...active]} onToggle={onToggle} paddingHorizontal={12} />

      {filtering ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear condition filter"
          style={({ pressed }) => [styles.status, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.statusText, { color: colors.text }]}>
            Showing {matching} {matching === 1 ? 'river' : 'rivers'}
          </Text>
          <Text style={[styles.statusText, { color: colors.accent }]}>Clear ×</Text>
        </Pressable>
      ) : (
        <Text style={[styles.hint, { color: colors.textSubtle }]}>
          Tap a condition to dim the rest
        </Text>
      )}
    </View>
  );
}

export const ConditionFilterBar = memo(ConditionFilterBarComponent);

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  heading: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  floatablePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  floatableText: { ...t.xs, fontFamily: fonts.semibold },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  statusText: { ...t.xs, fontFamily: fonts.semibold },
  hint: { ...t.xs, fontFamily: fonts.body, paddingHorizontal: 12, paddingBottom: 10 },
  // No `position` here, unlike MapLayersButton, which pins itself. This one is
  // placed by its host so the two buttons can be stacked without one of them
  // owning a coordinate the other has to work around. 44 is the floor for a
  // touch target and is not negotiable.
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 9, right: 9, width: 7, height: 7, borderRadius: 999 },
});
