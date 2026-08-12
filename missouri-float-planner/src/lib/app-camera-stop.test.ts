import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cameraCommandFor, planFramingDecision } from '../../../eddy-ios/src/map/cameraBehavior';
import type { MapCameraCommand } from '../../../eddy-ios/src/map/cameraBehavior';

// Map navigation must be a one-time response to an explicit action.
//
// ── Why this is a test and not a review note ──────────────────────────────────
// Nothing else catches it. It type-checks, it lints, it bundles, and it shows up
// only as a map that fights the user's fingers.
//
// @rnmapbox/maps assembles ONE camera stop from persistent Camera props —
//
//   const nativeStop = useMemo(() => …, [centerCoordinate, bounds, heading,
//     pitch, zoomLevel, padding, animationDuration, animationMode])
//
// — and hands it to native as `stop`. A padding or target prop change therefore
// reapplies the whole stop. The map now keeps only cold-start defaultSettings on
// the component and sends navigation through an imperative command with a
// monotonic id. Once consumed, sheet changes and React renders cannot replay it.
//
// That persistent stop was the bug behind "tapping a POI zooms me out real far":
// opening the sheet changed padding and the camera snapped back to its last
// React-computed river or statewide framing.
//
// Lives here because the Expo app has no test runner of its own — the same
// arrangement as app-worklet-closures.test.ts, which is also a structural
// invariant read out of the app's source as text.
const MAP = join(process.cwd(), '../eddy-ios/src/map/RiverMap.tsx');
const SCREEN = join(process.cwd(), '../eddy-ios/app/(tabs)/index.tsx');

test('navigation is one-shot and is not attached to persistent Camera props', () => {
  const source = readFileSync(MAP, 'utf8');

  assert.match(source, /cameraRef\.current\.setCamera\(/);
  assert.match(source, /appliedCommandId\.current === cameraCommand\.id/);

  // ANCHORED to the element. This used to scan 300 characters past
  // `<Mapbox.Camera`, which runs well past its own `/>` and into whatever JSX
  // follows — so a future sibling with a `padding=` prop would have failed this
  // as though the camera had regained a persistent target.
  const camera = /<Mapbox\.Camera\b[\s\S]*?\/>/.exec(source);
  assert.ok(camera, 'RiverMap no longer renders a Mapbox.Camera');
  assert.doesNotMatch(
    camera[0],
    /\s(?:bounds|centerCoordinate|zoomLevel|padding)=/,
    'a navigation or padding target was attached to Mapbox.Camera props and can be replayed by a sheet change',
  );
});

test('a gesture cancels a command still waiting for sheet measurement', () => {
  const source = readFileSync(MAP, 'utf8');

  // The command is read from a ref rather than taken as a dependency, so that
  // onCameraChanged — which fires every animation frame, across the bridge —
  // keeps a stable identity.
  assert.match(source, /pendingCommand\.current = cameraCommand \?\? null/);
  assert.match(
    source,
    /if \(gestureActive\)[\s\S]{0,600}appliedCommandId\.current = command\.id/,
    'a gesture no longer cancels a camera command waiting for sheet measurement',
  );
  assert.match(
    source,
    /const onCameraChanged = useCallback\(/,
    'onCameraChanged is inline again. It is a per-frame native callback on a map ' +
      'that re-renders with every sheet movement — see its own comment.',
  );
});

// ── The invariant the last revision lost ─────────────────────────────────────
//
// Framing used to fall out of state: RiverMap held a bounds chain, so ANY path
// that changed the selected river got a camera fit whether or not its author
// had considered the camera. One-shot commands made that explicit, and two
// paths that had been living off the implicit version stopped moving the map —
// river search results (which carry no coordinates, so the branch guarding the
// command was simply false for them) and the Plan sheet's river picker.
//
// Counting call sites rather than enumerating them is deliberate. An
// enumeration has to be edited every time one is added, which is exactly the
// moment it stops being read; a count of one cannot be satisfied by adding
// another unguarded caller.
test('the selected river changes in exactly one place', () => {
  const source = readFileSync(SCREEN, 'utf8');
  const calls = source.match(/setPickedSlug\(/g) ?? [];
  assert.equal(
    calls.length,
    1,
    `setPickedSlug is called ${calls.length} times. It belongs to selectRiver alone — ` +
      'every other caller must go through it, so that choosing a river cannot ' +
      'compile without saying what the camera does.',
  );
  assert.match(
    source,
    /const selectRiver = useCallback\(\s*\(slug: string \| null, intent: RiverCameraIntent\)/,
    'selectRiver no longer takes a REQUIRED camera intent. An optional or ' +
      'defaulted one puts the silent no-op back: a new call site compiles ' +
      'without its author deciding whether the map moves.',
  );
});

// Declared variants and used variants must be the same set.
//
// This is the check the deleted `sheetChanged` / `selectionClosed` /
// `userGesture` test should have been. Those three were asserted to return null
// and were constructed nowhere, so the assertion held forever no matter what the
// app did — a switch returning the constant written beside it. Comparing the
// declaration against real call sites is the version that can fail: add a
// variant nobody uses, or use one nobody declared, and this goes red.
test('every declared camera intent is used, and every used one is declared', () => {
  const source = readFileSync(SCREEN, 'utf8');

  const declaration = /type RiverCameraIntent =([\s\S]*?);\n/.exec(source);
  assert.ok(declaration, 'RiverCameraIntent is no longer declared on the map screen');
  const declared = new Set(
    [...declaration[1].matchAll(/\{ camera: '(\w+)'/g)].map((m) => m[1]),
  );
  const used = new Set(
    [...source.matchAll(/selectRiver\([\s\S]{0,200}?\{ camera: '(\w+)'/g)].map((m) => m[1]),
  );

  assert.deepEqual(
    [...declared].sort(),
    [...used].sort(),
    'a camera intent is declared but never chosen at a call site, or chosen but ' +
      'never declared. A variant whose only proof of life is this test is dead ' +
      'surface — delete it rather than asserting it behaves.',
  );
});

test('river and POI selection have distinct camera behavior', () => {
  assert.deepEqual(cameraCommandFor({ type: 'riverSelected', bounds: [-92, 36, -91, 38] }, 4), {
    id: 4,
    type: 'fitBounds',
    bounds: [-92, 36, -91, 38],
    duration: 550,
    waitForSheet: true,
  });
  assert.deepEqual(cameraCommandFor({ type: 'poiSelected', lng: -91.3, lat: 37.2 }, 5), {
    id: 5,
    type: 'showPoint',
    lng: -91.3,
    lat: 37.2,
    duration: 350,
    waitForSheet: true,
  });
});

/**
 * Narrow to the point-moving branch before reading its zoom fields.
 *
 * `?.zoom` straight off the return value does not compile: the union's other
 * member frames bounds and has no zoom at all. tsconfig.test.json type-checks
 * this directory, so reaching through the union was failing `make check-web`
 * while the runner itself stayed green — the assertions run fine on values that
 * do have the field.
 */
function pointStop(command: MapCameraCommand | null) {
  assert.ok(command, 'expected a camera command');
  assert.equal(command.type, 'showPoint', 'expected a point move, not a bounds fit');
  return command.type === 'showPoint' ? command : null;
}

test('explicit navigation owns zoom while POIs preserve the live zoom', () => {
  assert.equal(
    pointStop(cameraCommandFor({ type: 'locationRequested', lng: -91.3, lat: 37.2, zoom: 10.5 }, 6))
      ?.zoom,
    10.5,
  );
  assert.equal(
    pointStop(cameraCommandFor({ type: 'clusterSelected', lng: -91.3, lat: 37.2 }, 7))?.zoomDelta,
    2,
  );
  assert.equal(
    pointStop(cameraCommandFor({ type: 'searchResultSelected', lng: -91.3, lat: 37.2 }, 8))?.zoom,
    13,
  );
  // Absent, not undefined: the effect branches on `zoomDelta !== undefined` and
  // otherwise passes `zoom` through as-is, so an explicit `zoom: undefined` and
  // no zoom key at all reach Mapbox identically — but only one of them says so.
  const poi = pointStop(cameraCommandFor({ type: 'poiSelected', lng: -91.3, lat: 37.2 }, 9));
  assert.equal(poi && 'zoom' in poi, false);
});

// A finished plan is framed through the command system like everything else.
// It used to call setCamera directly from inside RiverMap, outside command ids,
// sheet waiting and gesture cancellation — and a route arrives asynchronously,
// so it was the one path left that could still overrule a reader who had panned
// away while it was in flight.
test('a finished plan route is framed as a command, not a direct camera call', () => {
  const command = cameraCommandFor({ type: 'planRouteFramed', bounds: [-92, 36, -91, 38] }, 13);
  assert.deepEqual(command, {
    id: 13,
    type: 'fitBounds',
    bounds: [-92, 36, -91, 38],
    duration: 550,
  });
  // Absent, and deliberately unlike every other fit. The gate reads the MAP
  // sheet's padding, which a pageSheet Plan modal does not contribute to — so
  // `waitForSheet: true` did not delay this frame until the sheet was measured,
  // it queued it until some unrelated sheet next opened.
  assert.equal(command && 'waitForSheet' in command, false);

  const map = readFileSync(MAP, 'utf8');
  assert.doesNotMatch(
    map,
    /framedRoute/,
    'RiverMap frames the plan route itself again, bypassing command ids, sheet ' +
      'waiting and gesture cancellation',
  );
  // Two, and only two: the showPoint and fitBounds branches of the one command
  // effect. Counted rather than enumerated for the same reason as setPickedSlug
  // — a third camera move cannot be added without this failing, whereas a list
  // of the ones that exist today would just be updated to include it.
  assert.equal(
    (map.match(/\.setCamera\(/g) ?? []).length,
    2,
    'a setCamera call was added or removed. Every camera move must go through the ' +
      'single command effect, whose two branches are the only legitimate calls.',
  );
});

// ── The late-plan-response race ──────────────────────────────────────────────
//
// Framing on arrival let an asynchronous result outrank newer intent: start a
// plan, close the sheet, pan or pick another POI, and the response landed and
// framed the route over wherever the reader had gone. Command ids do not catch
// it — they establish that a command is not a replay, not that it is still
// wanted.
//
// The rule is now that the plan moves the map only while the plan is being
// looked at, which is enforceable rather than adjudicated: PlanSheet is a
// pageSheet modal, so the map cannot be touched while it is open.
test('a plan frames only while its sheet is open', () => {
  const route = { coordinates: [] };
  const other = { coordinates: [] };

  // Arrives while open — the reader is looking at it.
  assert.equal(planFramingDecision(true, route, null), 'frame');
  // Already framed, and the sheet is still up: leave the camera alone rather
  // than re-fitting on every unrelated re-render.
  assert.equal(planFramingDecision(true, route, route), 'idle');
  // A different plan, same viewing session.
  assert.equal(planFramingDecision(true, other, route), 'frame');
  // Open with nothing calculated yet.
  assert.equal(planFramingDecision(true, null, null), 'idle');
});

test('a plan response that lands after the sheet closes never moves the map', () => {
  const route = { coordinates: [] };

  // THE RACE. The sheet is closed and the response has just arrived; on the old
  // arrival-driven rule this issued a command over the reader's newer camera.
  assert.equal(planFramingDecision(false, route, null), 'endSession');
  // And it stays refused for as long as the sheet is shut.
  assert.equal(planFramingDecision(false, route, route), 'endSession');
});

test('reopening a finished plan frames it again', () => {
  const route = { coordinates: [] };

  // Closing ends the viewing session, which is what forgets the framed route —
  // `endSession` is not a synonym for "do nothing". Reopening is fresh intent,
  // so the same route frames a second time.
  assert.equal(planFramingDecision(false, route, route), 'endSession');
  assert.equal(planFramingDecision(true, route, null), 'frame');
});

test('closing cancels a frame issued in the instant before dismissal', () => {
  const screen = readFileSync(SCREEN, 'utf8');

  // `endSession` has to DO something: clear the remembered route and drop a
  // command that has been issued but not yet applied. Without the second half a
  // frame outlives the session that asked for it.
  assert.match(
    screen,
    /decision === 'endSession'[\s\S]{0,700}setCameraCommand\(\(current\) =>[\s\S]{0,120}pending/,
    'closing the Plan sheet no longer cancels a pending plan-frame command',
  );
  assert.match(
    screen,
    /planFramingDecision\(planOpen, planGeometry, framedRoute\.current\)/,
    'plan framing is no longer decided by the pure rule — an effect deciding for ' +
      'itself is how the arrival-driven race got in',
  );
});
