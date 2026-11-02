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
  /**
   * Alpha of a soft, wide underglow on the trunk rivers (orders 6–7); 0 = none.
   * Wall only: it makes the network the brightest non-event layer on a TV.
   */
  riverGlow: number;
  /** Knockout disc behind event marks (MarkStyle.halo): the land colour. */
  halo: string;
  /**
   * "Follow the river" (journeys.ts): the travelling highlight's bright core
   * and its soft underglow. Presentation, not data — never a flow colour,
   * never coral.
   */
  journeyCore: string;
  journeyGlow: string;
  /**
   * Opacity of the underglow. Dark: a soft halo. Light: a near-opaque white
   * casing — ink on ink would vanish among the wall's dark rivers, so the
   * route reads like a selected road instead.
   */
  journeyGlowAlpha: number;
  flow: Record<FlowBand, string>;
  /**
   * The rarest high readings (marks.ts EXTREME_HIGH). In the Eddy set this is
   * Much higher's own colour (size is the cue); the vivid prototype gives
   * them pale ice, and the legend then lists them as their own row.
   */
  flowExtremeHigh: string;
  /** Live reading, no seasonal comparison: a ring, never a band fill. */
  noComparison: string;
  /** Stale or suspect: neutral hollow mark. */
  stale: string;
  /** Keyline drawn around filled flow marks. */
  flowKeyline: string;
  /**
   * Mark colours that cannot be seen against this theme's land (contrast under
   * 3:1) and are therefore drawn on a neutral backing disc. The fill keeps its
   * canonical colour — the backing is what makes it visible, not a new hue.
   */
  backed: string[];
  backing: string;
  /**
   * Opacity of a backed fill over its backing. Every band is composited the
   * same way over the same chip, so their light→dark order is preserved
   * exactly while the darkest bands lift off dark land (1.0 = no change).
   */
  backedFillAlpha: number;
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
    flowExtremeHigh: FLOW.much_higher,
    riverGlow: 0,
    halo: '#F2EAD8',
    journeyCore: '#0E4A57', // between primary-700 and -800: ink on parchment
    journeyGlow: '#FFFFFF',
    journeyGlowAlpha: 0.95,
    flow: FLOW,
    // Hollow marks use neutral-500, never the stone of "much lower"
    // (#A49C8E): "unusually dry" and "no comparison" differ in colour as well
    // as fill, and the quietest colour that still clears 3:1 on parchment (3.4)
    // keeps 2,900 uncompared gauges from crowding the field. "Not current" is
    // the same colour, drawn smaller.
    noComparison: '#857D70', // neutral-500
    stale: '#857D70', // neutral-500
    // The pale bands (stone, primary-200) sit near parchment; a warm-ink
    // keyline (4.9:1 at this alpha) keeps every filled mark above 3:1
    // without changing its colour.
    flowKeyline: 'rgba(45, 42, 36, 0.7)',
    backed: [],
    backing: '#F2EAD8',
    backedFillAlpha: 1,
    flood: {
      action: '#D9A400',
      minor: '#E07B00',
      moderate: '#C8102E',
      major: '#8E3CCB',
      // Context, deliberately quiet (documented exception to the 3:1 floor):
      // a reporting NWS gauge below flood stage carries no event.
      below: '#72B5C4', // primary-300
      noThreshold: '#857D70', // neutral-500
      notCurrent: '#857D70',
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
    flowExtremeHigh: FLOW.much_higher,
    riverGlow: 0,
    halo: '#0F2D35',
    journeyCore: '#F2FBFD',
    journeyGlow: '#8FD3E0',
    journeyGlowAlpha: 0.28,
    flow: FLOW,
    // Thin neutral-500 rings: dim enough never to read as a lit band, still
    // 3.6:1 against deep-teal land.
    noComparison: '#857D70',
    stale: '#857D70',
    // Higher (#256574, 2.2:1) and Much higher (#163F4A, 1.3:1) are the brand's
    // deepest teals and vanish on deep-teal land. Neither a keyline nor a
    // backing disc fixed it: at 2–5 px any fill as dark as the land reads as
    // a hollow ring (the shape reserved for "no comparison"). So these two sit
    // on a sand chip with their canonical fill composited at 72% over it: the
    // centres land at relative luminance ~0.22 and ~0.13, still darker than
    // Normal (#4A9AAD, ~0.28) and in the same order, so the five-band
    // light→dark ordering holds while the wettest gauges read as filled,
    // outlined marks. The three lighter bands are visible on dark land as they
    // are. Chosen in the 2026-11-02 review; sign-off belongs to the
    // dark-contrast gate in docs/national-river-map.md.
    flowKeyline: 'rgba(242, 234, 216, 0.55)',
    backed: ['flow.higher', 'flow.much_higher', 'flowExtremeHigh'],
    backing: '#E8DFD0', // secondary-200
    backedFillAlpha: 0.72,
    flood: {
      action: '#F2C230',
      minor: '#FF9A2E',
      moderate: '#FF4D5E',
      major: '#C77DFF',
      below: '#4A9AAD',
      noThreshold: '#857D70',
      notCurrent: '#857D70',
    },
    floodKeyline: 'rgba(242, 234, 216, 0.85)',
    selection: '#F2EAD8',
    label: '#C2BAAC',
    labelHalo: 'rgba(15, 45, 53, 0.9)',
  },
};


// ── Wall (fullscreen) variant ───────────────────────────────────────────────
// Three brightness tiers, so land, water and events separate across a room:
// land drops back (state lines nearly disappear), the river network becomes
// the brightest non-event layer, and only events carry saturated colour at
// full strength. Mark colours are NOT changed here — the legend stays true.
const WALL_OVERRIDES: Record<MapTheme, Partial<MapPalette>> = {
  light: {
    land: '#F4EEE1',
    coast: '#CDB896',
    stateLine: '#E6DAC6',
    lake: '#D3E6EA',
    river: '#1F6574', // primary-600: the network reads as ink on parchment
    riverAlpha: [0, 0.3, 0.38, 0.46, 0.58, 0.74, 0.88, 0.97],
    riverGlow: 0.1,
    halo: '#F4EEE1',
  },
  dark: {
    background: '#071A20',
    land: '#0B252C',
    coast: '#1F4A55',
    stateLine: '#143843',
    lake: '#071A20',
    river: '#8FD3E0', // brighter than primary-300 so water outranks land
    riverAlpha: [0, 0.22, 0.28, 0.36, 0.48, 0.64, 0.82, 0.96],
    riverGlow: 0.14,
    trace: 'rgba(250, 248, 244, 0.95)',
    halo: '#0B252C',
  },
};

export function wallPalette(theme: MapTheme): MapPalette {
  return { ...PALETTES[theme], ...WALL_OVERRIDES[theme] };
}

// ── Vivid Flow colours (opt-in prototype) ───────────────────────────────────
// A broader, diverging Flow ramp for wall displays: warm copper / sand for
// unusually low, a subdued teal for normal (the quiet middle), bright cyan
// for high and pale ice for the rarest highs. Same five bands, same
// thresholds, same order — only the colours differ, and the legend draws
// from the same palette. Dark mode needs no backing chip: every band is
// visible on deep-teal land by itself. Light mode inverts the intensity
// (on parchment, "brighter" means deeper), so its rarest highs are deep ink.
// Flooding never changes: NWS categories keep NWS colours in every set.
const VIVID_FLOW: Record<MapTheme, { flow: Record<FlowBand, string>; extremeHigh: string }> = {
  dark: {
    flow: { much_lower: '#E07A3F', lower: '#C9A77C', normal: '#2F6F7C', higher: '#2EC4D6', much_higher: '#7FE7F2' },
    extremeHigh: '#E8FBFF',
  },
  light: {
    flow: { much_lower: '#B4541F', lower: '#C9975B', normal: '#8DB3BA', higher: '#1A93A8', much_higher: '#0B6577' },
    extremeHigh: '#063A45',
  },
};

export function withFlowColors(p: MapPalette, theme: MapTheme, colors: 'eddy' | 'vivid'): MapPalette {
  if (colors === 'eddy') return p;
  const v = VIVID_FLOW[theme];
  return { ...p, flow: v.flow, flowExtremeHigh: v.extremeHigh, backed: p.backed.filter((k) => !k.startsWith('flow')) };
}
