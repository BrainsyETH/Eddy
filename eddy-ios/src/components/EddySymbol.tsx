// eddy-ios/src/components/EddySymbol.tsx
// Eddy's own symbols, where an Ionicon used to sit.
//
// Sibling of Otter.tsx and built the same way: static require()s, because Metro
// resolves asset requires at bundle time and a computed path simply fails to
// bundle.
//
// The difference from Otter is what they ARE. An otter has a mood and the
// canonical condition system decides which one; these are utility marks with no
// state — the README in design/eddy-emoji calls them "mascot-free utility
// symbols" — so they are chosen by the caller and nothing decides for them.
//
// Keys are ROLES, not drawings — `gauge`, not `waterDroplet`. A caller asking
// for a gauge mark should not have to know which drawing the catalog selected,
// and the day it becomes something else this map is the only edit.
//
// NOT FOR MAP PINS. These are fixed-colour, three-tone stickers, and the map's
// pins are registered `sdf: true` (see src/map/RiverMap.tsx) precisely so they
// can be RECOLOURED at runtime — a gauge wears its condition, an access point
// wears its layer. Drawing a fixed-colour gauge on the map would paint every
// reading the same colour. The layer sheet is the one map-adjacent place they
// DO belong, because a row there is a legend rather than a reading; its well is
// outlined for exactly that reason.
//
// The sources are 1254px concept art with an off-white card baked in. These are
// derived: see eddy-ios/scripts/build-eddy-icons.py, which cuts the background
// and downscales to 300px. Do not hand-export into assets/eddy.
//
// ── THE CATALOG'S ASPECT RATIOS VARY, and `size` is the longest side ──────
// The script trims each drawing to its own ink, so the boat ramp is 300x180, the
// campground 300x240, the dam 300x300 and the POI pin 219x300. `size` bounds a
// SQUARE box and the art is contained in it, so at size 36 a wide mark paints
// 36x22 and a square one 36x36. Beside a label that is invisible — both are 36
// wide. In a slot large enough to look at, it is not, and the fix is a fixed
// well around the mark rather than a per-name size at the call site: see
// PlaceHead, which holds the frame, the badge and the radius still and lets only
// the drawing inside breathe.

import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const SYMBOLS = {
  weather: require('../../assets/eddy/eddy-weather.png'),
  aiAssistant: require('../../assets/eddy/eddy-ai-assistant.png'),
  gauge: require('../../assets/eddy/eddy-other-usgs-gauge.png'),
  dam: require('../../assets/eddy/eddy-dam.png'),
  accessPoint: require('../../assets/eddy/eddy-poi.png'),
  // The access types the catalog has drawn. Resolved by placeSymbol, which
  // chooses the most useful specific role while the map itself still draws one
  // contextual marker per physical place — six mini-icons on one pin would be
  // a legend test, not a map.
  boatRamp: require('../../assets/eddy/eddy-boat-ramp.png'),
  gravelBar: require('../../assets/eddy/eddy-gravel-bar.png'),
  bridge: require('../../assets/eddy/eddy-bridge.png'),
  otherGauge: require('../../assets/eddy/eddy-other-usgs-gauge.png'),
  hazard: require('../../assets/eddy/eddy-hazard.png'),
  campground: require('../../assets/eddy/eddy-campground.png'),
  outfitter: require('../../assets/eddy/eddy-outfitter.png'),
  lodging: require('../../assets/eddy/eddy-lodging.png'),
  river: require('../../assets/eddy/eddy-river.png'),
  alertWatch: require('../../assets/eddy/eddy-alert-watch.png'),
  water: require('../../assets/eddy/eddy-water-droplet.png'),
  // The springs layer's mark. The same droplet as `water`, under its own name
  // rather than by reusing that one: the layers sheet is a LEGEND, so the name
  // a row asks for has to be the name of the thing the row draws — and when
  // Eddy gets a spring drawing of its own, this entry changes and `water` does
  // not. See build-map-icons.py, where the map variant is generated from the
  // same source for the same reason.
  spring: require('../../assets/eddy/eddy-water-droplet.png'),
  heart: require('../../assets/eddy/eddy-heart.png'),

  // The access-point section marks, matching the website's own headings on that
  // page. `facilities` is a ROLE and not a drawing — the section covers toilets,
  // water and picnic tables, and the art happening to be a pair of restroom-sign
  // otters is this map's business rather than the caller's. Web names the same
  // three (see EddyIcon.tsx); the two catalogs must not drift on them.
  road: require('../../assets/eddy/eddy-road.png'),
  parking: require('../../assets/eddy/eddy-parking.png'),
  facilities: require('../../assets/eddy/eddy-restroom.png'),

  /**
   * The one entry that is not mascot-free, and the one place that is right.
   *
   * `eddyRated` marks the tier of gauges EDDY HAS RATED, as against the rest of
   * the USGS network beside it. The distinction between those two rows is
   * literally "did Eddy grade this one", so his face is not decoration on that
   * chip — it is the whole of what the chip says. Sourced from assets/otter
   * rather than the catalog because that is where the favicon already lives.
   */
  eddyRated: require('../../assets/otter/favicon.png'),
} as const;

export type EddySymbolName = keyof typeof SYMBOLS;

export function EddySymbol({
  name,
  size = 18,
  style,
}: {
  name: EddySymbolName;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SYMBOLS[name]}
      // Square box with contain, so the two sit on the same baseline even
      // though one source is taller than wide and the other wider than tall.
      style={[{ width: size, height: size }, styles.image, style]}
      resizeMode="contain"
      // Decorative everywhere it is used: the section label beside it already
      // says what it is, and announcing both reads as a stutter.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  image: { alignSelf: 'center' },
});
