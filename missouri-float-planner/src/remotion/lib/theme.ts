// Brand design tokens from .stitch/DESIGN.md — reused for video compositions

import type { ConditionCode } from './types';

export const colors = {
  riverTeal: '#2D7889',
  riverTealLight: '#3A9BB0',
  riverTealDark: '#1E5A67',
  sunsetCoral: '#F07052',
  sunsetCoralLight: '#F4917A',
  sandbarTan: '#B89D72',
  sandbarTanLight: '#D4C4A0',
  trailGreen: '#4EB86B',
  warmWhite: '#FAF8F5',
  warmStone: '#E8E2D9',
  darkText: '#2C2824',
  mediumText: '#5C564E',
  white: '#FFFFFF',
} as const;

export const conditionColors: Record<ConditionCode, { bg: string; text: string; label: string }> = {
  optimal: { bg: '#4EB86B', text: '#FFFFFF', label: 'OPTIMAL' },
  okay: { bg: '#7EC89A', text: '#FFFFFF', label: 'OKAY' },
  low: { bg: '#E5C44B', text: '#2C2824', label: 'LOW' },
  too_low: { bg: '#9E9488', text: '#FFFFFF', label: 'TOO LOW' },
  high: { bg: '#F0A052', text: '#FFFFFF', label: 'HIGH' },
  dangerous: { bg: '#E05340', text: '#FFFFFF', label: 'DANGEROUS' },
  unknown: { bg: '#9E9488', text: '#FFFFFF', label: 'UNKNOWN' },
};

export const fonts = {
  display: 'Fredoka, sans-serif', // Eddy branding
  body: 'Geist Sans, sans-serif',
} as const;

// 1080x1920 (9:16 portrait for Reels)
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
