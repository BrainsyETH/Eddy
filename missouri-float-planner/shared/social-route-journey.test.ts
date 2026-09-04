import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildJourneyRoute,
  journeyDuration,
  journeyState,
  pointAtRouteProgress,
  progressAlongRoute,
  routeLength,
} from './social-route-journey';

const ROUTE: Array<[number, number]> = [
  [-91.50, 37.00],
  [-91.46, 36.98],
  [-91.42, 36.94],
  [-91.39, 36.90],
];

test('journey route keeps the real bends and rotates downstream upward', () => {
  const route = buildJourneyRoute(ROUTE, 1200)!;
  assert.ok(route.length >= 4);
  assert.ok(route.at(-1)!.y < route[0].y, 'the take-out should be above the put-in');
  assert.ok(Math.abs(routeLength(route) - 1200) < 0.1);
});

test('pointAtRouteProgress follows arc length rather than vertex index', () => {
  const point = pointAtRouteProgress(
    [{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 100, y: 0 }],
    0.5,
  );
  assert.deepEqual(point, { x: 50, y: 0 });
});

test('real feature coordinates resolve to their nearest along-route progress', () => {
  const progress = progressAlongRoute(ROUTE, ROUTE[2]);
  assert.ok(progress !== null);
  assert.ok(progress > 0.45 && progress < 0.8, `unexpected progress ${progress}`);
});

test('the timeline pauses at each stop and then completes', () => {
  const timing = { introFrames: 10, travelFrames: 100, pauseFrames: 20, outroFrames: 30 };
  const stops = [{ progress: 0.25 }, { progress: 0.75 }];
  const firstPause = journeyState(45, stops, timing);
  assert.equal(firstPause.progress, 0.25);
  assert.equal(firstPause.activeStop, 0);
  assert.equal(firstPause.calloutProgress, 1);

  const secondPause = journeyState(115, stops, timing);
  assert.equal(secondPause.progress, 0.75);
  assert.equal(secondPause.activeStop, 1);

  const complete = journeyState(10_000, stops, timing);
  assert.equal(complete.progress, 1);
  assert.equal(complete.complete, true);
  assert.equal(journeyDuration(stops.length, timing), 180);
});

test('missing and degenerate geometry never becomes an invented route', () => {
  assert.equal(buildJourneyRoute(null), null);
  assert.equal(buildJourneyRoute([]), null);
  assert.equal(buildJourneyRoute([[-91, 37]]), null);
  assert.equal(buildJourneyRoute([[-91, 37], [-91, 37]]), null);
});
