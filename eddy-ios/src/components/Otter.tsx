// eddy-ios/src/components/Otter.tsx
// Eddy the Otter, and a saved float's mood (FloatMoodOtter below).
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
import type { FloatMood } from '@eddy/conditions/float-recap';

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

// A saved float's mood (float-recap.ts pickFloatMood), a verdict like the
// condition otter: chosen by a rule, never by the caller. Five moods have no
// art of their own yet and use the design's stand-ins; replacing one is a new
// master in scripts/build-eddy-icons.py MOODS plus one line here. Big water's
// stand-in is the cautious high-water otter, never a celebrating one.
const FLOAT_MOODS: Record<FloatMood, number> = {
  'made-it': require('../../assets/eddy/eddy-celebrate.png'),
  'good-float': require('../../assets/eddy/eddy-thumbs-up.png'),
  'quick-dip': require('../../assets/eddy/eddy-laugh.png'),
  'lazy-river': require('../../assets/eddy/eddy-campfire-chill.png'),
  'big-water': require('../../assets/eddy/eddy-high-water-alert.png'),
  rain: require('../../assets/eddy/eddy-safety-first.png'),
  chilly: require('../../assets/eddy/eddy-campfire-chill.png'),
  scrape: require('../../assets/eddy/eddy-thinking.png'),
  'speed-run': require('../../assets/eddy/eddy-paddle-ready.png'),
};

/** A float's mood sticker; null (nothing measured, or high water on a stale reading) is the standard otter. */
export function FloatMoodOtter({
  mood,
  size = 96,
  style,
}: {
  mood: FloatMood | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  if (!mood) return <Otter mood="standard" size={size} style={style} />;
  return (
    <Image
      source={FLOAT_MOODS[mood]}
      style={[{ width: size, height: size }, styles.image, style]}
      resizeMode="contain"
      // Decorative: the mood line beside it says the same thing in words.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  image: { alignSelf: 'center' },
});
