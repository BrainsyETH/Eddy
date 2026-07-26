// eddy-ios/src/theme/typography.ts
// The type system from DESIGN.md, as loadable font families.
//
// The website uses local Geist woff files (src/app/layout.tsx). Those cannot be
// reused — React Native needs TTF/OTF — so the same faces come from the
// @expo-google-fonts packages instead. Same typefaces, same roles.
//
// Roles, per DESIGN.md §3:
//   Display   Fredoka        the "Eddy" brand name and mascot callouts
//   Heading   Geist 700      page titles and card headings
//   Body      Geist 400-600  copy, labels, buttons
//   Mono      Geist Mono     gauge readings and data values
//
// Mono for readings is FUNCTIONAL, not decorative. Proportional digits change
// width as a number ticks, so "1.51 ft" becoming "1.62 ft" makes the whole row
// shift. Tabular monospace holds still, which matters on a screen whose entire
// job is showing a number that changes.

export const fonts = {
  display: 'Fredoka_600SemiBold',
  displayBold: 'Fredoka_700Bold',
  heading: 'Geist_700Bold',
  semibold: 'Geist_600SemiBold',
  medium: 'Geist_500Medium',
  body: 'Geist_400Regular',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

/**
 * The type scale from DESIGN.md §3, minus the desktop-only sizes.
 *
 * 4xl-6xl are dropped deliberately: they exist for desktop hero titles and a
 * 60px logo, neither of which occurs on a phone.
 */
export const type = {
  xs: { fontSize: 12, lineHeight: 17 },
  sm: { fontSize: 14, lineHeight: 21 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 29 },
  xl: { fontSize: 20, lineHeight: 28 },
  '2xl': { fontSize: 24, lineHeight: 31 },
  '3xl': { fontSize: 30, lineHeight: 38 },
} as const;
