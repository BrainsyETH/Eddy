// eddy-ios/src/components/Otter.tsx
// Eddy the Otter.
//
// The mascot is not decoration bolted on afterwards — CONDITION_SYSTEM assigns
// every condition an `otter` mood ("green" | "yellow" | "flag" | "red" |
// "flood" | "favicon"), so which otter to show for a given river is already a
// decision the canonical system has made. This just draws it.
//
// The source art lives in remotion/public/eddy at video resolution (~1024px,
// ~700 KB each). These copies are downscaled to 300px — enough for a ~100pt
// render at @3x — which took the set from 4.58 MB to 193 KB.

import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { CONDITION_SYSTEM, type ConditionCode } from '@eddy/conditions';

// require() rather than a dynamic path: Metro resolves asset requires
// statically, so a computed path would simply fail to bundle.
const OTTERS = {
  green: require('../../assets/otter/green.png'),
  yellow: require('../../assets/otter/yellow.png'),
  flag: require('../../assets/otter/flag.png'),
  red: require('../../assets/otter/red.png'),
  flood: require('../../assets/otter/flood.png'),
  favicon: require('../../assets/otter/favicon.png'),
  standard: require('../../assets/otter/standard.png'),
} as const;

export type OtterMood = keyof typeof OTTERS;

/** The mood the canonical condition system assigns to a condition. */
export function otterForCondition(code: string): OtterMood {
  const mood = CONDITION_SYSTEM[code as ConditionCode]?.otter;
  return (mood && mood in OTTERS ? mood : 'standard') as OtterMood;
}

export function Otter({
  mood = 'standard',
  size = 96,
  style,
}: {
  mood?: OtterMood;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={OTTERS[mood]}
      style={[{ width: size, height: size }, styles.image, style]}
      resizeMode="contain"
      // Decorative in every current placement — the adjacent text already says
      // what the otter is reacting to, so announcing it twice is noise.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  image: { alignSelf: 'center' },
});
