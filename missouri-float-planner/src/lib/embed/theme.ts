// src/lib/embed/theme.ts
// Brand tokens for the embed widgets (client-safe, no deps).
//
// Widget bodies are deliberately inline-styled so they stay self-contained
// inside third-party iframes — but self-contained shouldn't mean off-brand.
// This palette maps the Organic Brutalist system (.stitch/DESIGN.md) onto the
// light/dark iframe themes: Deep River Teal chrome, warm-stone neutrals, hard
// offset shadows. The font variables are free inside the iframes because the
// embed routes render under the root layout, which sets --font-display /
// --font-body / --font-mono on <body>.

export interface EmbedPalette {
  bg: string;
  cardBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  /** Teal link color with adequate contrast on bg. */
  link: string;
  /** Sunset Coral — CTAs only. */
  accent: string;
  /** Hard offset shadow color (Organic Brutalist depth). */
  shadow: string;
  /** Subtle linked-cell hover surface. */
  hoverBg: string;
  /** High-visibility keyboard focus color. */
  focus: string;
  /** Neutral loading placeholder. */
  skeleton: string;
}

export function embedPalette(isDark: boolean): EmbedPalette {
  return isDark
    ? {
        bg: '#0F2D35', // deep river teal night, not generic #1a1a1a
        cardBg: '#163F4A',
        border: '#2D5660',
        textPrimary: '#E8F1F2',
        textSecondary: '#9DBAC1',
        link: '#7FC4D4',
        accent: '#F07052',
        shadow: 'rgba(0, 0, 0, 0.45)',
        hoverBg: '#1D525F',
        focus: '#A3D1DB',
        skeleton: '#2D5660',
      }
    : {
        bg: '#ffffff',
        cardBg: '#F7F6F3', // warm stone, not cool gray
        border: '#DBD5CA',
        textPrimary: '#2D2A24',
        textSecondary: '#6B665C',
        link: '#2D7889',
        accent: '#F07052',
        shadow: '#C2BAAC',
        hoverBg: '#EBF5F7',
        focus: '#2D7889',
        skeleton: '#DBD5CA',
      };
}

export const EMBED_FONTS = {
  /** Fredoka — the Eddy brand voice. Titles/verdicts only. */
  display: 'var(--font-display), system-ui, sans-serif',
  body: 'var(--font-body), system-ui, -apple-system, sans-serif',
  mono: 'var(--font-mono), ui-monospace, monospace',
} as const;

/** Signature hard offset shadow (buttons, condition pills). */
export function embedShadow(p: EmbedPalette): string {
  return `2px 2px 0 ${p.shadow}`;
}
