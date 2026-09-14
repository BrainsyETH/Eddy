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

function recommendationCandidates({
  rivers,
  gauges,
  favoriteRiverIds,
  coords,
  radiusMiles = TODAY_RADIUS_MILES,
}: RecommendationInput): Candidate[] {
  const candidates = rivers
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

  return candidates
    .filter(
      (candidate) =>
        !coords ||
        (candidate.distanceMiles != null && candidate.distanceMiles <= radiusMiles),
    )
    .sort(compareCandidates);
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
  if (a.distanceMiles != null || b.distanceMiles != null) {
    const byDistance = (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
    if (byDistance !== 0) return byDistance;
  }
  const byAge = a.readingAgeHours - b.readingAgeHours;
  return byAge || a.river.name.localeCompare(b.river.name);
}

function reasonFor(candidate: Candidate, mode: RecommendationMode): string {
  if (mode === 'nearby' && candidate.distanceMiles != null) {
    const distance = candidate.distanceMiles < 10
      ? candidate.distanceMiles.toFixed(1)
      : Math.round(candidate.distanceMiles);
    return `≈ ${distance} mi to gauge`;
  }
  return 'Fresh gauge reading';
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
  const candidates = recommendationCandidates({
    rivers,
    gauges,
    favoriteRiverIds,
    coords,
    radiusMiles,
  });
  const challenger = candidates[0];
  if (!challenger) return null;

  let selected = challenger;
  const incumbent = candidates.find((candidate) => candidate.river.id === incumbentRiverId);
  if (incumbent && incumbent !== challenger) {
    const incumbentRank = floatableRank(incumbent.river.currentCondition?.code ?? 'unknown');
    const challengerRank = floatableRank(challenger.river.currentCondition?.code ?? 'unknown');
    if (incumbentRank === challengerRank) {
      if (!coords) {
        // Statewide has no meaningful distance threshold. Keep a still-fresh
        // same-band pick until it becomes ineligible or a better band appears.
        selected = incumbent;
      } else if (
        incumbent.distanceMiles != null &&
        challenger.distanceMiles != null &&
        incumbent.distanceMiles - challenger.distanceMiles < switchMarginMiles
      ) {
        selected = incumbent;
      }
    }
  }

  const mode: RecommendationMode = coords ? 'nearby' : 'statewide';
  return { ...selected, mode, reason: reasonFor(selected, mode) };
}

/**
 * Returns a stable lead recommendation followed by the next best discovery
 * candidates. The lead uses the same anti-flapping rule as the original
 * single-card picker; the rest remain in ranked order so the swipe rail is
 * predictable and never repeats the first card.
 */
export function chooseTodayRecommendations(
  input: RecommendationInput,
  limit = 3,
): TodayRecommendation[] {
  if (limit <= 0) return [];

  const lead = chooseTodayRecommendation(input);
  if (!lead) return [];

  const mode: RecommendationMode = input.coords ? 'nearby' : 'statewide';
  const remaining = recommendationCandidates(input)
    .filter((candidate) => candidate.river.id !== lead.river.id)
    .slice(0, limit - 1)
    .map((candidate) => ({ ...candidate, mode, reason: reasonFor(candidate, mode) }));

  return [lead, ...remaining];
}
