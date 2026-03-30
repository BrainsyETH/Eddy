// src/hooks/useConditionChrome.ts
// Sets browser theme-color and a CSS custom property for condition-themed page chrome

import { useEffect } from 'react';

const CHROME_COLORS: Record<string, string> = {
  flowing: '#0F4A3A',
  good: '#1A4A2E',
  low: '#4A3D0F',
  too_low: '#3F3B33',
  high: '#4A2A0F',
  dangerous: '#4A0F0F',
  unknown: '#163F4A',
};

const BORDER_COLORS: Record<string, string> = {
  flowing: '#059669',
  good: '#84cc16',
  low: '#eab308',
  too_low: '#78716c',
  high: '#f97316',
  dangerous: '#ef4444',
  unknown: '#1A1814',
};

const DEFAULT_THEME = '#163F4A';
const DEFAULT_BORDER = '#1A1814';

export function useConditionChrome(conditionCode: string | null) {
  useEffect(() => {
    if (!conditionCode) return;

    const themeColor = CHROME_COLORS[conditionCode] || DEFAULT_THEME;
    const borderColor = BORDER_COLORS[conditionCode] || DEFAULT_BORDER;

    // Update browser theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', themeColor);
    }

    // Set CSS custom property on document for header to read
    document.documentElement.style.setProperty('--chrome-accent', borderColor);

    return () => {
      if (meta) meta.setAttribute('content', DEFAULT_THEME);
      document.documentElement.style.setProperty('--chrome-accent', DEFAULT_BORDER);
    };
  }, [conditionCode]);
}
