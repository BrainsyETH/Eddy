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
// ── ONE HEIGHT, WHATEVER THE DATA SAYS ────────────────────────────────────
//
// This is drawn in the collapsed sheet inside GlanceSlot's reservation, and the
// reservation is made by mounting THIS COMPONENT with placeholder content. That
// only works if the card's height is independent of what it is showing, and the
// first version was not — it had three:
//
//   count + caption            106pt
//   no count + caption         109pt   (`full`, `not_yet_released`)
//   no count, no caption        91pt   (`closed`)
//
// `availabilityHero` returns `count: null` for closed / not-yet-bookable /
// fully-booked, which swapped the headline to a larger style, and `closed`
// returns an empty caption, which removed a line. So the peek moved by a
// different amount for each campground — and a declared constant could not have
// been right for any of them, let alone at an accessibility text size.
//
// Three rules keep it to one height now, and each costs something small:
//
//   - ONE headline style. The no-count phrasing used to be a size larger; the
//     well, the rail and the Fredoka count carry that rank already.
//   - The caption line is ALWAYS rendered, falling back to a space so the line
//     box exists. Do not "tidy" that away.
//   - The strip's vertical space is always reserved. When there are no bars it
//     is left blank rather than drawn as fourteen empty columns, because empty
//     columns make a claim ("we looked and found nothing") that blank space
//     does not. See NightStrip's header.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddySymbol } from '@/components/EddySymbol';
import type { AccessPointGaugeStatus, CampsiteAvailabilitySummary } from '@eddy/types';
import { conditionText } from '@/theme/conditions';
import { formatReading } from '@/lib/readingCopy';
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
  water = null,
  pending = false,
  pendingLabel,
}: {
  availability: CampsiteAvailabilitySummary | null | undefined;
  name?: string;
  /** `YYYY-MM-DD` in the reader's own day. Passed in so this stays testable. */
  today: string;
  /** Opens the tab where the nights are 44pt chips instead of a chart. */
  onPress?: () => void;
  /**
   * The river's reading, worn on the card's corner — PEEK CALLERS ONLY.
   *
   * A campground pin gives the glance's one slot to the fortnight (peekSlot.ts),
   * which used to leave its water reading a swipe away under Overview's Water
   * heading. That heading is gone — the trend and timestamp it added were never
   * populated — so the number rides here instead: the top-right corner of the
   * card, in the condition's own ink with the verdict word under it, so the
   * verdict is text rather than colour alone (NightStrip's rule).
   *
   * It sits INSIDE the headline row and is always shorter than the words beside
   * it, so its arrival — half a second after the card, with the detail response
   * — cannot change the card's height. That is the one-height invariant the
   * header above declares, and it is why this is a corner and not a second row:
   * a second row is the stacked-blocks movement peekSlot.ts exists to prevent.
   *
   * Overview's Campsites mirror passes nothing: on the pins that draw that
   * mirror the peek already shows the reading, and two copies nine points apart
   * is the duplication the mirror rule exists to avoid.
   */
  water?: AccessPointGaugeStatus | null;
  /**
   * Draw the card's SHAPE with nothing in it yet.
   *
   * This is how GlanceSlot reserves height: it mounts the very component that
   * will fill the space, so the reservation is right by construction at any text
   * size instead of being a number somebody worked out once and got wrong. Every
   * element that contributes height is still rendered.
   */
  pending?: boolean;
  /**
   * What the empty card says.
   *
   * Defaults to the waiting copy. The caller overrides it once the request has
   * SETTLED with nothing, because "Checking campsites…" that never resolves is
   * worse than the absence it replaced — most campgrounds are not linked to a
   * booking system Eddy can read, and that is a fact about them rather than a
   * stall.
   */
  pendingLabel?: string;
}) {
  const { colors, isDark } = useTheme();

  const hero = pending ? null : availabilityHero(availability, today, name);
  if (!pending && !hero) return null;

  // The same preference AccessGaugeReading applies: the flow when there is one,
  // the stage when that is all the station measures.
  const waterReading = water
    ? water.cfs != null
      ? formatReading(water.cfs, 'cfs')
      : water.heightFt != null
        ? formatReading(water.heightFt, 'ft')
        : null
    : null;
  // The attribution the corner has no room to draw. The reading is the reach's
  // nearest at-or-upstream gauge, not a sensor at the campground, and the ear
  // gets told so even where the eye is only glancing.
  const waterSpoken =
    water && waterReading
      ? `River ${waterReading}, ${water.label}, at ${water.gaugeName}`
      : null;

  // Works for absent availability too: nightBars returns the fortnight with
  // every mark 'none', which is a bare date ruler — weekday letters and no drawn
  // columns. That is what makes the strip's height right in the pending state
  // and at any text size, where a declared constant could only ever be right at
  // one of them.
  const bars = nightBars(availability, today);
  const spoken = pending ? null : availabilityVoiceOver(availability, today, name);

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

          {hero?.count != null ? (
            // allowFontScaling off on the count ALONE, as it was before this
            // card existed: at the largest accessibility size a 30pt numeral
            // grows tall enough to push the action row off the peek, and the
            // words beside it — which DO scale — already carry the meaning.
            //
            // Its absence cannot change the card's height: the words beside it
            // are two lines and always taller than this one numeral.
            <Text style={[styles.count, { color: colors.text }]} allowFontScaling={false}>
              {hero.count}
            </Text>
          ) : null}

          <View style={styles.words}>
            <Text
              style={[styles.label, { color: pending ? colors.textSubtle : colors.text }]}
              numberOfLines={1}
            >
              {hero ? hero.headline : (pendingLabel ?? 'Checking campsites…')}
            </Text>
            {/* ALWAYS RENDERED — see the header. The space is what keeps the
                line box alive for `closed`, which carries neither a detail nor
                a caption, and without it this card is a line shorter than the
                one the slot reserved for it. */}
            <Text style={[styles.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {(hero ? [hero.detail, hero.caption].filter(Boolean).join(' · ') : '') || ' '}
            </Text>
          </View>

          {/* ── THE RIVER, IN THE CORNER ─────────────────────────────────
              Two lines that mirror the words column beside them — reading in
              the condition's ink, verdict in words underneath — so the state
              is never carried by colour alone. Never taller than that column,
              which is what lets it arrive late without moving the card. */}
          {water && waterReading ? (
            <View style={styles.water}>
              <Text
                style={[styles.waterReading, { color: conditionText(water.level, isDark) }]}
                numberOfLines={1}
              >
                {waterReading}
              </Text>
              <Text style={[styles.waterLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {water.label}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Always drawn, and it does not overclaim when it has nothing: a bar
            with mark 'none' paints no track and no dash, so an unmeasured
            fortnight is weekday letters and empty air. That is different from
            fourteen EMPTY TRACKS, which would say "we looked and every night is
            taken" — see NightStrip, which encodes all four states in shape. */}
        <NightStrip bars={bars} height={STRIP_HEIGHT_TALL} label={spoken} />
      </View>
    </View>
  );

  if (!onPress || pending) return body;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      // The card's whole utterance, then what tapping it does. NightStrip's own
      // label is suppressed by this element owning the subtree — one VoiceOver
      // stop for one object, never fourteen columns and a number. The corner's
      // reading joins it, with the station attribution the eye never gets.
      accessibilityLabel={[spoken ?? hero?.headline, waterSpoken].filter(Boolean).join('. ')}
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
  // ONE headline style for every state — "59 open", "Fully booked" and
  // "Checking campsites…" are all drawn here. There used to be a larger
  // `phrase` variant for the count-less states, which made the card 3pt taller
  // on exactly the campgrounds that have no number, and the slot could not
  // predict which it was about to get.
  label: { ...t.sm, fontFamily: fonts.semibold },
  caption: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  // Right-aligned so the number hangs off the card's edge like a figure in a
  // table, and never wider than it needs — the words column beside it is the
  // one that flexes.
  water: { alignItems: 'flex-end' },
  // The mono face and the sm rank the peek's compact reading uses: the same
  // fact at the same rank, in a different corner.
  waterReading: { ...t.sm, fontFamily: fonts.mono },
  waterLabel: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
});
