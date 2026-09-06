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

import { memo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { haptics } from '@/theme/haptics';
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
   * What VoiceOver says, instead of the `label, count` this builds by default.
   *
   * For a chip whose count does not carry its own meaning. The Camping tab's
   * night chips are the case: three different facts arrive here as the number
   * zero — every site taken, the campground shut for the season, next season
   * not yet released — and "Sat Aug 8, 0" announces all three identically while
   * telling a listener to keep refreshing for a cancellation that is not
   * coming. See nightPhrase.
   */
  accessibilityLabel?: string;
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
  /**
   * Bring the active chip into view when the row first lays out.
   *
   * ── OPT-IN, BECAUSE MOST CALLERS DO NOT NEED IT ─────────────────────────
   * A filter row usually opens on its first chip, which is already on screen.
   * The Camping tab does not: its night selector opens on the weekend the
   * availability window describes, which is several chips along a fourteen-wide
   * scroller, so the one highlighted chip started off the right-hand edge. What
   * the reader met was a list of sites for a day they could not identify and a
   * row of chips none of which looked chosen.
   *
   * ── ON LAYOUT ONLY, NEVER ON SELECTION ──────────────────────────────────
   * A tap is not a reason to scroll: the chip a finger just landed on is by
   * definition already visible, and yanking it to the left edge under the
   * thumb would be the row moving for no reason the reader can name. So this
   * fires from the chip's own onLayout and at most once per key — which a tap
   * does not trigger, because selection changes colour and not size.
   */
  scrollToActive?: boolean;
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

function FilterChipsComponent({
  chips,
  active,
  onToggle,
  paddingHorizontal = 16,
  scrollToActive = false,
}: Props) {
  const { colors } = useTheme();
  const scroller = useRef<ScrollView>(null);
  /** The last key scrolled to, so one selection is revealed at most once. */
  const revealed = useRef<string | null>(null);
  // Single-select callers pass an array of one; a multi-select row has no one
  // chip to reveal and this is a no-op for them beyond the first.
  const activeKey = active[0] ?? null;

  // ── NO CHIPS IS NO ROW ──────────────────────────────────────────────────
  // The content container carries 10pt of padding top and bottom, so an empty
  // chip list rendered as 20pt of nothing. That is invisible on a screen with
  // room and obvious in a bottom sheet: the Camping tab's "Sites" heading sat
  // above a blank band on every Missouri State Park, because those sites carry
  // no site_type and no type filter could match one.
  if (chips.length === 0) return null;

  return (
    <ScrollView
      ref={scroller}
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
            onPress={() => {
              haptics.selection();
              onToggle(chip.key);
            }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? colors.selectionBg : colors.card,
                borderColor: on ? tint : colors.border,
                opacity: pressed ? 0.65 : 1,
              },
            ]}
            onLayout={
              scrollToActive
                ? (event) => {
                    if (chip.key !== activeKey || revealed.current === chip.key) return;
                    revealed.current = chip.key;
                    // Left edge of the chip, less the row's own inset, so the
                    // selection lands where the first chip would sit rather
                    // than flush against the bezel. Not animated: this is the
                    // row arriving at its correct position, not a movement the
                    // reader should watch.
                    scroller.current?.scrollTo({
                      x: Math.max(0, event.nativeEvent.layout.x - paddingHorizontal),
                      animated: false,
                    });
                  }
                : undefined
            }
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              chip.accessibilityLabel ??
              (chip.count == null ? chip.label : `${chip.label}, ${chip.count}`)
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
  // ── THE ROW'S PADDING PAID FOR THE CHIP'S TARGET ────────────────────────
  // This was 10, around a chip that measured about 31pt — 7pt of padding above
  // and below a 17pt line box, with no minHeight. So the ROW was 51pt tall and
  // the thing a finger had to hit was 31, well under the 44pt floor DESIGN.md
  // §6 sets. `nightChoices` even documents these as "a real 44pt row", which
  // was measuring this padding rather than the target inside it — and the same
  // sentence is the reason the night strip is not allowed to be a control at
  // 24pt. Two of those three numbers were closer together than the argument.
  //
  // Moving 6pt from here into the chip buys the floor for one point of total
  // height: 31 + 20 becomes 44 + 8.
  row: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { ...t.xs, fontFamily: fonts.semibold },
  count: { minWidth: 18, paddingHorizontal: 5, borderRadius: 999, alignItems: 'center' },
  countText: { ...t.xs, fontFamily: fonts.semibold, fontSize: 11 },
});
