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
// The sources are 1254px concept art with an off-white card baked in. These are
// derived: see eddy-ios/scripts/build-eddy-icons.py, which cuts the background
// and downscales to 300px. Do not hand-export into assets/eddy.

import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const SYMBOLS = {
  weather: require('../../assets/eddy/eddy-weather.png'),
  aiAssistant: require('../../assets/eddy/eddy-ai-assistant.png'),
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
