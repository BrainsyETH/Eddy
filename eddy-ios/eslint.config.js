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
]);
