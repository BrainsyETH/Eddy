// shared/social-brand.ts
//
// The Eddy social design system — layer 1. Every social surface draws from this
// file: the Remotion reels (relative import from remotion/src) and the Next.js
// OG covers (`@shared/social-brand`). Pure TS: no React, no Remotion, no Next,
// so both build pipelines can consume it and neither can drift from the other.
//
// Layer 2 — the per-format storytelling (the scrolling river, the trend chart,
// the gauge instrument, stacked river cards) — lives in each composition and
// cover and builds ONLY on the primitives described here, so a masthead, card,
// tile, pill, button or CTA reads the same on a reel and on its cover. The
// rules are written up in docs/social-design-system.md; the numbers live here.
//
// Look: Organic Brutalist, mirroring src/app/globals.css — a warm off-white
// ground, white cards with thick teal borders and hard offset shadows, Fredoka
// display type, Geist body/mono. Two tones:
//
//   light  the default. Off-white ground, dark ink. Every editorial reel.
//   dark   the SEVERITY SURFACE: deep teal ground, white ink, cards bordered in
//          the condition colour. Sanctioned for the high-water / all-clear alert
//          family (including high-water ClipReels, where chrome sits over
//          footage). Ordinary ClipReels remain on the light editorial surface.
//
// All sizes are canvas pixels on the 1080-wide social canvas (1080×1920 reels,
// 1080×1080 / 1080×1920 covers).

// ─── Palette ────────────────────────────────────────────────────────────────
// Identical to the CSS custom properties in globals.css (the web app) and the
// Expo theme. Remotion's design-tokens/colors.ts re-exports this object.

export const colors = {
  /** Deep river teal — chrome, borders, the dark surface. */
  primary: {
    50: '#EBF5F7',
    100: '#D4EAEF',
    200: '#A3D1DB',
    300: '#72B5C4',
    400: '#4A9AAD',
    500: '#2D7889',
    600: '#256574',
    700: '#1D525F',
    800: '#163F4A',
    900: '#0F2D35',
  },
  /** Sandbar tan — tiles and warm secondary surfaces. */
  secondary: {
    50: '#FAF8F4',
    100: '#F4EFE7',
    200: '#E8DFD0',
    300: '#D9C9B0',
    400: '#C9B391',
    500: '#B89D72',
    600: '#99835F',
    700: '#7A684B',
    800: '#5C4E38',
    900: '#3D3425',
  },
  /** Coral — the series label pill and the call-to-action. */
  accent: {
    50: '#FEF5F3',
    100: '#FDE7E1',
    200: '#FACABD',
    300: '#F7AC9A',
    400: '#F48E76',
    500: '#F07052',
    600: '#E5573F',
    700: '#CC3E2B',
    800: '#A33122',
    900: '#7A2419',
  },
  /** Treeline green — success / put-in. */
  support: {
    50: '#EDFAF1',
    100: '#DCF4E2',
    200: '#B8E9C5',
    300: '#95D9A7',
    400: '#71C989',
    500: '#4EB86B',
    600: '#419959',
    700: '#347A47',
    800: '#275C35',
    900: '#1A3D23',
  },
  /** Warm neutrals — ground, ink, shadows. */
  neutral: {
    50: '#F7F6F3',
    100: '#EDEBE6',
    200: '#DBD5CA',
    300: '#C2BAAC',
    400: '#A49C8E',
    500: '#857D70',
    600: '#6B6459',
    700: '#524D43',
    800: '#3F3B33',
    900: '#2D2A24',
    950: '#1A1814',
  },
} as const;

export const semanticColors = {
  background: colors.neutral[50],
  surface: '#FFFFFF',
  success: colors.support[500],
  warning: '#E5A000',
  error: '#DC2626',
  info: colors.primary[500],
} as const;

/** Offset ("brutalist") shadows, mirroring --shadow-* in globals.css. */
export const shadows = {
  xs: `1px 1px 0 ${colors.neutral[300]}`,
  sm: `2px 2px 0 ${colors.neutral[300]}`,
  md: `3px 3px 0 ${colors.neutral[400]}`,
  lg: `4px 4px 0 ${colors.neutral[500]}`,
  xl: `6px 6px 0 ${colors.neutral[600]}`,
  softSm: '0 1px 3px rgba(45, 42, 36, 0.1)',
  softMd: '0 4px 6px rgba(45, 42, 36, 0.1)',
  softLg: '0 10px 15px rgba(45, 42, 36, 0.1)',
  accent: `3px 3px 0 ${colors.accent[600]}`,
  primary: `3px 3px 0 ${colors.primary[700]}`,
} as const;

// ─── Surfaces (tones) ───────────────────────────────────────────────────────

export type SocialTone = 'light' | 'dark';

export interface SocialSurface {
  tone: SocialTone;
  /** Page background. */
  ground: string;
  /** Card background. */
  surface: string;
  /** Stat-tile background. */
  tile: string;
  /** Primary text. */
  ink: string;
  /** Supporting text (subtitles, detail lines). */
  inkSecondary: string;
  /** Labels, units, metadata. */
  inkMuted: string;
  /** Card border. */
  rule: string;
  /** Tile border. */
  tileRule: string;
  /** Pill / button border. */
  chipRule: string;
  /** Card offset-shadow colour. */
  shadow: string;
  /** Tile / pill offset-shadow colour. */
  tileShadow: string;
  /** Hairline divider inside cards. */
  divider: string;
  /** The wordmark ("eddy.guide") colour. */
  wordmark: string;
}

export const SURFACES: Record<SocialTone, SocialSurface> = {
  light: {
    tone: 'light',
    ground: colors.neutral[50],
    surface: '#FFFFFF',
    tile: colors.secondary[50],
    ink: colors.neutral[900],
    inkSecondary: colors.neutral[600],
    inkMuted: colors.neutral[500],
    rule: colors.primary[700],
    tileRule: colors.primary[600],
    chipRule: colors.neutral[900],
    shadow: colors.neutral[400],
    tileShadow: colors.neutral[300],
    divider: colors.neutral[200],
    wordmark: colors.primary[900],
  },
  dark: {
    tone: 'dark',
    ground: colors.primary[900],
    surface: colors.primary[800],
    tile: colors.primary[900],
    ink: '#FFFFFF',
    inkSecondary: 'rgba(255,255,255,0.78)',
    inkMuted: 'rgba(255,255,255,0.58)',
    rule: colors.primary[300],
    tileRule: colors.primary[500],
    chipRule: colors.primary[900],
    shadow: 'rgba(0,0,0,0.45)',
    tileShadow: 'rgba(0,0,0,0.35)',
    divider: 'rgba(255,255,255,0.14)',
    wordmark: '#FFFFFF',
  },
};

/** Legibility scrim laid over footage before dark-tone chrome is drawn on it
 *  (ClipReel, photo-backed alert reels). Top and bottom bands, so the masthead
 *  and dock sit on a settled ground while the middle of the frame stays clear. */
export const MEDIA_SCRIM = {
  top: 'linear-gradient(to bottom, rgba(15,45,53,0.92) 0%, rgba(15,45,53,0.55) 55%, rgba(15,45,53,0) 100%)',
  bottom: 'linear-gradient(to top, rgba(15,45,53,0.94) 0%, rgba(15,45,53,0.55) 50%, rgba(15,45,53,0) 100%)',
  /** Full-frame wash for the alert family's background art. */
  warning: 'linear-gradient(160deg, rgba(42,13,13,0.84), rgba(15,45,53,0.82) 60%, rgba(15,45,53,0.94))',
  neutral: 'linear-gradient(160deg, rgba(15,45,53,0.88), rgba(22,63,74,0.8), rgba(15,45,53,0.94))',
} as const;

// ─── Card primitives ────────────────────────────────────────────────────────
// Border width, corner radius and shadow offset for each primitive. The helpers
// below turn them into plain style objects that both React inline styles and
// Satori (next/og) accept — Satori supports border, border-radius and offset
// box-shadow, and NOT backdrop-filter, which is why the system has no glass.

export const CARD = { border: 5, radius: 22, offset: 8 } as const;
export const TILE = { border: 4, radius: 16, offset: 5 } as const;
export const PILL = { border: 4, radius: 999, offset: 4 } as const;
export const BUTTON = { border: 4, radius: 14, offset: 6 } as const;
export const CALLOUT = { border: 5, radius: 20, offset: 8 } as const;

export interface SurfaceStyle {
  background: string;
  border: string;
  borderRadius: number;
  boxShadow: string;
}

/** A card: white (light) / deep-teal (dark) panel, thick rule, hard shadow. Pass
 *  `accent` to border the card in a condition colour (the dark tone's default
 *  is the neutral teal rule). */
export function cardStyle(tone: SocialTone = 'light', accent?: string): SurfaceStyle {
  const s = SURFACES[tone];
  return {
    background: s.surface,
    border: `${CARD.border}px solid ${accent ?? s.rule}`,
    borderRadius: CARD.radius,
    boxShadow: `${CARD.offset}px ${CARD.offset}px 0 ${s.shadow}`,
  };
}

/** A stat tile inside a card: sandbar (light) / deep-teal (dark) panel. */
export function tileStyle(tone: SocialTone = 'light', accent?: string): SurfaceStyle {
  const s = SURFACES[tone];
  return {
    background: s.tile,
    border: `${TILE.border}px solid ${accent ?? s.tileRule}`,
    borderRadius: TILE.radius,
    boxShadow: `${TILE.offset}px ${TILE.offset}px 0 ${s.tileShadow}`,
  };
}

/** A pill (the series label, a condition chip): filled, black-ruled. */
export function pillStyle(tone: SocialTone = 'light', fill: string = colors.accent[500]): SurfaceStyle {
  const s = SURFACES[tone];
  return {
    background: fill,
    border: `${PILL.border}px solid ${s.chipRule}`,
    borderRadius: PILL.radius,
    boxShadow: `${PILL.offset}px ${PILL.offset}px 0 ${s.shadow}`,
  };
}

/** The call-to-action button: coral, black-ruled, hard shadow. */
export function buttonStyle(tone: SocialTone = 'light', fill: string = colors.accent[500]): SurfaceStyle {
  const s = SURFACES[tone];
  return {
    background: fill,
    border: `${BUTTON.border}px solid ${s.chipRule}`,
    borderRadius: BUTTON.radius,
    boxShadow: `${BUTTON.offset}px ${BUTTON.offset}px 0 ${s.shadow}`,
  };
}

/** A transcript subtitle over footage (ClipReel). NOT a card: no rule, no
 *  offset shadow — those would make a spoken line a third panel competing with
 *  the masthead and dock. A quiet deep-teal wash under the words is all it
 *  needs to stay legible on bright water; white type in a glow is what the
 *  system does not draw. Always on the dark tone: subtitles only sit on media. */
export function subtitleStyle(): { background: string; borderRadius: number } {
  return { background: hexAlpha(colors.primary[900], 0.72), borderRadius: 10 };
}

/** A callout card (the route reel's stop cards): a card with a coloured header. */
export function calloutStyle(tone: SocialTone = 'light', accent?: string): SurfaceStyle {
  const s = SURFACES[tone];
  return {
    background: s.surface,
    border: `${CALLOUT.border}px solid ${accent ?? s.rule}`,
    borderRadius: CALLOUT.radius,
    boxShadow: `${CALLOUT.offset}px ${CALLOUT.offset}px 0 ${s.shadow}`,
  };
}

// ─── Type scale ─────────────────────────────────────────────────────────────
// Font FAMILY strings differ per pipeline (Remotion registers "Fredoka" with a
// system fallback; Satori registers the bare embedded face), so each pipeline
// builds its own stacks from these names. Sizes and weights are shared.

export const FONT_NAMES = {
  display: 'Fredoka',
  body: 'Geist Sans',
  mono: 'Geist Mono',
} as const;

export interface TypeStep {
  size: number;
  weight: number;
  lineHeight?: number;
  tracking?: number;
  uppercase?: boolean;
}

export const TYPE = {
  /** The series-label pill ("FLOAT PICK"). Display. */
  label: { size: 22, weight: 650, tracking: 1, uppercase: true },
  /** The masthead wordmark ("eddy.guide"). Display. */
  wordmark: { size: 24, weight: 650 },
  /** The masthead hero line (the river name). Display. */
  title: { size: 70, weight: 680, lineHeight: 0.98, tracking: -1.5 },
  /** Hero line for covers, where there is room to shout. Display. */
  coverTitle: { size: 112, weight: 700, lineHeight: 0.95, tracking: -3 },
  /** Date / tagline under the title. Body. */
  subtitle: { size: 25, weight: 560 },
  /** A stat tile's number. Display. */
  statValue: { size: 43, weight: 720, lineHeight: 1 },
  /** A stat tile's number when the value is a word ("Flowing"). Display. */
  statWord: { size: 30, weight: 720, lineHeight: 1 },
  /** The unit beside a stat number ("HRS"). Mono. */
  statUnit: { size: 16, weight: 650 },
  /** A stat tile's caption ("FLOAT TIME"). Body. */
  statLabel: { size: 14, weight: 750, tracking: 1.2, uppercase: true },
  /** The dock's detail line ("0.4 hr faster today"). Body. */
  detail: { size: 20, weight: 620 },
  /** The CTA button. Display. */
  button: { size: 23, weight: 680 },
  /** The secondary growth line under the dock. Display. */
  follow: { size: 20, weight: 600 },
  /** A callout card's coloured header. Display. */
  calloutHeader: { size: 19, weight: 700, tracking: 0.8, uppercase: true },
  /** A callout card's name line. Display. */
  calloutTitle: { size: 34, weight: 680, lineHeight: 1.05 },
  /** A callout card's metadata line. Mono. */
  calloutMeta: { size: 18, weight: 650 },
  /** A river-card name in a stacked list. Display. */
  rowTitle: { size: 38, weight: 650, lineHeight: 1.05 },
  /** Body copy — a quote, a note. Body. */
  body: { size: 30, weight: 500, lineHeight: 1.38 },
  /** The centred hero quote on a quote-forward reel. Body. */
  quote: { size: 40, weight: 520, lineHeight: 1.32 },
  /** A transcript subtitle over footage (ClipReel). Body — subtitle-sized,
   *  smaller than the dock's detail line's neighbours, never a headline. */
  subtitle_media: { size: 30, weight: 600, lineHeight: 1.25 },
  /** Instrument numerals (the big gauge reading). Mono. */
  numeral: { size: 104, weight: 700, lineHeight: 1, tracking: -3 },
} as const satisfies Record<string, TypeStep>;

// ─── Safe zones ─────────────────────────────────────────────────────────────

/**
 * Instagram Reels overlays chrome on the rendered 1080×1920 canvas: ~230px of
 * handle / sound / follow at the top and ~380px of caption, actions and the
 * progress bar at the bottom. Everything readable lives inside this inset;
 * symmetric horizontal padding keeps centred layouts on the true centreline.
 */
export const REEL_SAFE = { top: 250, bottom: 420, left: 60, right: 60 } as const;

/**
 * Cover insets. A portrait cover is cropped to a 4:5 tile in the profile grid
 * and in-feed, lopping ~285px off the top AND bottom of a 1080×1920 canvas;
 * anything that must survive the grid stays inside `gridCropGap` of each edge.
 */
export function gridCropGap(width: number, height: number): number {
  if (height <= width) return 0;
  return Math.round((height - (width * 5) / 4) / 2);
}

export const COVER_INSET = { square: 64, portrait: 72 } as const;

// ─── Copy ───────────────────────────────────────────────────────────────────
// Series labels and calls-to-action, in one place so a reel and its cover say
// the same thing. The Float Pick's label is the same whether the pick is live
// or the evergreen favourite: the caption says "Float Pick", so must the art.

export const WORDMARK = 'eddy.guide';

export const LABELS = {
  floatPick: 'Float Pick',
  eddySays: 'Eddy Says',
  riverReport: 'River Report',
  weekendForecast: 'Weekend Forecast',
  trend: '7-Day Trend',
  clip: 'On the Water',
  highWater: 'High Water',
  riversRising: 'Rivers Rising',
  floatTip: 'Float Tip',
  seasonalNote: 'Seasonal Note',
  announcement: 'Announcement',
  fromEddy: 'From Eddy',
} as const;

/** Button copy. Short, because the masthead already carries the wordmark. */
export const CTA = {
  plan: 'Plan this float →',
  find: 'Find your next float →',
  gauge: 'Check the live gauge →',
  chart: 'See the 7-day chart →',
  levels: 'See every river →',
  /** Points at the caption, not the site — rendered as text, not a button. */
  reportBelow: 'Full report below ▼',
} as const;

/** Tier-2 hero label for clips not tied to one of Eddy's rivers. */
export const OZARK_PADDLING_LABEL = 'Ozark Paddling';
/** Hero label for a high-water clip with no known river — flood footage is
 *  frequently out-of-region, so it must not fall back to a Missouri label. */
export const HIGH_WATER_LABEL = 'When Rivers Rise';
/** The safety payload under a high-water clip's button. */
export const SAFETY_DETAIL = 'Know the live level before you go';

// ─── Colour helpers ─────────────────────────────────────────────────────────

/** #RRGGBB × #RRGGBB linear mix (t: 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const ha = a.replace('#', '');
  const hb = b.replace('#', '');
  const k = Math.max(0, Math.min(1, t));
  const ch = (i: number) => {
    const va = parseInt(ha.slice(i, i + 2), 16);
    const vb = parseInt(hb.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * k).toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/** #RRGGBB → rgba() with the given alpha. */
export function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** WCAG relative luminance of a #RRGGBB colour (0 black … 1 white). */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const lin = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
}

/** Ink that reads on a filled swatch: dark ink on light fills (yellow, lime,
 *  the greys), white on dark ones (red, deep teal). */
export function inkOn(fill: string): string {
  return luminance(fill) > 0.32 ? colors.neutral[900] : '#FFFFFF';
}

/** A condition colour as TEXT on the light surface. The canonical hues are
 *  tuned for dark grounds; yellow and lime wash out on cream, so pull every
 *  hue a little toward the ink. The swatch itself stays canonical. */
export function conditionInk(solid: string, tone: SocialTone = 'light'): string {
  return tone === 'light' ? mixHex(solid, colors.neutral[900], 0.28) : solid;
}

/** Ground for the dark tone, washed faintly toward a condition colour so an
 *  alert's ground leans its own hue (High → orange, Flood → red) without
 *  becoming a repaint. */
export function severityGround(solid: string): string {
  return `linear-gradient(160deg, ${mixHex(colors.primary[900], solid, 0.2)} 0%, ${mixHex(colors.primary[900], solid, 0.08)} 45%, ${colors.primary[900]} 100%)`;
}
