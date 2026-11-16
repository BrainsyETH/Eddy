// eddy-ios/src/components/PremiumLock.tsx
// The locked presentation of an Eddy's Read on a plain card: frosted prose,
// one lock row, and the skeleton that means "still loading" and nothing else.
//
// Shared by the river/gauge card (EddyTake) and the dam card (DamEddyRead) so
// the two cannot drift. They did once: the dam card drew a grey blurred slab
// for BOTH "locked" and "account not settled", plus a padlock in its header
// and a bare "Unlock with Premium" link, while every other Read used frosted
// text and one accent lock row. EddyTake's header explains why a grey band
// reads as a skeleton rather than an offer; that is why the locked state here
// is frosted TEXT and the loading state is the only grey bars.
//
// The photo cards on Today (EddyReadCard) keep their own centred lock badge:
// they sit on a photograph with no room for a row, and their "View full read"
// footer is the action.

import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { PREMIUM_LOCK_TITLE } from '@/lib/premiumCopy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * How hard to frost the paid text.
 *
 * Chosen to leave nothing readable at 14pt, which is the size every blurred
 * line is set in. Erring HIGH is the safe direction — under-blurring hands
 * over the thing being sold, and over-blurring costs nothing but a slightly
 * heavier looking card.
 */
const BLUR_INTENSITY = 34;

/**
 * The text under the blur is also dimmed.
 *
 * Belt and braces. `intensity` is a hint to a native effect, not a guaranteed
 * radius, and it composites differently against a light card than a dark one.
 * Dropping the ink's contrast first means the blur has less to fail at.
 */
const BLURRED_TEXT_OPACITY = 0.5;

/**
 * How soft the corners of a frosted block are.
 *
 * Small on purpose. The wrap clips the PROSE to this shape as well as the frost
 * — see the styles below for why it has to — so the radius is also how much of
 * the paragraph's corners get cut. At 8 against a 20pt line the arc clears the
 * glyph ink. Going much past this starts shaving letters.
 */
const BLUR_RADIUS = 8;

/**
 * Eddy's writing, behind frosted glass.
 *
 * A string renders and a BlurView covers it. UIVisualEffectView blurs what is
 * BEHIND it, so every caller needs a string to render — real text where the
 * payload carries it, a length-only shape where the server withheld it. The
 * blur is presentation; the server decides who receives Premium prose.
 *
 * `blurTop` leaves the top of the block legible (in points) by offsetting the
 * overlay rather than splitting the string, so exactly one line is given away
 * rather than a variable-length first sentence.
 *
 * Hidden from assistive technology outright: a screen reader would hand over
 * text that is deliberately unreadable, and the lock row carries the offer.
 */
export function BlurredProse({
  text,
  color,
  style,
  lines,
  blurTop = 0,
}: {
  text: string;
  color: string;
  style: StyleProp<TextStyle>;
  lines: number;
  blurTop?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.blurWrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        style={[style, { color, opacity: BLURRED_TEXT_OPACITY }]}
        numberOfLines={lines}
        selectable={false}
      >
        {text}
      </Text>
      {/* Tinted to the scheme rather than left on 'default'. The system tint
          adapts to the ambient appearance, not to the card it is sitting on,
          so 'default' frosts LIGHT over a dark card and the blurred block
          glows brighter than the sharp text above it. */}
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={colors.scheme === 'dark' ? 'dark' : 'light'}
        style={[styles.blurOverlay, { top: blurTop }]}
        pointerEvents="none"
      />
    </View>
  );
}

/**
 * The one offer on a locked Read: an accent hairline card, a filled lock mark,
 * and PREMIUM_LOCK_TITLE in the display face. One line of copy and nothing
 * else — premium-copy.test.ts holds it to that.
 */
export function PremiumLockRow({ onPress }: { onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.lock,
        {
          backgroundColor: colors.cardRaised,
          borderColor: colors.accent,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityHint="Opens Premium subscription options"
      accessibilityLabel={PREMIUM_LOCK_TITLE}
    >
      <View style={styles.lockHead}>
        <View style={[styles.lockMark, { backgroundColor: colors.accentFill }]}>
          <Ionicons name="lock-closed" size={13} color={colors.onAccent} />
        </View>
        <Text style={[styles.lockTitle, { color: colors.text }]}>{PREMIUM_LOCK_TITLE}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.accent} />
      </View>
    </Pressable>
  );
}

/**
 * Bars standing in for a Read that is on its way — entitlement still settling,
 * or a member's Read in flight. Never used for the locked state: a grey band
 * is how every app on the phone says "loading", so it cannot also say "pay".
 */
export function ReadSkeleton({ widths = [0.92, 1, 0.84, 0.66], label = "Loading Eddy's Read" }: {
  widths?: number[];
  label?: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {widths.map((width, i) => (
        <View
          key={i}
          style={[styles.skeletonLine, { backgroundColor: colors.cardRaised, width: `${width * 100}%` }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // The blur is absolutely positioned over the prose, so the wrapper is what
  // gives it a box to fill. Overflow hidden keeps the frost inside its block.
  //
  // ── THE RADIUS IS ON BOTH, and that is not belt-and-braces ────────────────
  // Rounding the overlay ALONE would carve four corners out of the frost and
  // leave the prose under them sharp — dimmed, but legible, which is the one
  // thing this component exists to prevent. The wrap's `overflow: 'hidden'` is
  // what clips the text to the same shape. Change one, change both.
  blurWrap: { position: 'relative', overflow: 'hidden', borderRadius: BLUR_RADIUS },
  blurOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: BLUR_RADIUS },
  lock: {
    padding: 13,
    borderRadius: 14,
    // A hairline in the accent rather than a fill in it: the row sits inside a
    // card that is already a panel, and a solid accent block would outweigh
    // the Read above it — which is the thing being sold.
    borderWidth: StyleSheet.hairlineWidth,
    // Follows a blurred block, and needs to read as a separate thing from it.
    marginTop: 16,
  },
  lockHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // A filled circle, so the lock is a mark rather than a loose glyph.
  lockMark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // The display face: this is Eddy making an offer, and that is where the brand lives.
  lockTitle: { ...t.base, fontFamily: fonts.display, flex: 1, minWidth: 0 },
  // Sized to the read it stands in for, so the card does not resize when the
  // real answer lands.
  skeletonLine: { height: 11, borderRadius: 5, marginTop: 9 },
});
