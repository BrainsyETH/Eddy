// src/lib/og/colors.ts
// Brand colors and status utilities for OG images

import type { ConditionCode, StatusStyle } from './types';
import { CONDITION_SYSTEM } from '@shared/condition-system';

/** #RRGGBB → rgba() with the given alpha. */
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Lighten a #RRGGBB toward white by `amt` (0..1) for gradient endpoints. */
function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const ch = (i: number) =>
    Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) + 255 * amt));
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(ch(0))}${to(ch(2))}${to(ch(4))}`;
}

function def(status: ConditionCode) {
  return CONDITION_SYSTEM[status as keyof typeof CONDITION_SYSTEM] ?? CONDITION_SYSTEM.unknown;
}

export const BRAND_COLORS = {
  // Brand core
  adventureNight: '#161748',
  greenTreeline: '#478559',
  bluewater: '#39a0ca',
  accentCoral: '#F07052',

  // Extended palette
  deepWater: '#0B2545',
  riverBlue: '#1B4965',
  skyBlue: '#62B6CB',
  mossGreen: '#81B29A',
  shallowBlue: '#BEE9E8',
  sandbar: '#F4F1DE',
} as const;

// Condition colors are derived from the CANONICAL condition system
// (shared/condition-system.ts) so OG covers can never drift from the app + reel.
// Previously this hardcoded flowing as #059669 (emerald-600) while the canonical
// "Eddy green" is #10b981 (emerald-500) — a visible mismatch between cover and reel.
export const STATUS_COLORS: Record<ConditionCode, string> = Object.fromEntries(
  (Object.keys(CONDITION_SYSTEM) as ConditionCode[]).map((code) => [code, def(code).solid]),
) as Record<ConditionCode, string>;

export function getStatusStyles(status: ConditionCode): StatusStyle {
  const d = def(status);
  return {
    solid: d.solid,
    text: d.solid,
    bg: d.bg,
    border: hexToRgba(d.solid, 0.3),
    label: d.label,
  };
}

export function getStatusGradient(status: ConditionCode): [string, string] {
  const solid = def(status).solid;
  return [solid, lighten(solid, 0.18)];
}

/** #RRGGBB × #RRGGBB linear mix (t: 0 → a, 1 → b). */
function mixHex(a: string, b: string, t: number): string {
  const ha = a.replace('#', '');
  const hb = b.replace('#', '');
  const ch = (i: number) => {
    const va = parseInt(ha.slice(i, i + 2), 16);
    const vb = parseInt(hb.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * Math.max(0, Math.min(1, t)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/**
 * Cover background with a FAINT condition wash over the brand teal, so the
 * grid reads the condition at a glance: High leans orange, Dangerous leans
 * red, low water leans amber, floatable conditions stay close to the default
 * blue-green. Deliberately subtle (≤18% blend at the top, fading out) — a
 * tint, not a repaint. Blended into a single-layer gradient because Satori
 * (next/og) doesn't support multi-layer background shorthand.
 */
export function conditionCoverBackground(status: ConditionCode): string {
  const base = '#1A3D40';
  const deep = '#0d2a2c';
  const solid = def(status).solid;
  const washTop = mixHex(base, solid, 0.18);
  const washMid = mixHex(base, solid, 0.08);
  return `linear-gradient(160deg, ${washTop} 0%, ${washMid} 45%, ${deep} 100%)`;
}

// Background gradient for cards
export const CARD_BACKGROUND = 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)';

// Float plan card background
export const FLOAT_PLAN_BACKGROUND = '#1A3D40';
