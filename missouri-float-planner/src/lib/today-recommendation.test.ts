import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapGauge, RiverListItem } from '@eddy/types';
import {
  chooseTodayRecommendation,
  isTodayRecommendationEligible,
} from '../../../eddy-ios/src/lib/todayRecommendation';

function river(
  id: string,
  code: NonNullable<RiverListItem['currentCondition']>['code'],
  age = 1,
): RiverListItem {
  return {
    id,
    name: `River ${id}`,
    slug: `river-${id}`,
    lengthMiles: 10,
    description: null,
    difficultyRating: null,
    region: null,
    accessPointCount: 2,
    state: 'MO',
    riverType: 'spring_fed_float',
    path: `/rivers/missouri/river-${id}`,
    currentCondition: {
      label: code,
      code,
      thresholdUnit: 'ft',
      gaugeHeightFt: 2.1,
      dischargeCfs: null,
      readingAgeHours: age,
      trend: null,
    },
  };
}

function gauge(id: string, riverId: string, lng: number): MapGauge {
  return {
    id: `gauge-${id}`,
    usgsSiteId: id,
    name: `Gauge ${id}`,
    coordinates: { lat: 37, lng },
    gaugeHeightFt: 2.1,
    dischargeCfs: null,
    readingTimestamp: new Date().toISOString(),
    readingAgeHours: 1,
    readingSuspect: false,
    qualifierNote: null,
    thresholds: [{
      riverId,
      riverName: `River ${riverId}`,
      riverSlug: `river-${riverId}`,
      isPrimary: true,
      thresholdUnit: 'ft',
      levelTooLow: 0.5,
      levelLow: 1,
      levelOptimalMin: 1.5,
      levelOptimalMax: 3,
      levelHigh: 4,
      levelDangerous: 5,
      floodStageFt: null,
    }],
  };
}

test('Today hero requires positive, fresh, unit-compatible water', () => {
  assert.equal(isTodayRecommendationEligible(river('good', 'good')), true);
  assert.equal(isTodayRecommendationEligible(river('high', 'high')), false);
  assert.equal(isTodayRecommendationEligible(river('stale', 'good', 13)), false);
});

test('an eligible favorite outranks a closer stranger', () => {
  const favorite = river('favorite', 'good');
  const stranger = river('stranger', 'flowing');
  const result = chooseTodayRecommendation({
    rivers: [stranger, favorite],
    gauges: [gauge('favorite', favorite.id, -93.5), gauge('stranger', stranger.id, -93.01)],
    favoriteRiverIds: new Set([favorite.id]),
    coords: { lat: 37, lng: -93 },
  });
  assert.equal(result?.river.id, favorite.id);
  assert.equal(result?.mode, 'favorite');
});

test('condition rank is applied before distance', () => {
  const closeGood = river('close', 'good');
  const farFlowing = river('far', 'flowing');
  const result = chooseTodayRecommendation({
    rivers: [closeGood, farFlowing],
    gauges: [gauge('close', closeGood.id, -93.1), gauge('far', farFlowing.id, -93.5)],
    favoriteRiverIds: new Set(),
    coords: { lat: 37, lng: -93 },
  });
  assert.equal(result?.river.id, farFlowing.id);
  assert.equal(result?.mode, 'nearby');
});
