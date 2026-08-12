import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cameraCommandFor } from '../../../eddy-ios/src/map/cameraBehavior';

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

test('navigation is one-shot and is not attached to persistent Camera props', () => {
  const source = readFileSync(MAP, 'utf8');

  assert.match(source, /cameraRef\.current\.setCamera\(/);
  assert.match(source, /appliedCommandId\.current === cameraCommand\.id/);
  assert.match(
    source,
    /if \(gestureActive && cameraCommand\)[\s\S]{0,300}appliedCommandId\.current = cameraCommand\.id/,
    'a gesture no longer cancels a camera command waiting for sheet measurement',
  );
  assert.doesNotMatch(
    source,
    /<Mapbox\.Camera[\s\S]{0,300}\s(?:bounds|centerCoordinate|zoomLevel|padding)=/,
    'a navigation or padding target was attached to Mapbox.Camera props and can be replayed by a sheet change',
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

test('explicit navigation owns zoom while POIs preserve the live zoom', () => {
  assert.equal(
    cameraCommandFor({ type: 'locationRequested', lng: -91.3, lat: 37.2, zoom: 10.5 }, 6)
      ?.zoom,
    10.5,
  );
  assert.equal(cameraCommandFor({ type: 'clusterSelected', lng: -91.3, lat: 37.2 }, 7)?.zoomDelta, 2);
  assert.equal(
    cameraCommandFor({ type: 'searchResultSelected', lng: -91.3, lat: 37.2 }, 8)?.zoom,
    13,
  );
  assert.equal(
    'zoom' in cameraCommandFor({ type: 'poiSelected', lng: -91.3, lat: 37.2 }, 9)!,
    false,
  );
});

test('layout, dismissal, and gestures never issue camera navigation', () => {
  assert.equal(cameraCommandFor({ type: 'sheetChanged' }, 10), null);
  assert.equal(cameraCommandFor({ type: 'selectionClosed' }, 11), null);
  assert.equal(cameraCommandFor({ type: 'userGesture' }, 12), null);
});
