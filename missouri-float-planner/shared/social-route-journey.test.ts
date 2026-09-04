import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TIMING,
  buildJourneyRoute,
  journeyCamera,
  journeyDuration,
  journeyState,
  pointAtRouteProgress,
  progressAlongRoute,
  routeBounds,
  routeLength,
  smoothRoute,
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

test('smoothing keeps every stored vertex and both endpoints on the curve', () => {
  const raw = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }];
  const smooth = smoothRoute(raw, 8);
  assert.equal(smooth.length, 3 * 8 + 1);
  assert.deepEqual(smooth[0], raw[0]);
  assert.deepEqual(smooth.at(-1), raw.at(-1));
  // Interior vertices are Catmull-Rom knots: sample 8 lands exactly on raw[1].
  assert.ok(Math.hypot(smooth[8].x - 100, smooth[8].y - 0) < 1e-9);
  assert.ok(Math.hypot(smooth[16].x - 100, smooth[16].y - 100) < 1e-9);
  // The corner is rounded, so the curve cuts inside it.
  assert.ok(smooth[12].x < 100 + 1e-9 && smooth[12].x > 90, `corner should bulge, got x=${smooth[12].x}`);
  // Two points have nothing to smooth.
  assert.deepEqual(smoothRoute(raw.slice(0, 2)), raw.slice(0, 2));
  // Opting out returns the raw polyline scaled, without extra vertices.
  assert.equal(buildJourneyRoute(ROUTE, 1200, 400, false)!.length, 4);
});

test('the camera shows the whole float at frame 0 and follows the boat once travelling', () => {
  const route = buildJourneyRoute(ROUTE, 2550)!;
  const stage = { width: 1080, height: 800, boatX: 540, boatY: 400, padding: 100 };
  const bounds = routeBounds(route);

  const overview = journeyCamera(0, route, route[0], stage);
  const project = (p: { x: number; y: number }, cam: typeof overview) => ({
    x: p.x * cam.scale + cam.translateX,
    y: p.y * cam.scale + cam.translateY,
  });
  for (const corner of [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
  ]) {
    const s = project(corner, overview);
    assert.ok(s.x >= stage.padding - 1e-6 && s.x <= stage.width - stage.padding + 1e-6, `x ${s.x} outside stage`);
    assert.ok(s.y >= stage.padding - 1e-6 && s.y <= stage.height - stage.padding + 1e-6, `y ${s.y} outside stage`);
  }
  assert.ok(overview.scale < 1, 'a 2550px route must be scaled down to fit an 800px stage');

  const midway = pointAtRouteProgress(route, 0.5);
  const following = journeyCamera(DEFAULT_TIMING.introFrames + 200, route, midway, stage);
  assert.equal(following.scale, 1);
  const boat = project(midway, following);
  assert.ok(Math.abs(boat.x - stage.boatX) < 1e-6 && Math.abs(boat.y - stage.boatY) < 1e-6);
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
