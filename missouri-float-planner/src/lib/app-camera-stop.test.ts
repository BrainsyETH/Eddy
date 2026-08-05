import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The map's camera stop must not be rebuilt on every render.
//
// ── Why this is a test and not a review note ──────────────────────────────────
// Nothing else catches it. It type-checks, it lints, it bundles, and it shows up
// only as a map that fights the user's fingers.
//
// @rnmapbox/maps assembles ONE camera stop from the Camera's props —
//
//   const nativeStop = useMemo(() => …, [centerCoordinate, bounds, heading,
//     pitch, zoomLevel, padding, animationDuration, animationMode])
//
// — and hands it to native as `stop`. The dependency check is by identity, so an
// inline object or array literal is a new value on every render, and a new stop
// is a stop that gets APPLIED. Applying one is not a no-op just because the
// target has not moved: in the `bounds` branch it re-FITS to the whole selected
// river or the whole statewide network, and in the `focus` branch it flies back
// to the last target. Gestures live in the native camera and in no React state,
// so there is nothing in a re-applied stop that remembers where the user had
// panned or zoomed to — it discards it.
//
// That was the bug behind "tapping a POI zooms me out real far": selecting a pin
// re-renders the map, the re-render minted a new padding object and a new
// centerCoordinate array, and the camera snapped back to its last React-computed
// framing.
//
// Lives here because the Expo app has no test runner of its own — the same
// arrangement as app-worklet-closures.test.ts, which is also a structural
// invariant read out of the app's source as text.
const MAP = join(process.cwd(), '../eddy-ios/src/map/RiverMap.tsx');

test('the camera stop is built from stable references', () => {
  const source = readFileSync(MAP, 'utf8');

  // `padding` is the prop most easily written as a literal, because it reads as
  // four constants and three of them are.
  const padding = /\n\s*padding=\{(\{?)/.exec(source);
  assert.ok(padding, 'RiverMap no longer passes a `padding` prop to Mapbox.Camera');
  assert.equal(
    padding[1],
    '',
    'Mapbox.Camera is given an inline padding literal. A new object every render ' +
      'is a new camera stop every render, and applying one throws away the ' +
      "user's own pan and zoom. Pass a memoised value — see cameraPadding.",
  );

  // The rest of the stop — centerCoordinate, zoomLevel, bounds — comes through
  // cameraProps, whose `[lng, lat]` array has the same problem.
  assert.match(
    source,
    /const cameraProps = useMemo\(/,
    'cameraProps is no longer memoised. It carries centerCoordinate as a fresh ' +
      '[lng, lat] array, so an unmemoised cameraProps re-applies the camera on ' +
      'every render of the map. See its own comment.',
  );
});
