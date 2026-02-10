// src/lib/og/colors.ts
// Brand colors and status utilities for OG images

import type { ConditionCode, StatusStyle } from './types';

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

export const STATUS_COLORS: Record<ConditionCode, string> = {
  too_low: '#9ca3af',
  low: '#eab308',
  okay: '#84cc16',
  optimal: '#059669',
  high: '#f97316',
  dangerous: '#ef4444',
  unknown: '#9ca3af',
};

export function getStatusStyles(status: ConditionCode): StatusStyle {
  const styles: Record<ConditionCode, StatusStyle> = {
    too_low: {
      solid: '#9ca3af',
      text: '#9ca3af',
      bg: 'rgba(156,163,175,0.15)',
      border: 'rgba(156,163,175,0.3)',
      label: 'Too Low',
    },
    low: {
      solid: '#eab308',
      text: '#eab308',
      bg: 'rgba(234,179,8,0.15)',
      border: 'rgba(234,179,8,0.3)',
      label: 'Low',
    },
    okay: {
      solid: '#84cc16',
      text: '#84cc16',
      bg: 'rgba(132,204,22,0.15)',
      border: 'rgba(132,204,22,0.3)',
      label: 'Okay',
    },
    optimal: {
      solid: '#059669',
      text: '#059669',
      bg: 'rgba(5,150,105,0.2)',
      border: 'rgba(5,150,105,0.35)',
      label: 'Optimal',
    },
    high: {
      solid: '#f97316',
      text: '#f97316',
      bg: 'rgba(249,115,22,0.2)',
      border: 'rgba(249,115,22,0.3)',
      label: 'High',
    },
    dangerous: {
      solid: '#ef4444',
      text: '#ef4444',
      bg: 'rgba(239,68,68,0.15)',
      border: 'rgba(239,68,68,0.25)',
      label: 'Flood',
    },
    unknown: {
      solid: '#9ca3af',
      text: '#9ca3af',
      bg: 'rgba(156,163,175,0.15)',
      border: 'rgba(156,163,175,0.3)',
      label: 'N/A',
    },
  };
  return styles[status];
}

export function getStatusGradient(status: ConditionCode): [string, string] {
  const gradients: Record<ConditionCode, [string, string]> = {
    too_low: ['#9ca3af', '#b8bfc7'],
    low: ['#eab308', '#fbbf24'],
    okay: ['#84cc16', '#a3e635'],
    optimal: ['#059669', '#10b981'],
    high: ['#f97316', '#fb923c'],
    dangerous: ['#ef4444', '#f87171'],
    unknown: ['#9ca3af', '#b8bfc7'],
  };
  return gradients[status];
}

// Background gradient for cards
export const CARD_BACKGROUND = 'linear-gradient(135deg, #161748 0%, #1a1f5c 50%, #1B4965 100%)';

// Float plan card background
export const FLOAT_PLAN_BACKGROUND = '#1A3D40';
