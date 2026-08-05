// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // WARN, NOT ERROR — deliberately, and not permanently.
      //
      // SDK 57 brought React 19's compiler-aware hook lint, and this rule fires
      // on every fetch-on-mount screen in the app: the effect calls a loader
      // that sets `loading`/`error` before awaiting. The rule is right that
      // this cascades a render, and the two instances that were genuinely
      // avoidable have been fixed rather than silenced — the Map tab's default
      // river selection is now derived during render, and the star store's ref
      // is written in an effect instead of during render.
      //
      // What is left is "fetch when the screen mounts", which React's own
      // guidance still resolves with an effect unless you adopt a data-fetching
      // library or Suspense. Doing that to four screens is a real change with
      // real UX consequences (what shows while a river's geometry loads), and
      // it does not belong inside an SDK upgrade. Downgrading keeps the signal
      // visible without failing CI on a pattern we have not decided to change.
      //
      // Revisit when the app takes a data-fetching library — at which point
      // this line should be deleted, not updated.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // ── Reanimated shared values are mutable BY DESIGN ────────────────────
    // React 19's compiler lint treats anything a hook returned as immutable,
    // and `sharedValue.value = x` is precisely how Reanimated is driven — it
    // is the mechanism that keeps sixty-times-a-second updates off the React
    // thread entirely. There is no alternative spelling to migrate to, so
    // unlike set-state-in-effect above this is not a downgrade pending a
    // decision; it is a rule that does not apply to this library.
    //
    // SCOPED TO THE DIRECTORY rather than switched off globally, so the rule
    // keeps working everywhere it is right — which is everywhere else, since
    // this is the only corner of the app that uses Reanimated. Widen the glob
    // if that changes; do not move it up into the block above.
    files: ['src/components/map-sheet/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'off',
      // ── Gestures are BUILT during render, and they register their own ref ──
      // Gesture.Pan().withRef(ref) is how react-native-gesture-handler lets one
      // gesture be named by another component — here, how a scrolling tab page
      // tells the sheet's pan to run alongside it rather than be cancelled by
      // it. The builder chain runs inside a useMemo, which is RNGH's own
      // documented shape for it, and the rule sees a ref crossing render.
      //
      // The alternative it is asking for does not exist: the sheet cannot name
      // pages that have not mounted, and naming them by ref from the sheet's
      // side is what shipped the ReactNativeElement crash — RNGH rewrites that
      // config in place, and the refs went into a React context where a worklet
      // closure eventually swallowed one.
      //
      // Scoped to this directory, like the rule above, so it keeps working
      // everywhere it is right.
      'react-hooks/refs': 'off',
    },
  },
]);
