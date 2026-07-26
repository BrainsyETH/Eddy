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
  300: '#C2BAAC',
  200: '#DBD5CA',
  100: '#EDEBE6',
  50: '#F7F6F3',
} as const;

/**
 * Semantic roles. Components use these, never raw scale values, so a palette
 * change lands in one place — and so one component works in both schemes.
 *
 * NOT included: condition colours. Those come from CONDITION_SYSTEM and are
 * already scheme-agnostic by construction — `bg` is an rgba tint that composites
 * over any background, and `ink` is an AA-contrast dark for text on that tint.
 * See src/theme/conditions.ts.
 */
export interface Palette {
  scheme: 'light' | 'dark';
  /** Page canvas. */
  bg: string;
  /** Card and sheet surfaces. */
  card: string;
  /** A raised or selected card. */
  cardRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  /** Sunset Coral — primary CTA and the Eddy branding colour. */
  accent: string;
  accentPressed: string;
  /** Active tab/nav tint. Per-scheme: coral needs lifting on dark, not on white. */
  accentActive: string;
  /** Text and icons placed ON the accent fill. */
  onAccent: string;
  success: string;
  warm: string;
  /**
   * Something went wrong.
   *
   * This role exists because it was missing: error text was being painted in
   * `warm` (Sandbar Tan), which is a decorative brand accent and reads as
   * emphasis, not as a warning. Tan on a warm off-white canvas is also barely a
   * signal at all.
   *
   * NOT a condition colour. `dangerous` means the river is in flood; this means
   * the app failed. Conflating them would let a network timeout borrow the
   * visual weight of a safety call, so this is deliberately drawn from the
   * generic red rather than from CONDITION_SYSTEM.
   */
  error: string;
  /** Tab bar and other chrome, kept distinct from `card`. */
  chrome: string;
}

/**
 * Dark — warm stone and teal.
 *
 * Not an invention: DESIGN.md's neutral scale names 950 "darkest — dark mode
 * background" and 800/700 as dark-mode surfaces, so this is the document's own
 * dark mode rather than an inversion of its light one.
 */
export const darkPalette: Palette = {
  scheme: 'dark',
  bg: neutral[950],
  // Deep teal card surface — reads as Eddy rather than generic dark grey.
  card: primary[900],
  cardRaised: primary[800],
  border: primary[700],
  text: '#FFFFFF',
  textMuted: primary[300],
  textSubtle: neutral[400],
  accent: accent[500],
  accentPressed: accent[600],
  // Per DESIGN.md: "Accent 400 — active nav highlight on dark backgrounds".
  accentActive: accent[400],
  onAccent: '#FFFFFF',
  success: support[500],
  warm: secondary[500],
  // red-400. The darker red-500 used on light is muddy against near-black stone.
  error: '#F87171',
  chrome: primary[900],
};

/**
 * Light — the warm off-white canvas DESIGN.md actually specifies.
 *
 * Deliberately not white-on-grey: neutral-50 is a warm sandstone tint, and
 * cardRaised uses Sandbar Tan 50 so a selected card warms rather than greys.
 */
export const lightPalette: Palette = {
  scheme: 'light',
  bg: neutral[50],
  card: '#FFFFFF',
  cardRaised: secondary[50],
  border: neutral[200],
  text: neutral[900],
  textMuted: neutral[600],
  textSubtle: neutral[500],
  accent: accent[500],
  accentPressed: accent[600],
  // Coral 400 is too pale to carry an active state against white; the base holds
  // its own here, which is why this field is per-scheme at all.
  accentActive: accent[500],
  onAccent: '#FFFFFF',
  // Support 700, not 500: the base green fails AA as text on white.
  success: support[700],
  warm: secondary[500],
  // red-600, matching the canonical `dangerous` ink's contrast discipline: the
  // lighter red-500 clears AA on white only at large sizes, and error text is small.
  error: '#DC2626',
  chrome: '#FFFFFF',
};

/**
 * Depth.
 *
 * DESIGN.md's signature is a hard-edged offset shadow (`3px 3px 0 #A49C8E`,
 * never blurred). That is a web idiom: it reads as an affectation on iOS, where
 * elevation is soft and directional-down, and it pairs with a hover state that
 * does not exist on touch. So the brand's STRUCTURE carries over — cards stay
 * distinct, bordered objects — while the shadow itself is retranslated.
 *
 * On dark a shadow is nearly invisible against a near-black canvas, so elevation
 * is expressed through border and surface lift instead.
 */
export function elevation(palette: Palette, level: 1 | 2) {
  if (palette.scheme === 'dark') {
    return { borderWidth: 1, borderColor: level === 1 ? palette.border : primary[600] };
  }
  return {
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: neutral[900],
    shadowOpacity: level === 1 ? 0.06 : 0.1,
    shadowRadius: level === 1 ? 3 : 8,
    shadowOffset: { width: 0, height: level === 1 ? 1 : 3 },
    elevation: level === 1 ? 1 : 3,
  };
}
