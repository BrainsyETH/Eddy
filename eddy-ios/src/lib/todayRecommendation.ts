import type { MapGauge, RiverListItem } from '@eddy/types';
import { hasCoordinates } from '@eddy/types';
import { milesBetween, type Coords } from '@eddy/geo';
import { isReadingStale } from '@eddy/conditions/reading-staleness';
import { floatableRank, isFloatableNow } from '../theme/conditions';
import { primaryReading } from './readingCopy';

export const TODAY_RADIUS_MILES = 75;
export const TODAY_SWITCH_MARGIN_MILES = 10;

export type RecommendationMode = 'nearby' | 'statewide';

export interface TodayRecommendation {
  river: RiverListItem;
  gauge: MapGauge | null;
  distanceMiles: number | null;
  mode: RecommendationMode;
  reason: string;
}

interface Candidate {
  river: RiverListItem;
  gauge: MapGauge | null;
  distanceMiles: number | null;
  readingAgeHours: number;
}

interface RecommendationInput {
  rivers: RiverListItem[];
  gauges: MapGauge[];
  favoriteRiverIds: ReadonlySet<string>;
  coords: Coords | null;
  incumbentRiverId?: string | null;
  radiusMiles?: number;
  switchMarginMiles?: number;
}

function primaryGaugeForRiver(gauges: MapGauge[], riverId: string): MapGauge | null {
  let fallback: MapGauge | null = null;
  for (const gauge of gauges) {
    const link = gauge.thresholds?.find((threshold) => threshold.riverId === riverId);
    if (!link) continue;
    if (link.isPrimary) return gauge;
    fallback ??= gauge;
  }
  return fallback;
}

/** Positive guidance requires a fresh, usable reading in the canonical safe bucket. */
export function isTodayRecommendationEligible(river: RiverListItem): boolean {
  const condition = river.currentCondition;
  return Boolean(
    condition &&
      isFloatableNow(condition.code) &&
      primaryReading(condition) &&
      !isReadingStale(condition.readingAgeHours),
  );
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const byCondition =
    floatableRank(a.river.currentCondition?.code ?? 'unknown') -
    floatableRank(b.river.currentCondition?.code ?? 'unknown');
  if (byCondition !== 0) return byCondition;
  const byDistance = (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
  if (byDistance !== 0) return byDistance;
  const byAge = a.readingAgeHours - b.readingAgeHours;
  return byAge || a.river.name.localeCompare(b.river.name);
}

function reasonFor(candidate: Candidate, mode: RecommendationMode): string {
  const water = candidate.river.currentCondition?.code === 'good' ? 'Good water' : 'Flowing water';
  if (mode === 'nearby' && candidate.distanceMiles != null) {
    const distance = candidate.distanceMiles < 10
      ? candidate.distanceMiles.toFixed(1)
      : Math.round(candidate.distanceMiles);
    return `${water} nearby · ≈ ${distance} mi to its gauge`;
  }
  return `${water} with a fresh gauge reading`;
}

/**
 * Picks discovery, not a duplicate favorite. Condition band wins before
 * distance. Within one band an incumbent remains until another river is at
 * least `switchMarginMiles` closer, preventing the card from flapping as a
 * coarse location fix or two readings arrive in a different order.
 */
export function chooseTodayRecommendation({
  rivers,
  gauges,
  favoriteRiverIds,
  coords,
  incumbentRiverId = null,
  radiusMiles = TODAY_RADIUS_MILES,
  switchMarginMiles = TODAY_SWITCH_MARGIN_MILES,
}: RecommendationInput): TodayRecommendation | null {
  let candidates = rivers
    .filter((river) => !favoriteRiverIds.has(river.id) && isTodayRecommendationEligible(river))
    .map<Candidate>((river) => {
      const gauge = primaryGaugeForRiver(gauges, river.id);
      const distanceMiles =
        coords && gauge && hasCoordinates(gauge) ? milesBetween(coords, gauge.coordinates) : null;
      return {
        river,
        gauge,
        distanceMiles,
        readingAgeHours: river.currentCondition?.readingAgeHours ?? Infinity,
      };
    });

  if (coords) {
    candidates = candidates.filter(
      (candidate) => candidate.distanceMiles != null && candidate.distanceMiles <= radiusMiles,
    );
  }
  candidates.sort(compareCandidates);
  const challenger = candidates[0];
  if (!challenger) return null;

  let selected = challenger;
  const incumbent = candidates.find((candidate) => candidate.river.id === incumbentRiverId);
  if (incumbent && incumbent !== challenger) {
    const incumbentRank = floatableRank(incumbent.river.currentCondition?.code ?? 'unknown');
    const challengerRank = floatableRank(challenger.river.currentCondition?.code ?? 'unknown');
    if (
      incumbentRank === challengerRank &&
      incumbent.distanceMiles != null &&
      challenger.distanceMiles != null &&
      incumbent.distanceMiles - challenger.distanceMiles < switchMarginMiles
    ) {
      selected = incumbent;
    }
  }

  const mode: RecommendationMode = coords ? 'nearby' : 'statewide';
  return { ...selected, mode, reason: reasonFor(selected, mode) };
}
