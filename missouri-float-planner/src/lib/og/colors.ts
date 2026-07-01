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

// Background gradient for cards
export const CARD_BACKGROUND = 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)';

// Float plan card background
export const FLOAT_PLAN_BACKGROUND = '#1A3D40';
