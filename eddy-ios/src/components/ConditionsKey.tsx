// eddy-ios/src/components/ConditionsKey.tsx
// The map's colour key, one tap away, in the thumb's corner.
//
// ── Why it is back ───────────────────────────────────────────────────────────
// The floating legend was removed for covering the water it explained, and its
// job was handed to a sentence behind the ⓘ on the gauges row of the layers
// sheet — two taps deep, on a control most people never open. That left the
// map as the one screen where colour worked alone: seven hues on a 2.5pt line
// over green forest and pale gravel, three of which collapse for a deutan
// reader, with nothing on the surface saying what red meant.
//
// This is not the old card. It is a 44pt pill labelled "Key" in the bottom
// control row beside Locate — one-handed reach, never over the water — and the
// key itself opens above it only when asked, closes on a second tap, and is
// never on by default. It teaches three things the line now carries: the
// colour, the WORD (drawn along the river at street zoom), and the two stroke
// patterns for the ends that matter most — a hatched line for flood, a dotted
// one for too low — which read without any colour at all.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CONDITION_ORDER, CONDITION_SYSTEM, type ConditionCode } from '@eddy/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Best-to-worst for reading: people scan for "can I go" first. */
const ROWS: ConditionCode[] = [...CONDITION_ORDER].reverse();

/** One plain sentence per level, shorter than the canonical description. */
const MEANING: Record<ConditionCode, string> = {
  flowing: 'Ideal water. Everything floats.',
  good: 'Floatable. Some shallow spots.',
  low: 'Floatable, expect scraping.',
  too_low: 'Dragging likely. Wading water.',
  high: 'Fast. Experienced paddlers only.',
  dangerous: 'Do not float.',
  unknown: 'No current rating.',
};

function Swatch({ code }: { code: ConditionCode }) {
  const def = CONDITION_SYSTEM[code];
  // The same two patterns RiverMap draws on the line: dark hatching over
  // flood, light dots over too-low. Approximated here in Views so the key and
  // the line agree in kind.
  return (
    <View style={[styles.swatch, { backgroundColor: def.solid }]}>
      {code === 'dangerous' ? (
        <View style={styles.hatch}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.hatchMark} />
          ))}
        </View>
      ) : null}
      {code === 'too_low' ? (
        <View style={styles.hatch}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ConditionsKey() {
  const { colors, floating } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.column} pointerEvents="box-none">
      {open ? (
        <View
          style={[styles.card, floating(), { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="summary"
          accessibilityLabel="Map key"
        >
          <Text style={[styles.heading, { color: colors.textMuted }]}>What the colours mean</Text>
          {ROWS.map((code) => (
            <View key={code} style={styles.row} accessible accessibilityLabel={`${CONDITION_SYSTEM[code].label}: ${MEANING[code]}`}>
              <Swatch code={code} />
              <Text style={[styles.label, { color: colors.text }]}>{CONDITION_SYSTEM[code].label}</Text>
              <Text style={[styles.meaning, { color: colors.textMuted }]} numberOfLines={2}>
                {MEANING[code]}
              </Text>
            </View>
          ))}
          <View style={styles.row}>
            <Swatch code="unknown" />
            <Text style={[styles.label, { color: colors.text }]}>Grey</Text>
            <Text style={[styles.meaning, { color: colors.textMuted }]}>{MEANING.unknown}</Text>
          </View>
          <Text style={[styles.foot, { color: colors.textSubtle }]}>
            Zoom in and each river is labelled with its word. Tap any pin for the reading.
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [
          styles.button,
          floating(),
          { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide the map key' : 'Show the map key'}
      >
        <Ionicons name={open ? 'close' : 'color-palette-outline'} size={17} color={colors.interactive} />
        <Text style={[styles.buttonText, { color: colors.interactive }]}>Key</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'flex-end', gap: 10 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  buttonText: { ...t.sm, fontFamily: fonts.semibold },
  card: {
    width: 264,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  heading: { ...t.xs, fontFamily: fonts.body, letterSpacing: 0.7, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: {
    width: 28,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  hatch: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  hatchMark: { width: 3, height: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  label: { ...t.sm, fontFamily: fonts.semibold, width: 62 },
  meaning: { ...t.xs, fontFamily: fonts.body, flex: 1 },
  foot: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
});
