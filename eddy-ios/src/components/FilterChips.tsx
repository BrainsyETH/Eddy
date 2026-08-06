// eddy-ios/src/components/FilterChips.tsx
// A scrollable row of toggles.
//
// USED BY RIVER REPORTS, where "Floatable" and "High water" are mutually
// exclusive answers to "show me which rivers?". Chips are the right control for
// that: the choices are alternatives, one is always live, and the row reads as a
// single question with several answers.
//
// The Map used to share this in a multi-select mode, and no longer does — map
// layers are independent switches rather than alternatives, and dressing them as
// chips said the wrong thing about them while eating a band of the screen. See
// src/components/MapLayersSheet.tsx. The array-shaped `active` prop is what is
// left of that: single-select callers pass an array of one.
//
// A chip can carry a `count`, which is what makes an empty filter honest: a
// person tapping a filter that matches nothing should see a zero on the chip,
// not an unexplained empty list.

import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export interface FilterChip {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /**
   * Eddy's own mark, where an Ionicon cannot say it.
   *
   * `icon` is an Ionicons NAME and so can only ever draw from that set. The
   * Eddy-rated chip is the case that needs more: the distinction it draws is
   * "did Eddy grade this one", and the honest mark for that is Eddy's face —
   * which is a bundled image, not a glyph. See EddySymbol, where the symbol has
   * existed since the icon catalog landed, waiting for this chip.
   *
   * Takes precedence over `icon` when both are set. Unlike `icon` it is NOT
   * recoloured on selection: these are fixed-colour three-tone art, and tinting
   * one would repaint the otter.
   */
  symbol?: EddySymbolName;
  count?: number;
  /**
   * Overrides the interaction tint when active. Flow-band filters use it so
   * each chip remains a legend for the matching map markers.
   */
  activeColor?: string;
}

interface Props {
  chips: FilterChip[];
  /** Keys currently on. Single-select callers pass an array of one. */
  active: string[];
  onToggle: (key: string) => void;
  /** Horizontal padding for the scroll content, matching the host screen. */
  paddingHorizontal?: number;
}

function relativeLuminance(hex: string): number | null {
  const channels = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!channels) return null;
  const [red, green, blue] = channels.slice(1).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function readableInk(background: string, darkInk: string, lightInk: string): string {
  const bg = relativeLuminance(background);
  const dark = relativeLuminance(darkInk);
  const light = relativeLuminance(lightInk);
  if (bg == null || dark == null || light == null) return darkInk;
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return contrast(bg, dark) >= contrast(bg, light) ? darkInk : lightInk;
}

function FilterChipsComponent({ chips, active, onToggle, paddingHorizontal = 16 }: Props) {
  const { colors } = useTheme();

  // ── NO CHIPS IS NO ROW ──────────────────────────────────────────────────
  // The content container carries 10pt of padding top and bottom, so an empty
  // chip list rendered as 20pt of nothing. That is invisible on a screen with
  // room and obvious in a bottom sheet: the Camping tab's "Sites" heading sat
  // above a blank band on every Missouri State Park, because those sites carry
  // no site_type and no type filter could match one.
  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexGrow: 0 is load-bearing, not tidiness. A horizontal ScrollView in a
      // column stretches to fill the cross axis by default, which makes every
      // chip as tall as the free space and squeezes whatever sits below it.
      style={styles.scroll}
      contentContainerStyle={[styles.row, { paddingHorizontal }]}
      keyboardShouldPersistTaps="handled"
    >
      {chips.map((chip) => {
        const on = active.includes(chip.key);
        // A condition chip may supply its canonical status colour. Everything
        // else uses the interaction role — selection is not a primary action.
        const tint = chip.activeColor ?? colors.interactive;
        const countInk = chip.activeColor
          ? readableInk(tint, colors.onAccent, colors.onAnchor)
          : colors.onInteractive;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onToggle(chip.key)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? colors.selectionBg : colors.card,
                borderColor: on ? tint : colors.border,
                opacity: pressed ? 0.65 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              chip.count == null ? chip.label : `${chip.label}, ${chip.count}`
            }
          >
            {chip.symbol ? (
              <EddySymbol name={chip.symbol} size={15} />
            ) : chip.icon ? (
              <Ionicons name={chip.icon} size={13} color={on ? tint : colors.textMuted} />
            ) : null}
            <Text style={[styles.label, { color: on ? colors.selectionText : colors.textMuted }]}>
              {chip.label}
            </Text>
            {chip.count != null ? (
              <View style={[styles.count, { backgroundColor: on ? tint : colors.border }]}>
                <Text
                  style={[
                    styles.countText,
                    {
                      color: on ? countInk : colors.textMuted,
                    },
                  ]}
                >
                  {chip.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const FilterChips = memo(FilterChipsComponent);

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { ...t.xs, fontFamily: fonts.semibold },
  count: { minWidth: 18, paddingHorizontal: 5, borderRadius: 999, alignItems: 'center' },
  countText: { ...t.xs, fontFamily: fonts.semibold, fontSize: 11 },
});
