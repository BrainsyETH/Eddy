// src/lib/national-map/theme.ts
// Canvas colors for the national River Map, light and dark.
//
// Canvas cannot read CSS custom properties per stroke, so the map's palette is
// a typed object here; every value is an Eddy token (tailwind.config.ts /
// globals.css) or a documented derivative of one.
//
// ── Three vocabularies, three palettes, never mixed ─────────────────────────
//   * Flow comparison: FLOW_BAND_SYSTEM (shared/flow-band.ts), unchanged —
//     warm stone at the dry end, the brand teal ramp toward wet, and a separate
//     unknown. Its five-band order is the learned scale; dark mode keeps every
//     color and adds a keyline instead of re-mapping (see FLOW_KEYLINE).
//   * Official flood categories: NWS's own hue order — action yellow, minor
//     orange, moderate red, major purple — the colors on every NWS hydrograph,
//     tuned only for contrast on parchment and deep teal. Shape differs per
//     category too (marks.ts), so color is never the only signal.
//   * Coral (#F07052) is Eddy's identity and the web CTA. It carries NO data
//     meaning on this map — in particular not "high flow".

import { FLOW_BAND_SYSTEM, type FlowBand } from '@shared/flow-band';

export type MapTheme = 'light' | 'dark';

export interface MapPalette {
  background: string;
  land: string;
  coast: string;
  stateLine: string;
  lake: string;
  river: string;
  /** Alpha of a river line by Strahler order (index = order). */
  riverAlpha: number[];
  /** The moving highlight of a downstream trace. */
  trace: string;
  flow: Record<FlowBand, string>;
  /** Live reading, no seasonal comparison: a ring, never a band fill. */
  noComparison: string;
  /** Stale or suspect: neutral hollow mark. */
  stale: string;
  /** Keyline drawn around filled flow marks. */
  flowKeyline: string;
  flood: {
    action: string;
    minor: string;
    moderate: string;
    major: string;
    below: string;
    noThreshold: string;
    notCurrent: string;
  };
  floodKeyline: string;
  selection: string;
  label: string;
  labelHalo: string;
}

const FLOW = Object.fromEntries(
  (Object.keys(FLOW_BAND_SYSTEM) as FlowBand[]).map((b) => [b, FLOW_BAND_SYSTEM[b].solid]),
) as Record<FlowBand, string>;

export const PALETTES: Record<MapTheme, MapPalette> = {
  light: {
    background: '#FAF8F4', // secondary-50
    land: '#F2EAD8', // parchment
    coast: '#C9B391', // secondary-400
    stateLine: '#D9C9B0', // secondary-300
    lake: '#E3EEF0', // between primary-50 and primary-100: water, quieter than rivers
    river: '#2D7889', // primary-500
    riverAlpha: [0, 0.22, 0.28, 0.34, 0.45, 0.62, 0.78, 0.92],
    trace: 'rgba(250, 248, 244, 0.95)',
    flow: FLOW,
    noComparison: '#A49C8E', // neutral-400
    stale: '#C2BAAC', // neutral-300
    // The pale bands (stone, primary-200) sit near parchment; a warm-ink
    // keyline keeps them findable without changing their color.
    flowKeyline: 'rgba(45, 42, 36, 0.38)',
    flood: {
      action: '#D9A400',
      minor: '#E07B00',
      moderate: '#C8102E',
      major: '#8E3CCB',
      below: '#72B5C4', // primary-300: an NWS gauge reporting, below flood stage
      noThreshold: '#C2BAAC', // neutral-300
      notCurrent: '#A49C8E',
    },
    floodKeyline: 'rgba(45, 42, 36, 0.7)',
    selection: '#2D2A24',
    label: '#524D43',
    labelHalo: 'rgba(242, 234, 216, 0.9)',
  },
  dark: {
    background: '#0A2128',
    land: '#0F2D35', // primary-900
    coast: '#2B5966',
    stateLine: '#1D4652',
    lake: '#0A2128',
    river: '#72B5C4', // primary-300
    riverAlpha: [0, 0.16, 0.2, 0.26, 0.36, 0.5, 0.66, 0.82],
    trace: 'rgba(242, 234, 216, 0.9)',
    flow: FLOW,
    noComparison: '#A49C8E',
    stale: '#6B6459',
    // FLOW_KEYLINE in dark: Higher (#256574) and Much higher (#163F4A) are the
    // brand's deepest teals and vanish on a deep-teal map. A parchment keyline
    // keeps every band visible while the fill — the learned meaning — stays.
    flowKeyline: 'rgba(242, 234, 216, 0.85)',
    flood: {
      action: '#F2C230',
      minor: '#FF9A2E',
      moderate: '#FF4D5E',
      major: '#C77DFF',
      below: '#4A9AAD',
      noThreshold: '#524D43',
      notCurrent: '#6B6459',
    },
    floodKeyline: 'rgba(242, 234, 216, 0.85)',
    selection: '#F2EAD8',
    label: '#C2BAAC',
    labelHalo: 'rgba(15, 45, 53, 0.9)',
  },
};

