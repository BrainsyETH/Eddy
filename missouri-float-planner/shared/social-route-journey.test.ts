import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TIMING,
  arrivalFrame,
  buildJourney,
  buildJourneyRoute,
  journeyCamera,
  journeyDuration,
  journeyState,
  maxDistanceToPolyline,
  pointAtRouteProgress,
  progressAlongRoute,
  routeBounds,
  routeLength,
} from './social-route-journey';

const ROUTE: Array<[number, number]> = [
  [-91.50, 37.00],
  [-91.46, 36.98],
  [-91.42, 36.94],
  [-91.39, 36.90],
];

// The real thing: Current River, Pulltite Spring → Round Spring, the
// ST_LineSubstring slice of rivers.geom (NHD HR, Douglas-Peucker'd to ~50 m at
// import). 35 vertices over 9.16 channel miles. Same fixture as Root.tsx.
const PULLTITE_ROUND_SPRING: Array<[number, number]> = [
  [-91.47628, 37.3347], [-91.47864, 37.33617], [-91.48124, 37.3365], [-91.48899, 37.33341],
  [-91.48824, 37.32989], [-91.48866, 37.326], [-91.48378, 37.32126], [-91.47812, 37.31981],
  [-91.47132, 37.31929], [-91.4691, 37.31534], [-91.46696, 37.31434], [-91.46521, 37.31199],
  [-91.45994, 37.31298], [-91.45675, 37.31504], [-91.45253, 37.31453], [-91.45168, 37.31657],
  [-91.45256, 37.31802], [-91.45242, 37.32015], [-91.44823, 37.32296], [-91.44287, 37.32022],
  [-91.4377, 37.31985], [-91.43331, 37.32063], [-91.43061, 37.31375], [-91.42921, 37.31276],
  [-91.42236, 37.31635], [-91.41921, 37.31514], [-91.41688, 37.31289], [-91.41672, 37.30916],
  [-91.41509, 37.30657], [-91.41666, 37.29916], [-91.41447, 37.29564], [-91.4144, 37.29096],
  [-91.41359, 37.28933], [-91.40558, 37.28392], [-91.4054, 37.28335],
];
/** The three intermediate features on that run (Echo Bluff, Sinking Creek, Carr's). */
const FIXTURE_STOPS = [0.8093, 0.8269, 0.9626];

test('journey route keeps the real bends and rotates downstream upward', () => {
  const journey = buildJourney(ROUTE, 1200)!;
  assert.ok(journey.points.length >= 4);
  assert.ok(journey.points.at(-1)!.y < journey.points[0].y, 'the take-out should be above the put-in');
  // The raw line is scaled to exactly the travel length; rounding corners can
  // only shorten the stroked line, and only by a hair.
  assert.ok(Math.abs(routeLength(journey.raw) - 1200) < 0.1);
  assert.ok(routeLength(journey.points) <= 1200 && routeLength(journey.points) > 1200 * 0.98);
  assert.deepEqual(buildJourneyRoute(ROUTE, 1200), journey.points);
});

test('the stroked line never leaves the stored line by more than the import tolerance', () => {
  const journey = buildJourney(PULLTITE_ROUND_SPRING)!;
  // 2550 px over 9.16 mi ≈ 278 px/mi, so 50 m is ≈ 8.7 px on this float.
  assert.ok(journey.maxDeviationPx > 7 && journey.maxDeviationPx < 11, `bound ${journey.maxDeviationPx}`);
  const deviation = maxDistanceToPolyline(journey.points, journey.raw);
  assert.ok(deviation <= journey.maxDeviationPx + 1e-6, `stroked line is ${deviation}px off the raw line`);
  // Every stored vertex is still where the render says it is: the raw line is
  // untouched, and the stroked line passes within the bound of each vertex.
  for (const vertex of journey.raw) {
    assert.ok(maxDistanceToPolyline([vertex], journey.points) <= journey.maxDeviationPx + 1e-6);
  }
});

test('a right-angle corner is rounded inside the bound and straight runs are untouched', () => {
  // Three points on a plain L: 100 px east, then 100 px north (screen y up = negative).
  const L: Array<[number, number]> = [[-91.5, 37.0], [-91.5 + 0.001 / Math.cos(37 * Math.PI / 180), 37.0], [-91.5 + 0.001 / Math.cos(37 * Math.PI / 180), 37.001]];
  const journey = buildJourney(L, 200)!;
  assert.equal(journey.raw.length, 3);
  assert.ok(maxDistanceToPolyline(journey.points, journey.raw) <= journey.maxDeviationPx + 1e-6);
  // A quarter of the way is mid-first-segment: the mapping is exact there
  // (to float noise from the degree → px projection, ~1e-5 px).
  const quarter = journey.locate(0.25).point;
  const rawQuarter = pointAtRouteProgress(journey.raw, 0.25);
  assert.ok(Math.hypot(quarter.x - rawQuarter.x, quarter.y - rawQuarter.y) < 1e-3);
  // Halfway is the corner: the stroked stand-in is within the bound of the vertex.
  const half = journey.locate(0.5).point;
  assert.ok(Math.hypot(half.x - journey.raw[1].x, half.y - journey.raw[1].y) <= journey.maxDeviationPx + 1e-6);
  // Opting out of rounding returns the raw polyline itself.
  assert.deepEqual(buildJourney(L, 200, false)!.points, journey.raw);
});

test('markers land within the bound of their raw position, not merely on the line', () => {
  const journey = buildJourney(PULLTITE_ROUND_SPRING)!;
  for (const progress of [...FIXTURE_STOPS, 0.1, 0.33, 0.5, 0.75]) {
    const rendered = journey.locate(progress).point;
    const raw = pointAtRouteProgress(journey.raw, progress);
    const shift = Math.hypot(rendered.x - raw.x, rendered.y - raw.y);
    assert.ok(shift <= journey.maxDeviationPx + 1e-6, `progress ${progress} shifted ${shift}px`);
  }
});

test('rendered progress tracks raw progress monotonically from 0 to 1', () => {
  const journey = buildJourney(PULLTITE_ROUND_SPRING)!;
  assert.equal(journey.locate(0).renderedProgress, 0);
  assert.ok(Math.abs(journey.locate(1).renderedProgress - 1) < 1e-9);
  let previous = -1;
  for (let i = 0; i <= 200; i += 1) {
    const { renderedProgress } = journey.locate(i / 200);
    assert.ok(renderedProgress >= previous, `not monotone at ${i / 200}`);
    // Corner rounding only shortens by a hair, so the two parameterisations
    // never drift apart by more than a percent.
    assert.ok(Math.abs(renderedProgress - i / 200) < 0.01, `drift ${renderedProgress - i / 200} at ${i / 200}`);
    previous = renderedProgress;
  }
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
  // The summary hold is added only when asked for, and falls back to the
  // default length when the timing does not name one.
  assert.equal(journeyDuration(stops.length, timing, true), 180 + DEFAULT_TIMING.summaryFrames!);
});

test('arrivalFrame is exactly the first frame the journey reports complete', () => {
  const stops = FIXTURE_STOPS.map((progress) => ({ progress }));
  const arrival = arrivalFrame(stops);
  assert.equal(journeyState(arrival - 1, stops).complete, false);
  assert.equal(journeyState(arrival, stops).complete, true);
  // With no stops it is simply intro + travel.
  assert.equal(arrivalFrame([]), DEFAULT_TIMING.introFrames + DEFAULT_TIMING.travelFrames);
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

test('missing and degenerate geometry never becomes an invented route', () => {
  assert.equal(buildJourneyRoute(null), null);
  assert.equal(buildJourneyRoute([]), null);
  assert.equal(buildJourneyRoute([[-91, 37]]), null);
  assert.equal(buildJourneyRoute([[-91, 37], [-91, 37]]), null);
});
