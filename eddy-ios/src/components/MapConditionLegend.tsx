// eddy-ios/src/components/MapConditionLegend.tsx
// What the colours on the map mean.
//
// The map is the one screen in the app that is almost entirely colour. A river
// line is drawn in its condition and nothing beside it says which condition
// that is — the ladder is legible on the Today list, on a river screen and in
// an alert, all of which pair the colour with its word, and nowhere on the
// surface where the colour is doing the most work on its own.
//
// The ladder is learnable. Six steps, one hue each, and people do learn it —
// but only from somewhere that shows the pairing, and this screen never did.
//
// ── Why it starts open ──────────────────────────────────────────────────────
//
// A legend collapsed by default is a legend for people who already know what
// the colours mean, which is the group that does not need one. It opens, it is
// small, and one tap closes it for the session.
//
// ── Order ───────────────────────────────────────────────────────────────────
//
// CONDITION_ORDER, unreversed: the canonical worst-to-best legend order from
// the condition system, which runs monotonically from too little water to too
// much. A legend that reorders the ladder to put the good news first is a
// legend that has to be read rather than scanned, because the rows no longer
// correspond to anything physical.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CONDITION_ORDER } from '@eddy/conditions';
import { conditionColor, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function MapConditionLegend() {
  const { colors, floating } = useTheme();
  const [open, setOpen] = useState(true);

  return (
    <View style={[styles.card, floating(), { backgroundColor: colors.card }]}>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        hitSlop={6}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide the condition legend' : 'Show the condition legend'}
      >
        <Text style={[styles.title, { color: colors.textMuted }]}>Conditions</Text>
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-up'}
          size={13}
          color={colors.textMuted}
        />
      </Pressable>

      {open ? (
        <View style={styles.rows}>
          {CONDITION_ORDER.map((code) => (
            <View key={code} style={styles.row}>
              {/* The solid, which is what the map line is painted in. Not the
                  chip fill — a legend has to wear the colour it explains. */}
              <View style={[styles.dot, { backgroundColor: conditionColor(code) }]} />
              <Text style={[styles.label, { color: colors.text }]}>{conditionLabel(code)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Content-sized and left-anchored by its parent row. It must stay narrow:
  // this sits over the map and everything it covers is the thing being
  // explained.
  card: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, alignSelf: 'flex-end' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Uppercase and tracked, the same eyebrow treatment section labels use.
  title: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  rows: { marginTop: 7, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  // 14, not 12 — see the type note in app/(tabs)/index.tsx. This is read
  // outdoors like the rest of the map's chrome.
  label: { ...t.sm, fontFamily: fonts.medium },
});
