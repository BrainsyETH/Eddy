// eddy-ios/src/theme/palette.ts
// Eddy's brand palette, ported from missouri-float-planner/.stitch/DESIGN.md.
//
// Names and hex values are copied verbatim from that document so the app and the
// website read as one product. If DESIGN.md changes, change this to match — it
// is the design system of record, not this file.
//
// The families and their roles, per the doc:
//   Primary   — Deep River Teal   (surfaces, headers, links, focus)
//   Secondary — Sandbar Tan       (warm supporting accent)
//   Accent    — Sunset Coral      (primary CTA, Eddy branding)
//   Support   — Trail Green       (success, optimal conditions)
//   Neutral   — Warm Stone        (text and dark-mode surfaces)
//
// Note the neutrals are deliberately WARM (#1A1814, not a blue-grey). Eddy's
// dark mode is stone and teal, never slate.

export const primary = {
  900: '#0F2D35',
  800: '#163F4A',
  700: '#1D525F',
  600: '#256574',
  500: '#2D7889',
  400: '#4A9AAD',
  300: '#72B5C4',
  200: '#A3D1DB',
  100: '#D4EAEF',
  50: '#EBF5F7',
} as const;

export const secondary = {
  500: '#B89D72',
  200: '#E8DFD0',
  100: '#F4EFE7',
  50: '#FAF8F4',
} as const;

export const accent = {
  600: '#E5573F',
  500: '#F07052',
  400: '#F48E76',
  300: '#F7AC9A',
  100: '#FDE7E1',
  50: '#FEF5F3',
} as const;

export const support = {
  700: '#347A47',
  500: '#4EB86B',
  300: '#95D9A7',
  100: '#DCF4E2',
} as const;

export const neutral = {
  950: '#1A1814',
  900: '#2D2A24',
  800: '#3F3B33',
  700: '#524D43',
  600: '#6B6459',
  500: '#857D70',
  400: '#A49C8E',
} as const;

/**
 * Semantic roles for the app's dark UI, mapped from the families above.
 * Components should use these rather than reaching for raw scale values, so a
 * palette change lands in one place.
 */
export const COLORS = {
  /** Warm stone, per DESIGN.md "darkest — dark mode background". */
  bg: neutral[950],
  /** Deep teal card surface — reads as Eddy rather than generic dark grey. */
  card: primary[900],
  cardRaised: primary[800],
  border: primary[700],
  text: '#FFFFFF',
  textMuted: primary[300],
  textSubtle: neutral[400],
  /** Sunset Coral — the Eddy branding colour and primary CTA. */
  accent: accent[500],
  accentPressed: accent[600],
  /** Active nav highlight on dark backgrounds, per DESIGN.md. */
  accentOnDark: accent[400],
  success: support[500],
  warm: secondary[500],
} as const;
