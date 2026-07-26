// eddy-ios/src/theme/conditions.ts
// Condition colours and copy for the app.
//
// Mirrors the web palette in shared/condition-system.ts. Kept as a small local
// map rather than imported because the web version pulls in Tailwind token
// plumbing the app has no use for — but the CODES come from @eddy/types, so the
// two can never disagree about the vocabulary itself, only the styling.

import type { ConditionCode } from '@eddy/types';

export const CONDITION_COLOR: Record<ConditionCode, string> = {
  dangerous: '#DC2626',
  high: '#EA580C',
  flowing: '#0EA5E9',
  good: '#16A34A',
  low: '#CA8A04',
  too_low: '#78716C',
  unknown: '#9CA3AF',
};

export const CONDITION_LABEL: Record<ConditionCode, string> = {
  dangerous: 'Dangerous',
  high: 'High Water',
  flowing: 'Ideal',
  good: 'Floatable',
  low: 'Low',
  too_low: 'Too Low',
  unknown: 'Unknown',
};

export const COLORS = {
  bg: '#0B1220',
  card: '#151E2E',
  border: '#233047',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  accent: '#0EA5E9',
};
