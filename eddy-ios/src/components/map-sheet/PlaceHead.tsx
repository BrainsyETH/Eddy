// eddy-ios/src/components/map-sheet/PlaceHead.tsx
// WHO the sheet is about — one component, both peeks.
//
// ── Why this is shared rather than written twice ──────────────────────────
// An access point shows PinCallout until its detail request qualifies a second
// tab, and PinSheetHeader afterwards (see PinSheet's `activeTabs.length <= 1`
// guard). That is a swap of the whole peek body, half a second after the sheet
// opened, on the SAME place. The two used to disagree about it: a 64pt photo
// became a 44pt one, and each kept its own copy of the star and the close. The
// swap is still a swap, but it can no longer change what the place looks like.
//
// ── The mark is Eddy's, and the colour is still the data's ────────────────
// A 10pt dot was the whole identity of a photo-less place, while the pin it came
// from is drawn in Eddy's own art. So the fallback is the catalog mark now, at
// the size of the photo it replaces, with the LAYER OR CONDITION COLOUR kept as
// the badge on its corner.
//
// THAT SPLIT IS THE MAP'S OWN, not a new idea: build-map-icons.py derives every
// place pin from these same six catalog sources — eddy-access from eddy-poi,
// eddy-gauge from eddy-other-usgs-gauge, and so on — and RiverMap keeps a
// data-coloured badge underneath each, because "the art says WHAT it is, the
// badge says condition or severity". Reusing the split here is what makes the
// sheet show the same drawing the finger just landed on, and reusing the CATALOG
// rather than assets/map is deliberate: those are normalised to 66px for a 22pt
// pin and would be soft at this size, where the 300px source is not.
//
// It also has to be this way round. The art is fixed-colour and three-tone, so a
// mark asked to carry the state would lose it — the reason EddySymbol's header
// forbids these on the map, where a pin is recoloured per reading.
//
// ── Real 44pt controls, and no contested band between them ────────────────
// Star and close were a 19pt glyph with hitSlop 12 in a row with a 10pt gap.
// Those slop regions OVERLAPPED — 24pt of slop across a 10pt gap, reaching 2pt
// into each glyph — and iOS hit-tests later siblings first, so close won the
// contested band and a tap just right of the star closed the sheet instead of
// starring it. They are laid-out 44x44 boxes now, abutting rather than
// overlapping, with the last one pulled into the container's padding so the
// glyph still sits on the optical margin while its target reaches the edge.
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MapAccessPoint } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddySymbol } from '@/components/EddySymbol';
import type { MapPin } from '@/map/RiverMap';
import { MAP_LAYERS } from '@/map/layers';
import { placeSymbol } from './placeSymbol';

/** The photo, and the well the mark stands in when there is no photo. */
const FRAME = 44;
/**
 * The mark inside that well.
 *
 * Smaller than the frame because the catalog's stickers are drawn edge to edge
 * with no margin of their own, and because their ASPECT RATIOS VARY — the boat
 * ramp is 300x180, the dam 300x300, the POI pin 219x300. EddySymbol contains
 * them in a square box, so the longest side is what meets `size` and a wide mark
 * paints shorter than a square one in the same slot. The well is what makes that
 * read as one component instead of a mark that changes size per place: the
 * frame, the badge and the corner radius hold still, and only the drawing inside
 * breathes. Normalising the art itself is a job for build-eddy-icons.py, not for
 * a caller to fake with per-name sizes.
 */
const MARK = 32;
/** The 44pt touch floor from DESIGN.md §6. */
const CONTROL = 44;
/**
 * How far the last control reaches into the container's 16pt padding.
 *
 * A 44pt box around a 19pt glyph has 12pt of air on each side, so without this
 * the close glyph would sit 28pt from the sheet edge and look inset. 10 leaves
 * the glyph very near where it was and spends the rest of the padding on target.
 */
const EDGE_BLEED = 10;

/**
 * The identity row: what this place is, what it is called, and the two controls
 * that belong to the OBJECT rather than to any action on it.
 *
 * Everything here comes from data the map already holds, so it paints on the
 * first frame with nothing outstanding.
 */
export function PlaceHead({
  pin,
  accessPoint,
  starred = false,
  onToggleStar = null,
  onClose,
}: {
  pin: MapPin;
  accessPoint: MapAccessPoint | null;
  starred?: boolean;
  /** Null for anything that cannot be starred. */
  onToggleStar?: (() => void) | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const layer = MAP_LAYERS.find((l) => l.key === pin.layer);
  // What the pin is wearing on the map: a condition for a gauge, a layer colour
  // for everything else.
  const state = pin.color ?? layer?.color(colors) ?? colors.interactive;
  const photo = accessPoint && pin.imageUrl ? pin.imageUrl : null;

  return (
    <View style={styles.row}>
      <View style={styles.frame}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={styles.photo}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.well, { backgroundColor: colors.cardRaised }]}>
            <EddySymbol name={placeSymbol(pin, accessPoint)} size={MARK} />
          </View>
        )}
        {/* borderColor is applied INLINE, not in the StyleSheet: that runs once
            at import, so a colour written into it freezes at whichever scheme
            the app launched with — the invariant app-theme.test.ts guards. White
            in BOTH schemes on purpose, because the badge sits on a PHOTOGRAPH
            half the time and a photograph is neither light nor dark. Same
            reasoning as circleStrokeColor on the map layers. */}
        <View style={[styles.badge, { backgroundColor: state, borderColor: '#FFFFFF' }]} />
      </View>

      <View style={styles.text}>
        {/* THE LINE THAT IDENTIFIES THE PLACE, and it now outranks the metadata
            around it. It was 14pt semibold — the same scale as the chips below
            it and the tab labels beside it — so the one thing a reader is
            looking for competed with everything that qualifies it. 16pt heading
            rather than 18: t.lg carries a 29pt line height, and two lines of it
            would spend 58pt of a peek that is already negotiating with the map
            for the screen. */}
        {/* A HEADING, and the sheet's only one. The rotor's heading list is how
            a VoiceOver reader skips to what a surface is about instead of
            swiping through it, and on this screen the sheet's subject changes
            every time a pin is tapped while everything around it stays put — so
            "which place am I reading now" is the exact question a heading
            answers here. */}
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={2}
          accessibilityRole="header"
        >
          {pin.name}
        </Text>
        {pin.subtitle ? (
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {pin.subtitle}
          </Text>
        ) : null}
      </View>

      {/* IN THE HEAD, not among the actions below. The star belongs to the
          OBJECT, which is what this row names — the same relationship RiverRow
          expresses by giving the star its own column beside the name. It was
          never an action on the same footing as "Put in here", and it would have
          taken width from one on the sheets that carry both. */}
      {onToggleStar ? (
        <Pressable
          onPress={onToggleStar}
          style={({ pressed }) => [styles.control, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={starred ? `Unstar ${pin.name}` : `Star ${pin.name}`}
        >
          <Ionicons
            name={starred ? 'star' : 'star-outline'}
            size={19}
            color={starred ? colors.favorite : colors.textMuted}
          />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.control, styles.lastControl, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={19} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding of its own: both callers already pad their column, and
  // the controls have to be able to reach past that padding.
  row: { flexDirection: 'row', alignItems: 'center' },
  frame: { width: FRAME, height: FRAME, marginRight: 10 },
  photo: { width: FRAME, height: FRAME, borderRadius: 9 },
  well: {
    width: FRAME,
    height: FRAME,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  text: { flex: 1, minWidth: 0 },
  name: { ...t.base, fontFamily: fonts.heading },
  meta: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  control: {
    width: CONTROL,
    height: CONTROL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastControl: { marginRight: -EDGE_BLEED },
});
