// eddy-ios/src/components/EddyScene.tsx
// Eddy doing something, at the size of a moment.
//
// The third of three ways this app draws the mascot, and the distinction between
// them is who chooses:
//
//   Otter.tsx        — a mood. CONDITION_SYSTEM chooses it from the reading, and
//                      the caller must not override it: that art is the verdict.
//   EddySymbol.tsx   — a utility mark. The caller chooses. Inline, ~18pt.
//   EddyScene.tsx    — this. The caller chooses, but it is a full-body scene at
//                      hero size, for the middle of an empty state.
//
// The split from EddySymbol is about SIZE, not subject. These are drawn as
// stickers with a whole otter, a prop and a bit of river in them; at 18pt that
// is a smudge. They start at 110pt because that is what the Otter call sites
// they replace already used.
//
// Static require()s, like Otter and EddySymbol: Metro resolves asset requires at
// bundle time and a computed path simply fails to bundle.

import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

// Four of the catalog's ten scenes, because this list is bundle weight and the
// app has exactly these slots. Its other large-mascot moments are dead ends — a
// failed load, an unsupported region, a forced upgrade — and those belong to the
// canonical `flag` caution otter, not to a scene the caller picked.
//
// Adding one means adding it to SCENES in scripts/build-eddy-icons.py too, and
// then running it. There is no hand-export path into assets/eddy.
const SCENES = {
  checkingGauge: require('../../assets/eddy/eddy-checking-gauge.png'),
  routePlanning: require('../../assets/eddy/eddy-route-planning.png'),
  heart: require('../../assets/eddy/eddy-heart.png'),
  wave: require('../../assets/eddy/eddy-wave.png'),
} as const;

export type EddySceneName = keyof typeof SCENES;

export function EddyScene({
  name,
  size = 110,
  style,
}: {
  name: EddySceneName;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SCENES[name]}
      style={[{ width: size, height: size }, styles.image, style]}
      resizeMode="contain"
      // Decorative in every placement: a scene sits above the sentence that
      // explains the state, and announcing both reads as a stutter. Same call
      // Otter and EddySymbol make.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  image: { alignSelf: 'center' },
});
