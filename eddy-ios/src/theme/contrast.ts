import { darkPalette, lightPalette, neutral, primary, type Palette } from './palette';

// Keep the same brand hues; strengthen readable roles and control boundaries.
export const highContrastLightPalette: Palette = {
  ...lightPalette, text: neutral[950], textBody: neutral[950], textMuted: neutral[800], textSubtle: neutral[700],
  border: neutral[600], borderStrong: neutral[600], interactive: primary[800], interactivePressed: primary[900],
};
export const highContrastDarkPalette: Palette = {
  ...darkPalette, text: '#FFFFFF', textBody: '#F5F5F0', textMuted: '#E7E7E2', textSubtle: '#D6D6CE',
  border: '#B5B5AF', borderStrong: '#B5B5AF', interactive: primary[100], interactivePressed: primary[50],
};
