// shared/trend-meta.ts
//
// Trend-direction styling (arrow + label + color) shared by the Weekly Trend
// reel (Remotion) and its OG cover (Next.js) so the two never drift. Pure TS —
// no React/Next/Remotion — so both build pipelines can consume it (the app via
// the "@shared/*" path, Remotion via a relative import).

export type TrendDirection = 'rising' | 'falling' | 'flat';

export interface TrendMeta {
  arrow: string;
  label: string;
  color: string;
}

export const DIRECTION_META: Record<TrendDirection, TrendMeta> = {
  rising: { arrow: '▲', label: 'Rising', color: '#10b981' },
  falling: { arrow: '▼', label: 'Falling', color: '#f97316' },
  flat: { arrow: '—', label: 'Steady', color: '#84cc16' },
};

/** Resolve a (possibly unknown) direction string to its styling (falls back to flat). */
export function trendMeta(direction: string | null | undefined): TrendMeta {
  return DIRECTION_META[direction as TrendDirection] ?? DIRECTION_META.flat;
}
