import type { MapGauge, RiverListItem } from '@eddy/types';
import { hasCoordinates } from '@eddy/types';
import { floatableRank, isFloatableNow } from '../theme/conditions';
import { milesBetween, type Coords } from './geoDistance';
import { primaryReading } from './readingCopy';

export const TODAY_RADIUS_MILES = 75;
export const TODAY_MAX_READING_AGE_HOURS = 12;

export type RecommendationMode = 'favorite' | 'nearby' | 'statewide';

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
  radiusMiles?: number;
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

/**
 * A Today recommendation is deliberately stricter than a browse result.
 * High water may be interesting to an expert, but a filled "Plan this float"
 * button is positive guidance, so only the canonical flowing/good bucket is
 * eligible. A missing or old reading is a visible row, never a hero.
 */
export function isTodayRecommendationEligible(river: RiverListItem): boolean {
  const condition = river.currentCondition;
  if (!condition || !isFloatableNow(condition.code)) return false;
  if (!primaryReading(condition)) return false;
  return (
    condition.readingAgeHours != null &&
    condition.readingAgeHours >= 0 &&
    condition.readingAgeHours <= TODAY_MAX_READING_AGE_HOURS
  );
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const rank =
    floatableRank(a.river.currentCondition?.code ?? 'unknown') -
    floatableRank(b.river.currentCondition?.code ?? 'unknown');
  if (rank !== 0) return rank;

  if (a.distanceMiles != null || b.distanceMiles != null) {
    const distance = (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
    if (distance !== 0) return distance;
  }

  const age = a.readingAgeHours - b.readingAgeHours;
  return age || a.river.name.localeCompare(b.river.name);
}

export function chooseTodayRecommendation({
  rivers,
  gauges,
  favoriteRiverIds,
  coords,
  radiusMiles = TODAY_RADIUS_MILES,
}: RecommendationInput): TodayRecommendation | null {
  const candidates = rivers.filter(isTodayRecommendationEligible).map<Candidate>((river) => {
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

  const favorite = candidates
    .filter((candidate) => favoriteRiverIds.has(candidate.river.id))
    .sort(compareCandidates)[0];
  if (favorite) {
    return {
      ...favorite,
      mode: 'favorite',
      reason: favorite.distanceMiles == null
        ? 'Your best suitable favorite'
        : 'Closest favorite with good water',
    };
  }

  if (coords) {
    const nearby = candidates
      .filter(
        (candidate) =>
          candidate.distanceMiles != null && candidate.distanceMiles <= radiusMiles,
      )
      .sort(compareCandidates)[0];
    if (nearby) {
      return {
        ...nearby,
        mode: 'nearby',
        reason: `Closest suitable river within ${radiusMiles} mi`,
      };
    }
  }

  const statewide = candidates.sort(compareCandidates)[0];
  return statewide
    ? {
        ...statewide,
        mode: 'statewide',
        reason: 'Best current water Eddy tracks',
      }
    : null;
}
