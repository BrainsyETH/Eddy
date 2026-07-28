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
  700: '#C7432E',
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
  /** Sunset Coral — Eddy branding and decorative emphasis. */
  accent: string;
  /** Deeper coral that supports white CTA text at AA contrast. */
  accentFill: string;
  accentFillPressed: string;
  /** Text and icons placed ON the accent fill. */
  onAccent: string;
  /** Links, navigation, selection indicators and utility controls. */
  interactive: string;
  interactivePressed: string;
  /** Text and icons placed ON a solid interactive fill. */
  onInteractive: string;
  /** Quiet selected state for filters, segments and option rows. */
  selectionBg: string;
  selectionText: string;
  /** Occasional high-emphasis header or summary surface. */
  anchorSurface: string;
  onAnchor: string;
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
  /**
   * Rain, as a three-step ramp from "not a factor" to "this moves your plan".
   *
   * Grey → blue → deep blue. Blue because rain is water and the teal `primary`
   * family is the brand's water colour; a ramp inside ONE hue reads as more of
   * the same thing, which is what a rising chance of rain is.
   *
   * It replaces grey → body-text → coral, which had two problems: coral is the
   * CTA colour and a rain chance is not an action, and `none` and `unlikely`
   * were both textSubtle, so "No rain" and "Rain 15%" looked identical.
   *
   * Per scheme rather than one value each: a deep teal that reads as emphatic on
   * white disappears entirely against near-black stone, so dark mode ramps the
   * other way — up the scale into the light end — to get the same "this one
   * matters" effect.
   */
  rainQuiet: string;
  rainLikely: string;
  rainHeavy: string;

  /**
   * Modal scrim.
   *
   * DELIBERATELY LIGHT, and the same on both schemes. The sheets that use it
   * sit over the map, and a dimmed-to-black map cannot show you what the switch
   * you just flipped did. It lives here rather than in a StyleSheet because
   * StyleSheet.create runs once at import and freezes whatever scheme the app
   * launched with — see app-theme.test.ts.
   */
  scrim: string;
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
  accentFill: accent[700],
  accentFillPressed: '#B93825',
  onAccent: '#FFFFFF',
  // Dark mode moves UP the teal scale. primary-600 against primary-900 is only
  // 2.21:1, so using the light-mode value here would make links disappear.
  interactive: primary[300],
  interactivePressed: primary[200],
  onInteractive: primary[900],
  selectionBg: primary[800],
  selectionText: primary[100],
  anchorSurface: primary[800],
  onAnchor: '#FFFFFF',
  success: support[500],
  warm: secondary[500],
  // red-400. The darker red-500 used on light is muddy against near-black stone.
  error: '#F87171',
  chrome: primary[900],
  rainQuiet: neutral[400],
  rainLikely: primary[300],
  rainHeavy: primary[200],
  scrim: 'rgba(0,0,0,0.22)',
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
  accentFill: accent[700],
  accentFillPressed: '#B93825',
  onAccent: '#FFFFFF',
  // Primary-600 is 6.58:1 on white and 5.93:1 on selectionBg: strong enough
  // for ordinary link text, small icons and selected labels.
  interactive: primary[600],
  interactivePressed: primary[700],
  onInteractive: '#FFFFFF',
  selectionBg: primary[50],
  selectionText: primary[900],
  anchorSurface: primary[900],
  onAnchor: '#FFFFFF',
  // Support 700, not 500: the base green fails AA as text on white.
  success: support[700],
  warm: secondary[500],
  // red-600, matching the canonical `dangerous` ink's contrast discipline: the
  // lighter red-500 clears AA on white only at large sizes, and error text is small.
  error: '#DC2626',
  chrome: '#FFFFFF',
  rainQuiet: neutral[500],
  rainLikely: primary[500],
  rainHeavy: primary[800],
  scrim: 'rgba(0,0,0,0.22)',
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

/**
 * Depth for a control floating OVER content, rather than a card sitting on the
 * canvas.
 *
 * Separate from elevation() because the two problems are different. A card
 * needs separating from a flat page, which on dark is done with a border since
 * a shadow against near-black stone is invisible. A button floating over a
 * Mapbox view has no flat page behind it — it sits on forest green, gravel and
 * water, all of them lighter than the app's own dark canvas — so it needs a
 * real drop shadow in BOTH schemes, and a border would just outline it.
 *
 * Always cast from the neutral scale rather than from a palette role: a shadow
 * is a shadow in either appearance, and painting it in the scheme's text colour
 * would put a white glow under a button on dark.
 */
export function floating(palette: Palette) {
  return {
    shadowColor: neutral[950],
    // Heavier on dark: the map is the brightest surface in the app there, and a
    // light-mode shadow disappears against it.
    shadowOpacity: palette.scheme === 'dark' ? 0.45 : 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  };
}
