import { darkPalette, lightPalette, neutral, primary, type Palette } from './palette';

// Keep the same brand hues; strengthen readable roles and control boundaries.
export const highContrastLightPalette: Palette = {
  ...lightPalette, text: neutral[950], textMuted: neutral[800], textSubtle: neutral[700],
  border: neutral[600], interactive: primary[800], interactivePressed: primary[900],
};
export const highContrastDarkPalette: Palette = {
  ...darkPalette, textMuted: primary[100], textSubtle: neutral[200],
  border: primary[300], interactive: primary[100], interactivePressed: primary[50],
};
