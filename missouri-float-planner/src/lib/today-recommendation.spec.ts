import assert from 'node:assert/strict';
import test from 'node:test';
import type { HighWaterEntry, RiverAlert, RiverListItem } from '@eddy/types';
import {
  chooseTodayRecommendation,
  chooseTodayRecommendations,
  isTodayRecommendationEligible,
  recommendationNoticeSummary,
  nearestAccessDistance,
  TODAY_RADIUS_MILES,
  todayRecommendationEmptyMessage,
} from '../../../eddy-ios/src/lib/todayRecommendation';
import { favoriteFloatMeta } from '../../../eddy-ios/src/lib/favoriteFloatCopy';
import {
  dailyFavoriteFloats,
  dailyHighlightedFavorite,
  localDayKey,
} from '../../../eddy-ios/src/lib/todayFloats';
import { defaultCurrentAlertsFilter, filterCurrentAlerts } from '../../../eddy-ios/src/lib/todaySafety';

function river(id: string, code: 'good' | 'flowing' | 'high' | 'unknown', age = 1, lng = -93.1): RiverListItem {
  return {
    id, name: `River ${id}`, slug: `river-${id}`, lengthMiles: 10,
    description: null, difficultyRating: null, region: null, accessPointCount: 2,
    floatAccessCoordinates: [{ lat: 37, lng }],
    state: 'MO', riverType: 'spring_fed_float', path: `/rivers/missouri/river-${id}`,
    currentCondition: {
      label: code, code, thresholdUnit: 'ft', gaugeHeightFt: 2.1,
      dischargeCfs: null, readingAgeHours: age, trend: null,
    },
  };
}

test('Best River notice summary keeps the urgent category compact and preserves every full notice', () => {
  const park: RiverAlert = {
    id: 'park', source: 'nps', severity: 'notice', riverSlug: 'meramec', riverName: 'Meramec River',
    title: 'A long park notice', body: 'Full park details', category: 'Information',
    startsAt: null, endsAt: null, url: null,
  };
  const warning: RiverAlert = {
    ...park, id: 'flood', source: 'nws', severity: 'warning', category: 'Flood Warning',
    title: 'Flood Warning issued September 30 at 9:00AM CDT until October 1 at 1:00AM CDT by NWS Kansas City/Pleasant Hill',
    body: 'Full flood details', url: 'https://weather.gov/alert',
  };
  const original = [park, warning];
  const summary = recommendationNoticeSummary(original)!;
  assert.equal(summary.label, 'Flood Warning');
  assert.equal(summary.additionalCount, 1);
  assert.deepEqual(summary.notices, [warning, park]);
  assert.deepEqual(original, [park, warning], 'do not reorder the shared alert feed');
  assert.equal(recommendationNoticeSummary([warning])?.additionalCount, 0);
  assert.equal(recommendationNoticeSummary([{ ...park, category: ' ' }])?.label, 'Agency notice');
  assert.equal(recommendationNoticeSummary([]), null);
});

test('recommendations require positive water and the shared fresh-reading window', () => {
  assert.equal(isTodayRecommendationEligible(river('good', 'good')), true);
  assert.equal(isTodayRecommendationEligible(river('high', 'high')), false);
  assert.equal(isTodayRecommendationEligible(river('unrated', 'unknown')), false);
  assert.equal(isTodayRecommendationEligible(river('stale', 'good', 7)), false);
});

test('Best Near You includes favorite rivers in the same ranking as other rivers', () => {
  const favorite = river('favorite', 'good', 1, -93.01);
  const other = river('other', 'good', 1, -93.2);
  const result = chooseTodayRecommendation({
    rivers: [other, favorite], coords: { lat: 37, lng: -93 },
  });
  assert.equal(result?.river.id, favorite.id);
  assert.match(result?.reason ?? '', /^≈ [\d.]+ mi to nearest access$/);
});

test('Best Near You rail returns distinct ranked candidates including favorites', () => {
  const results = chooseTodayRecommendations({
    rivers: [river('favorite', 'flowing', 1, -93.01), river('third', 'good', 1, -93.3),
      river('outside', 'flowing', 1, -96), river('second', 'good', 1, -93.1),
      river('first', 'flowing', 1, -93.2)],
    coords: { lat: 37, lng: -93 },
  });
  assert.deepEqual(results.map((item) => item.river.id), ['favorite', 'first', 'second']);
  assert.equal(new Set(results.map((item) => item.river.id)).size, results.length);
});

test('Best Near You rail keeps the stabilized recommendation first', () => {
  const incumbent = river('incumbent', 'good', 1, -93.15);
  const challenger = river('challenger', 'good', 1, -93.1);
  const results = chooseTodayRecommendations({
    rivers: [challenger, incumbent], coords: { lat: 37, lng: -93 },
    incumbentRiverId: incumbent.id,
  });
  assert.deepEqual(results.map((item) => item.river.id), ['incumbent', 'challenger']);
});

test('condition band ranks before access distance', () => {
  const result = chooseTodayRecommendation({
    rivers: [river('close', 'good', 1, -93.03), river('farther', 'flowing', 1, -93.3)],
    coords: { lat: 37, lng: -93 },
  });
  assert.equal(result?.river.id, 'farther');
});

test('same-band incumbent yields when another access is meaningfully closer', () => {
  const incumbent = river('incumbent', 'good', 1, -93.5);
  const challenger = river('challenger', 'good', 1, -93.1);
  assert.equal(chooseTodayRecommendation({
    rivers: [challenger, incumbent], coords: { lat: 37, lng: -93 },
    incumbentRiverId: incumbent.id,
  })?.river.id, challenger.id);
});

test('100-mile radius includes launches beyond the former 75-mile cutoff', () => {
  assert.equal(TODAY_RADIUS_MILES, 100);
  const candidate = river('between-75-and-100', 'good', 1, -94.6);
  const coords = { lat: 37, lng: -93 };
  const distance = nearestAccessDistance(candidate, coords)!;
  assert.ok(distance > 75 && distance < 100);
  assert.equal(chooseTodayRecommendation({ rivers: [candidate], coords })?.river.id, candidate.id);
  assert.equal(chooseTodayRecommendation({ rivers: [candidate], coords, radiusMiles: 75 }), null);
  assert.ok(chooseTodayRecommendation({ rivers: [candidate], coords, radiusMiles: distance }));
  assert.equal(chooseTodayRecommendation({ rivers: [candidate], coords, radiusMiles: distance - 0.01 }), null);
  assert.equal(chooseTodayRecommendation({ rivers: [river('far', 'good', 1, -96)], coords }), null);
});

test('nearest usable access determines proximity, independent of the primary gauge', () => {
  const meramec = { ...river('meramec', 'good'),
    primaryGaugeId: 'steelville',
    floatAccessCoordinates: [{ lat: 37.957, lng: -91.354 }, { lat: 38.546, lng: -90.453 }],
  };
  const coords = { lat: 38.627, lng: -90.1994 };
  const result = chooseTodayRecommendation({ rivers: [meramec], coords });
  assert.equal(result?.river.id, 'meramec');
  assert.ok(result!.distanceMiles! < 20, 'use the nearby launch, not the upstream gauge');
  assert.equal(nearestAccessDistance(meramec, coords), nearestAccessDistance({
    ...meramec, floatAccessCoordinates: [...meramec.floatAccessCoordinates].reverse(),
  }, coords));
});

test('missing or invalid access positions cannot produce nearby picks or gauge distances', () => {
  const coords = { lat: 37, lng: -93 };
  const candidate = river('no-access', 'good');
  for (const floatAccessCoordinates of [undefined, [], [{ lat: NaN, lng: -93 }],
    [{ lat: 0, lng: 0 }], [{ lat: 91, lng: -93 }], [{ lat: 37, lng: -181 }]]) {
    const entry = { ...candidate, floatAccessCoordinates };
    assert.equal(nearestAccessDistance(entry, coords), null);
    assert.equal(chooseTodayRecommendation({ rivers: [entry], coords }), null);
    assert.equal(chooseTodayRecommendation({ rivers: [entry], coords: null })?.river.id, candidate.id);
  }
  assert.equal(todayRecommendationEmptyMessage([{ ...candidate, floatAccessCoordinates: undefined }], coords),
    'Nearby access data unavailable. Pull down to retry.');
  assert.equal(todayRecommendationEmptyMessage([{ ...candidate, floatAccessCoordinates: [] }], coords),
    'No rivers with fresh floatable conditions and access within 100 miles');
});

test('statewide mode falls through null distance to age and name tiebreaks', () => {
  const zulu = river('zulu', 'good', 9);
  const alpha = river('alpha', 'good', 1);
  const mike = river('mike', 'good', 5);
  assert.equal(chooseTodayRecommendation({ rivers: [zulu, alpha, mike], coords: null })?.river.id, alpha.id);
  const bravo = river('bravo', 'good', 1);
  assert.equal(chooseTodayRecommendation({ rivers: [bravo, alpha], coords: null })?.river.id, alpha.id);
});

test('statewide mode keeps a same-band incumbent but yields to a better band', () => {
  const incumbent = river('incumbent', 'good', 5);
  const fresher = river('fresher', 'good', 1);
  assert.equal(chooseTodayRecommendation({
    rivers: [fresher, incumbent], coords: null, incumbentRiverId: incumbent.id,
  })?.river.id, incumbent.id);
  const better = river('better', 'flowing', 4);
  assert.equal(chooseTodayRecommendation({
    rivers: [incumbent, better], coords: null, incumbentRiverId: incumbent.id,
  })?.river.id, better.id);
});

test('favorite float metadata labels the typical trip range', () => {
  assert.equal(
    favoriteFloatMeta({ distanceMiles: 8, durationHours: 4, durationFormatted: '3–5 hours', difficulty: 'I–II' }),
    '8.0 mi · 3–5 hours typical canoe trip · Class I–II',
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

test('current alerts opens Favorites when saved items exist and All Alerts otherwise', () => {
  assert.equal(defaultCurrentAlertsFilter([{ kind: 'river', entityId: 'far', slug: 'river-far' }]), 'favorites');
  assert.equal(defaultCurrentAlertsFilter([]), 'all');
});

test('All Alerts keeps both high-water grades and all notice severities', () => {
  const high = (id: string, conditionCode: 'high' | 'dangerous'): HighWaterEntry => ({
    kind: 'river', id, name: id, subtitle: null, conditionCode,
    conditionLabel: conditionCode, readingValue: 4, readingUnit: 'ft',
    readingAgeHours: 1, riverSlug: id, siteId: null, damId: null,
  });
  const alert = (id: string, severity: 'warning' | 'watch'): RiverAlert => ({
    id, source: 'nws', severity, riverSlug: id, riverName: id, title: id,
    body: '', category: id, startsAt: null, endsAt: null, url: null,
  });
  const result = filterCurrentAlerts(
    [high('high', 'high'), high('flood', 'dangerous')],
    [alert('watch', 'watch'), alert('warning', 'warning')],
    'all', [],
  );
  assert.deepEqual(result.high.map((entry) => entry.id), ['high', 'flood']);
  assert.deepEqual(result.notices.map((entry) => entry.id), ['watch', 'warning']);
});

test('favorites remain readable when a route time is withheld', () => {
  assert.match(favoriteFloatMeta({ distanceMiles: 8, durationHours: null, durationFormatted: null, durationUnavailableReason: 'regulated', difficulty: 'I' }), /dam releases/);
  assert.match(favoriteFloatMeta({ distanceMiles: 8, durationHours: null, durationFormatted: null, difficulty: 'I' }), /Open plan for float time/);
});
