// shared/trend-meta.ts
//
// Trend-direction styling (arrow + label + color) shared by the Weekly Trend
// reel (Remotion) and its OG cover (Next.js) so the two never drift. Pure TS —
// no React/Next/Remotion — so both build pipelines can consume it (the app via
// the "@shared/*" path, Remotion via a relative import).
//
// ── NOT shared/gauge-trend.ts, AND THE TWO MUST NOT BE MERGED ──────────────
// That module decides what a trend IS for the website and the app: it reads a
// series, classifies the move, and names it ("Rising fast", "Holding steady").
// This one decides only how an already-known direction is DRAWN in marketing
// artwork. They disagree on purpose, twice:
//
//   * the third direction is 'flat' here and 'steady' there;
//   * rising is GREEN here, and in the apps rising is never green — on a river
//     approaching flood "rising fast" is the opposite of good news, so the
//     app's pill is muted ink and colour never encodes direction.
//
// A reel is a picture of a week that has already happened; a gauge badge is a
// safety claim about right now. Do not reach for DIRECTION_META from an app
// surface, and do not widen this vocabulary to match the other one.

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
