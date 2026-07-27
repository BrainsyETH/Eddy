// shared/threshold-zones.ts
// Single definition of the condition ladder: the ordered bands a river's
// thresholds carve out, and where a reading sits on them.
//
// Three surfaces render this ladder now — the web reading card draws the compact
// band track, the web levels table lists the bands in full, and the iOS river
// screen draws the same track. They used to derive the bands independently,
// which is one edit away from disagreeing about where "Flowing" starts.
//
// LIVES IN shared/ FOR THE SAME REASON condition-system.ts DOES: eddy-ios reaches
// this folder through Metro watchFolders (see eddy-ios/metro.config.js) and the
// @shared/* alias, so the phone runs this exact code rather than a port of it.
// It therefore must keep ZERO imports outside this folder — no '@/constants', no
// React — which is why the colours are read straight off CONDITION_SYSTEM and the
// default descriptions are owned here.
//
// Bands are drawn at EQUAL width regardless of their numeric range. A marker
// position is therefore "how far through this band", not "how much water" —
// deliberate, because Flood (5,000+) would otherwise consume most of the track
// on every river and compress the bands people actually float in to nothing.
// That property matters more since most rivers are graded in cfs, where the
// flood band can be an order of magnitude wide.

import { CONDITION_SYSTEM } from './condition-system';

/** Copy shown when a gauge carries no hand-written band description. */
export const DEFAULT_THRESHOLD_DESCRIPTIONS: Record<string, string> = {
  tooLow: 'Expect frequent dragging on gravel bars. Recommended for wading only.',
  low: 'Floatable but expect occasional scraping. Lighter boats recommended.',
  good: 'Floatable conditions. Some shallow spots possible.',
  flowing: 'Flowing conditions. All boats clear, gentle current, crystal clear water.',
  high: 'Moving quick. Experienced paddlers only; expect submerged obstacles and root-balls.',
  flood: 'Dangerous. High water, heavy debris, and flood warnings usually in effect.',
};

const CONDITION_COLORS = Object.fromEntries(
  Object.entries(CONDITION_SYSTEM).map(([code, def]) => [code, def.solid]),
) as Record<string, string>;

export interface ThresholdValues {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

export interface ThresholdDescriptions {
  tooLow?: string;
  low?: string;
  good?: string;
  flowing?: string;
  high?: string;
  flood?: string;
}

export interface Zone {
  /** Matches the condition code, so `currentCondition` selects a band directly. */
  key: string;
  label: string;
  color: string;
  min: number;
  max: number;
  description: string;
  /** Flood is open-ended; its `max` is synthetic and must not be printed. */
  openEnded: boolean;
}

export function buildZones(
  tv: ThresholdValues,
  descriptions?: ThresholdDescriptions | null,
): Zone[] {
  const zones: Zone[] = [];

  if (tv.levelTooLow !== null) {
    zones.push({
      key: 'too_low',
      label: 'Too Low',
      color: CONDITION_COLORS.too_low,
      min: 0,
      max: tv.levelTooLow,
      description: descriptions?.tooLow || DEFAULT_THRESHOLD_DESCRIPTIONS.tooLow,
      openEnded: false,
    });
  }

  if (tv.levelLow !== null) {
    zones.push({
      key: 'low',
      label: 'Low',
      color: CONDITION_COLORS.low,
      min: tv.levelTooLow ?? 0,
      max: tv.levelLow,
      description: descriptions?.low || DEFAULT_THRESHOLD_DESCRIPTIONS.low,
      openEnded: false,
    });
  }

  if (tv.levelOptimalMin !== null) {
    zones.push({
      key: 'good',
      label: 'Good',
      color: CONDITION_COLORS.good,
      min: tv.levelLow ?? tv.levelTooLow ?? 0,
      max: tv.levelOptimalMin,
      description: descriptions?.good || DEFAULT_THRESHOLD_DESCRIPTIONS.good,
      openEnded: false,
    });
  }

  if (tv.levelOptimalMin !== null && tv.levelOptimalMax !== null) {
    zones.push({
      key: 'flowing',
      label: 'Flowing',
      color: CONDITION_COLORS.flowing,
      min: tv.levelOptimalMin,
      max: tv.levelOptimalMax,
      description: descriptions?.flowing || DEFAULT_THRESHOLD_DESCRIPTIONS.flowing,
      openEnded: false,
    });
  }

  if (tv.levelHigh !== null || tv.levelDangerous !== null) {
    const highStart = tv.levelOptimalMax ?? tv.levelHigh ?? 0;
    const highEnd = tv.levelDangerous ?? highStart * 2;
    zones.push({
      key: 'high',
      label: 'High',
      color: CONDITION_COLORS.high,
      min: highStart,
      max: highEnd,
      description: descriptions?.high || DEFAULT_THRESHOLD_DESCRIPTIONS.high,
      openEnded: false,
    });
  }

  if (tv.levelDangerous !== null) {
    zones.push({
      key: 'dangerous',
      label: 'Flood',
      color: CONDITION_COLORS.dangerous,
      min: tv.levelDangerous,
      // Synthetic upper bound so the marker has somewhere to travel; never shown.
      max: tv.levelDangerous * 1.5,
      description: descriptions?.flood || DEFAULT_THRESHOLD_DESCRIPTIONS.flood,
      openEnded: true,
    });
  }

  return zones;
}

export function formatZoneValue(value: number, unit: 'ft' | 'cfs'): string {
  return unit === 'cfs' ? Math.round(value).toLocaleString() : value.toFixed(2);
}

/** "300 – 900 cfs", or "5,000+ cfs" for the open-ended flood band. */
export function formatZoneRange(zone: Zone, unit: 'ft' | 'cfs'): string {
  if (zone.openEnded) return `${formatZoneValue(zone.min, unit)}+ ${unit}`;
  return `${formatZoneValue(zone.min, unit)} – ${formatZoneValue(zone.max, unit)} ${unit}`;
}

/**
 * Where `value` sits along the equal-width band track, 0–100. Bands are
 * contiguous by construction (each band's min is the previous band's max), so
 * the first band whose max clears the value is the one it belongs to.
 * Returns null when there is no reading to place.
 */
export function zoneMarkerPercent(zones: Zone[], value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || zones.length === 0) return null;

  const bandWidth = 100 / zones.length;
  if (value < zones[0].min) return 0;

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (value > zone.max && i < zones.length - 1) continue;
    const range = zone.max - zone.min;
    const fraction = range > 0 ? Math.min(1, Math.max(0, (value - zone.min) / range)) : 0.5;
    return Math.min(100, Math.max(0, i * bandWidth + fraction * bandWidth));
  }

  return 100;
}

export function findZoneIndex(zones: Zone[], key: string | null | undefined): number {
  if (!key) return -1;
  return zones.findIndex((z) => z.key === key);
}
