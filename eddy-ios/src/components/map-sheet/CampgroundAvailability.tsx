// eddy-ios/src/components/map-sheet/CampgroundAvailability.tsx
// Where you sleep, given the rank it decides.
//
// ── What was wrong was the RANK, not the facts ────────────────────────────
//
// availability.ts already computed the right things and AvailabilityGlance
// already set the number in Fredoka. But the module sat between an identity row
// and an action row with no surface of its own, so the app's flagship answer to
// "can I stay here on my dates" read as a caption between two other things. A
// campground is the one pin people tap to make a booking decision, and a
// decision needs somewhere to land.
//
// This is that surface: the same numbers, on a card, behind the same drawing the
// pin was wearing when it was tapped.
//
// ── The mark is the one the finger landed on ──────────────────────────────
//
// EddySymbol `campground` is what build-map-icons.py derives the campgrounds
// layer's pin from, so the well here holds the same art at the 300px source
// rather than the 66px map variant. That is PlaceHead's argument one level down,
// and it is why this does not invent a new drawing: the reader tapped a tent and
// gets a tent.
//
// ── The rail is teal and the strip stays hueless ──────────────────────────
//
// Brand here is the TYPEFACE and the ART, never the hue. Coral is Eddy's
// identity colour and it is the one thing that cannot appear on this card: ADR
// 0007 gives fills to teal on native precisely because coral collides with the
// condition ladder, and this card is drawn inches from a ConditionBadge. A warm
// number over a river verdict reads as a warning about the water.
//
// The rail borrows `interactive` — the same teal NightStrip fills its bars with
// — so the card reads as one object with the chart inside it. Everything
// categorical in the strip is still SHAPE, for the reason NightStrip's header
// gives at length.
//
// ── Fixed height on purpose ───────────────────────────────────────────────
//
// This is drawn in the collapsed sheet, inside PeekSlot's reservation. A card
// that were 96pt on one campground and 130pt on the next would move the sheet's
// top edge from pin to pin, which is the defect the slot exists to prevent — so
// the strip is always drawn when there is a card at all, and the caption is one
// line. See peekSlot.ts, AVAILABILITY_SLOT_HEIGHT.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddySymbol } from '@/components/EddySymbol';
import type { CampsiteAvailabilitySummary } from '@eddy/types';
import { availabilityHero, availabilityVoiceOver, nightBars } from './availability';
import { NightStrip, STRIP_HEIGHT_TALL } from './NightStrip';

/** The well the mark stands in. Smaller than PlaceHead's 44 — this is a fact
 *  about the place, not the place's identity, and it must not outrank it. */
const WELL = 32;
const MARK = 22;

export function CampgroundAvailability({
  availability,
  name,
  today,
  onPress,
}: {
  availability: CampsiteAvailabilitySummary | null | undefined;
  name?: string;
  /** `YYYY-MM-DD` in the reader's own day. Passed in so this stays testable. */
  today: string;
  /** Opens the tab where the nights are 44pt chips instead of a chart. */
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  const hero = availabilityHero(availability, name);
  if (!hero) return null;

  const bars = nightBars(availability, today);
  const hasStrip = bars.some((bar) => bar.mark !== 'none');
  const spoken = availabilityVoiceOver(availability, today, name);

  const body = (
    <View style={[styles.card, { backgroundColor: colors.cardRaised }]}>
      {/* A rail rather than a filled card: the art inside is fixed-colour and
          three-tone, and a same-hue fill behind it flattens it. Same reasoning
          as MapLayersSheet's outlined icon wells. */}
      <View style={[styles.rail, { backgroundColor: colors.interactive }]} />

      <View style={styles.inner}>
        <View style={styles.headline}>
          <View style={[styles.well, { backgroundColor: colors.card }]}>
            <EddySymbol name="campground" size={MARK} />
          </View>

          {hero.count !== null ? (
            // allowFontScaling off on the count ALONE, as it was before this
            // card existed: at the largest accessibility size a 30pt numeral
            // grows tall enough to push the action row off the peek, and the
            // words beside it — which DO scale — already carry the meaning.
            <Text style={[styles.count, { color: colors.text }]} allowFontScaling={false}>
              {hero.count}
            </Text>
          ) : null}

          <View style={styles.words}>
            <Text
              style={[hero.count !== null ? styles.label : styles.phrase, { color: colors.text }]}
              numberOfLines={1}
            >
              {hero.headline}
            </Text>
            {hero.detail || hero.caption ? (
              <Text style={[styles.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {[hero.detail, hero.caption].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Nothing measured means nothing to draw. Fourteen empty columns would
            say "we looked and found nothing", which is a different claim. */}
        {hasStrip ? (
          <NightStrip bars={bars} height={STRIP_HEIGHT_TALL} label={spoken} />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      // The card's whole utterance, then what tapping it does. NightStrip's own
      // label is suppressed by this element owning the subtree — one VoiceOver
      // stop for one object, never fourteen columns and a number.
      accessibilityLabel={spoken ?? hero.headline}
      accessibilityHint="Opens campsite availability"
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden' },
  rail: { width: 3 },
  inner: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 8 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  well: {
    width: WELL,
    height: WELL,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { ...t['2xl'], fontFamily: fonts.display },
  words: { flex: 1, minWidth: 0 },
  label: { ...t.sm, fontFamily: fonts.semibold },
  // No count means the headline IS the sentence, so it takes the larger size.
  phrase: { ...t.base, fontFamily: fonts.heading },
  caption: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
});
