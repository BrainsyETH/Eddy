import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapGauge, RiverListItem } from '@eddy/types';
import {
  chooseTodayRecommendation,
  isTodayRecommendationEligible,
} from '../../../eddy-ios/src/lib/todayRecommendation';

function river(id: string, code: 'good' | 'flowing' | 'high', age = 1): RiverListItem {
  return {
    id, name: `River ${id}`, slug: `river-${id}`, lengthMiles: 10,
    description: null, difficultyRating: null, region: null, accessPointCount: 2,
    state: 'MO', riverType: 'spring_fed_float', path: `/rivers/missouri/river-${id}`,
    currentCondition: {
      label: code, code, thresholdUnit: 'ft', gaugeHeightFt: 2.1,
      dischargeCfs: null, readingAgeHours: age, trend: null,
    },
  };
}

function gauge(id: string, riverId: string, lng: number): MapGauge {
  return {
    id: `gauge-${id}`, usgsSiteId: id, name: `Gauge ${id}`,
    coordinates: { lat: 37, lng }, gaugeHeightFt: 2.1, dischargeCfs: null,
    readingTimestamp: new Date().toISOString(), readingAgeHours: 1,
    readingSuspect: false, qualifierNote: null,
    thresholds: [{
      riverId, riverName: `River ${riverId}`, riverSlug: `river-${riverId}`,
      isPrimary: true, thresholdUnit: 'ft', levelTooLow: 0.5, levelLow: 1,
      levelOptimalMin: 1.5, levelOptimalMax: 3, levelHigh: 4,
      levelDangerous: 5, floodStageFt: null,
    }],
  };
}

test('recommendations require positive water and the shared fresh-reading window', () => {
  assert.equal(isTodayRecommendationEligible(river('good', 'good')), true);
  assert.equal(isTodayRecommendationEligible(river('high', 'high')), false);
  assert.equal(isTodayRecommendationEligible(river('stale', 'good', 7)), false);
});

test('Best Near You is discovery and excludes favorites', () => {
  const favorite = river('favorite', 'good');
  const discovery = river('discovery', 'flowing');
  const result = chooseTodayRecommendation({
    rivers: [favorite, discovery],
    gauges: [gauge('favorite', favorite.id, -93.01), gauge('discovery', discovery.id, -93.2)],
    favoriteRiverIds: new Set([favorite.id]), coords: { lat: 37, lng: -93 },
  });
  assert.equal(result?.river.id, discovery.id);
});

test('condition band ranks before distance', () => {
  const closeGood = river('close', 'good');
  const fartherFlowing = river('farther', 'flowing');
  const result = chooseTodayRecommendation({
    rivers: [closeGood, fartherFlowing],
    gauges: [gauge('close', closeGood.id, -93.03), gauge('farther', fartherFlowing.id, -93.3)],
    favoriteRiverIds: new Set(), coords: { lat: 37, lng: -93 },
  });
  assert.equal(result?.river.id, fartherFlowing.id);
});

test('same-band incumbent stays until a challenger is meaningfully closer', () => {
  const incumbent = river('incumbent', 'good');
  const challenger = river('challenger', 'good');
  const result = chooseTodayRecommendation({
    rivers: [challenger, incumbent],
    gauges: [gauge('challenger', challenger.id, -93.1), gauge('incumbent', incumbent.id, -93.15)],
    favoriteRiverIds: new Set(), coords: { lat: 37, lng: -93 },
    incumbentRiverId: incumbent.id,
  });
  assert.equal(result?.river.id, incumbent.id);
});

test('known location has no statewide fallback outside the fixed radius', () => {
  const candidate = river('far', 'good');
  const result = chooseTodayRecommendation({
    rivers: [candidate], gauges: [gauge('far', candidate.id, -96)],
    favoriteRiverIds: new Set(), coords: { lat: 37, lng: -93 },
  });
  assert.equal(result, null);
});
