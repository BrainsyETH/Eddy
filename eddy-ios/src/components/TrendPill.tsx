// eddy-ios/src/components/TrendPill.tsx
//
// Which way the river is going, and how fast — "Rising fast", "Holding steady".
//
// ── ONE GLYPH TABLE, NOT FOUR ─────────────────────────────────────────────
// TREND_ICON was declared identically in four files: the Today rows, the
// Favorites cards, the river screen and the access screen. Four copies of a
// three-entry map is the cheap kind of duplication right up until one of them
// gains a direction and the others do not, and the arrow is the only part of
// this that is genuinely shared by all four — the enclosure is not.
//
// ── RISING IS NEVER GREEN ─────────────────────────────────────────────────
// Every direction renders in muted ink and colour never encodes direction. On a
// river approaching flood "rising fast" is the opposite of good news, and the
// condition chip beside this already carries the verdict; a green arrow next to
// an orange chip asks the reader to average two claims that are not the same
// kind of claim. This is where the app deliberately parts company with the
// website (which tints rising orange) and with shared/trend-meta.ts (which
// paints it green for reels). Do not reach for trendMeta() from here.
//
// ── WHY THE PILL IS OPTIONAL ──────────────────────────────────────────────
// Enclosed, this sits at the head of a card beside the condition chip, where
// two adjacent facts with only one of them enclosed reads as an accident. Bare,
// it sits inside a line of small print on a list row, where a pill would be
// louder than the reading it qualifies. Both are correct in their place, which
// is why the caller says which it wants rather than the component guessing.

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** The arrow for each direction. Steady is a dash, not a flat arrow. */
export const TREND_ICON = {
  rising: 'arrow-up' as const,
  falling: 'arrow-down' as const,
  steady: 'remove' as const,
};

export type TrendDirection = keyof typeof TREND_ICON;

export function TrendPill({
  direction,
  label,
  size = 13,
  enclosed = true,
}: {
  direction: TrendDirection;
  /** Omitted renders the arrow alone — the access screen's existing shape. */
  label?: string | null;
  size?: number;
  /** The cardRaised pill. False is the bare glyph+text for a list row. */
  enclosed?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.row,
        // Applied inline, never inside StyleSheet.create — app-theme.test.ts
        // fails any colour written into a stylesheet, because a colour frozen
        // at module scope cannot follow the theme.
        enclosed ? [styles.enclosed, { backgroundColor: colors.cardRaised }] : null,
      ]}
    >
      <Ionicons name={TREND_ICON[direction]} size={size} color={colors.textMuted} />
      {label ? (
        <Text style={[styles.text, { color: colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // Lifted from the river screen's styles.trend, which is where the enclosed
  // form was worked out. flexShrink 0 so a long station name beside it takes
  // the squeeze instead of the pill clipping its own label.
  enclosed: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  text: { ...t.xs, fontFamily: fonts.semibold },
});
