import { support, type Palette } from './palette';

/** Trail Green means healthy recording here, never a verdict about river conditions. */
export function activeFloatColors(colors: Palette, healthy: boolean) {
  return {
    backgroundColor: healthy && colors.scheme === 'light' ? support[100] : colors.card,
    borderColor: healthy ? colors.success : colors.borderStrong,
    ink: healthy ? colors.success : colors.textMuted,
    // Trail Green 700 is readable on white, but falls short for small text
    // on its own 100 tint. Keep the green icon/border and use warm dark ink.
    textColor: healthy ? colors.scheme === 'light' ? colors.text : colors.success : colors.textMuted,
  };
}
