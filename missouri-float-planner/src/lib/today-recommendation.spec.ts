import assert from 'node:assert/strict';
import test from 'node:test';
import type { HighWaterEntry, MapGauge, RiverAlert, RiverListItem } from '@eddy/types';
import {
  chooseTodayRecommendation,
  isTodayRecommendationEligible,
} from '../../../eddy-ios/src/lib/todayRecommendation';
import { favoriteFloatMeta } from '../../../eddy-ios/src/lib/favoriteFloatCopy';
import {
  dailyFavoriteFloats,
  dailyHighlightedFavorite,
  excludeKnownDangerousFavorites,
  localDayKey,
} from '../../../eddy-ios/src/lib/todayFloats';
import { chooseTodaySafetyScope, filterTodaySafety } from '../../../eddy-ios/src/lib/todaySafety';

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
  assert.match(result?.reason ?? '', /^≈ [\d.]+ mi to gauge$/);
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

test('statewide mode falls through null distance to age and name tiebreaks', () => {
  const zulu = river('zulu', 'good', 9);
  const alpha = river('alpha', 'good', 1);
  const mike = river('mike', 'good', 5);
  const result = chooseTodayRecommendation({
    rivers: [zulu, alpha, mike], gauges: [], favoriteRiverIds: new Set(), coords: null,
  });
  assert.equal(result?.river.id, alpha.id);

  const bravo = river('bravo', 'good', 1);
  const sameAge = chooseTodayRecommendation({
    rivers: [bravo, alpha], gauges: [], favoriteRiverIds: new Set(), coords: null,
  });
  assert.equal(sameAge?.river.id, alpha.id);
});

test('statewide mode keeps a same-band incumbent but yields to a better band', () => {
  const incumbent = river('incumbent', 'good', 5);
  const fresher = river('fresher', 'good', 1);
  const stable = chooseTodayRecommendation({
    rivers: [fresher, incumbent], gauges: [], favoriteRiverIds: new Set(), coords: null,
    incumbentRiverId: incumbent.id,
  });
  assert.equal(stable?.river.id, incumbent.id);

  const better = river('better', 'flowing', 4);
  const improved = chooseTodayRecommendation({
    rivers: [incumbent, better], gauges: [], favoriteRiverIds: new Set(), coords: null,
    incumbentRiverId: incumbent.id,
  });
  assert.equal(improved?.river.id, better.id);
});

test('favorite float metadata labels the relaxed canoe trip estimate', () => {
  assert.equal(
    favoriteFloatMeta({ distanceMiles: 8, durationHours: 4, difficulty: 'I–II' }),
    '8.0 mi · about 4.0 hrs at a relaxed canoe pace · Class I–II',
  );
});

test('favorite floats rotate by local day without flapping during that day', () => {
  const floats = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((id) => ({ id }));
  const first = dailyFavoriteFloats(floats, '2026-09-08').map((item) => item.id);
  const again = dailyFavoriteFloats([...floats].reverse(), '2026-09-08').map((item) => item.id);
  const tomorrow = dailyFavoriteFloats(floats, '2026-09-09').map((item) => item.id);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, tomorrow);
  assert.deepEqual(floats.map((item) => item.id), ['alpha', 'bravo', 'charlie', 'delta', 'echo']);
  assert.equal(localDayKey(new Date(2026, 8, 8, 23, 59)), '2026-09-08');
});

test('the Today rail excludes favorites on rivers known to be dangerous', () => {
  const floats = [
    { id: 'danger', riverSlug: 'flooded-river' },
    { id: 'good', riverSlug: 'good-river' },
    { id: 'unknown', riverSlug: 'unloaded-river' },
  ];
  const conditions = new Map<string, string | null>([
    ['flooded-river', 'dangerous'],
    ['good-river', 'good'],
  ]);

  assert.deepEqual(
    excludeKnownDangerousFavorites(floats, conditions).map((item) => item.id),
    ['good', 'unknown'],
  );
});

test('highlighted favorite rotates among rivers and falls back when there are none', () => {
  const favorites = [
    { kind: 'gauge', entityId: 'gauge-1' },
    { kind: 'river', entityId: 'river-1' },
    { kind: 'river', entityId: 'river-2' },
  ];
  const highlight = dailyHighlightedFavorite(favorites, '2026-09-08');
  assert.equal(highlight?.kind, 'river');
  assert.deepEqual(
    dailyHighlightedFavorite([...favorites].reverse(), '2026-09-08'),
    highlight,
  );
  assert.deepEqual(
    dailyHighlightedFavorite([{ kind: 'dam', entityId: 'dam-1' }], '2026-09-08'),
    { kind: 'dam', entityId: 'dam-1' },
  );
  assert.equal(dailyHighlightedFavorite([], '2026-09-08'), null);
});

test('safety scope falls back from favorites to nearby rivers to statewide', () => {
  const near = river('near', 'good');
  const far = river('far', 'good');
  const favorites = chooseTodaySafetyScope({
    favoriteRiverSlugs: new Set([far.slug]),
    rivers: [near, far],
    gauges: [gauge('near', near.id, -93.1), gauge('far', far.id, -96)],
    coords: { lat: 37, lng: -93 },
  });
  assert.equal(favorites.kind, 'favorites');
  assert.deepEqual([...favorites.slugs!], [far.slug]);

  const nearby = chooseTodaySafetyScope({
    favoriteRiverSlugs: new Set(),
    rivers: [near, far],
    gauges: [gauge('near', near.id, -93.1), gauge('far', far.id, -96)],
    coords: { lat: 37, lng: -93 },
  });
  assert.equal(nearby.kind, 'nearby');
  assert.deepEqual([...nearby.slugs!], [near.slug]);

  const statewide = chooseTodaySafetyScope({
    favoriteRiverSlugs: new Set(), rivers: [near, far], gauges: [], coords: null,
  });
  assert.equal(statewide.kind, 'statewide');
  assert.equal(statewide.slugs, null);
});

test('statewide safety keeps only flood and warning severity', () => {
  const high = (id: string, conditionCode: 'high' | 'dangerous'): HighWaterEntry => ({
    kind: 'river', id, name: id, subtitle: null, conditionCode,
    conditionLabel: conditionCode, readingValue: 4, readingUnit: 'ft',
    readingAgeHours: 1, riverSlug: id, siteId: null, damId: null,
  });
  const alert = (id: string, severity: 'warning' | 'watch'): RiverAlert => ({
    id, source: 'nws', severity, riverSlug: id, riverName: id, title: id,
    body: '', category: id, startsAt: null, endsAt: null, url: null,
  });
  const result = filterTodaySafety(
    [high('high', 'high'), high('flood', 'dangerous')],
    [alert('watch', 'watch'), alert('warning', 'warning')],
    { kind: 'statewide', key: 'statewide', slugs: null },
  );
  assert.deepEqual(result.high.map((entry) => entry.id), ['flood']);
  assert.deepEqual(result.notices.map((entry) => entry.id), ['warning']);
});
