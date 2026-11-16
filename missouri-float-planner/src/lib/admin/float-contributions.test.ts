import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompletedFloat } from '@shared/float-archive';
import {
  contributionFlags,
  median,
  paceDifference,
  parseReviewBody,
  summarizeRoutes,
  type ContributionTrip,
} from './float-contributions';

const float = (over: Partial<CompletedFloat> = {}): CompletedFloat => ({
  version: 1,
  id: 'f1',
  riverSlug: 'current',
  riverName: 'Current River',
  putInId: 'akers',
  putInName: 'Akers Ferry',
  takeOutId: 'pulltite',
  takeOutName: 'Pulltite',
  boatType: 'canoe',
  startedAt: Date.parse('2026-07-04T14:00:00Z'),
  endedAt: Date.parse('2026-07-04T18:00:00Z'),
  elapsedMs: 4 * 3600000,
  movingMs: 3 * 3600000,
  stoppedMs: 3600000,
  unknownMs: 0,
  distanceMiles: 9.8,
  movingMph: 3.3,
  plannerMph: 3,
  firstMile: 0,
  lastMile: 9.8,
  reachedTakeOut: true,
  measurementVersion: 1,
  water: { gaugeName: 'Akers', gaugeStationId: 'g', observedAt: '2026-07-04T13:45:00Z', heightFt: 2.1, dischargeCfs: 400 },
  ...over,
});

const trip = (userId: string, over: Partial<CompletedFloat> = {}, review: ContributionTrip['review'] = null): ContributionTrip => ({
  userId,
  floatId: over.id ?? 'f1',
  updatedAt: '2026-07-05T00:00:00Z',
  float: float(over),
  review,
});

test('median handles odd, even and empty inputs', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('pace difference compares measured moving pace with the estimate', () => {
  assert.ok(Math.abs(paceDifference({ movingMph: 3.3, plannerMph: 3 })! - 0.1) < 1e-9);
  assert.equal(paceDifference({ movingMph: 3, plannerMph: null }), null);
  assert.equal(paceDifference({ movingMph: null, plannerMph: 3 }), null);
  assert.equal(paceDifference({ movingMph: 3, plannerMph: 0 }), null);
});

test('a clean trip has no flags; each gap is named', () => {
  assert.deepEqual(contributionFlags(float()), []);
  assert.deepEqual(
    contributionFlags(
      float({ reachedTakeOut: false, boatType: null, water: null, plannerMph: null, unknownMs: 3600000, movingMs: 600000 }),
    ),
    ['Arrival unconfirmed', 'Boat missing', 'Water missing', 'No Eddy estimate', 'Over 20% unobserved', 'Under 15 min moving'],
  );
});

test('routes summarize used trips, count accounts, and leave exclusions out', () => {
  const excluded = { decision: 'exclude' as const, note: null, reviewedBy: 'Ada', reviewedAt: '2026-07-06T00:00:00Z' };
  const [route, other] = summarizeRoutes([
    trip('u1', { id: 'a', movingMph: 3.3, plannerMph: 3, water: { gaugeName: 'Akers', gaugeStationId: 'g', observedAt: 'x', heightFt: 2, dischargeCfs: 300 } }),
    trip('u1', { id: 'b', movingMph: 2.7, plannerMph: 3 }),
    trip('u2', { id: 'c', movingMph: 3.6, plannerMph: 3, water: null }),
    trip('u3', { id: 'd', movingMph: 9, plannerMph: 3 }, excluded),
    trip('u4', { id: 'e', takeOutId: 'twopoint', takeOutName: 'Two Rivers', plannerMph: null }),
  ]);
  assert.equal(route.routeLabel, 'Akers Ferry → Pulltite');
  assert.equal(route.trips, 3);
  assert.equal(route.accounts, 2);
  assert.equal(route.excluded, 1);
  assert.equal(route.paired, 3);
  assert.equal(route.medianMovingMph, 3.3);
  assert.equal(route.medianPlannerMph, 3);
  assert.ok(Math.abs(route.medianDifference! - 0.1) < 1e-9, 'the excluded 9 mph trip does not move the median');
  assert.deepEqual([route.minCfs, route.maxCfs], [300, 400]);
  assert.equal(other.trips, 1);
  assert.equal(other.paired, 0);
  assert.equal(other.medianDifference, null);
});

test('review writes are validated before they reach the database', () => {
  const userId = '9b2f3c4d-1111-4222-8333-444455556666';
  assert.deepEqual(parseReviewBody({ userId, floatId: 'f1', decision: 'exclude', note: '  GPS drift ' }), {
    userId,
    floatId: 'f1',
    decision: 'exclude',
    note: 'GPS drift',
  });
  assert.deepEqual(parseReviewBody({ userId, floatId: 'f1', decision: null }), {
    userId,
    floatId: 'f1',
    decision: null,
    note: null,
  });
  assert.ok('error' in parseReviewBody({ userId: 'nope', floatId: 'f1', decision: 'use' }));
  assert.ok('error' in parseReviewBody({ userId, floatId: '', decision: 'use' }));
  assert.ok('error' in parseReviewBody({ userId, floatId: 'f1', decision: 'trusted' }));
  assert.ok('error' in parseReviewBody({ userId, floatId: 'f1', decision: 'use', note: 'x'.repeat(1001) }));
  assert.ok('error' in parseReviewBody(null));
});
