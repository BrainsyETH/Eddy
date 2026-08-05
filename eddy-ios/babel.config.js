// eddy-ios/babel.config.js
// Exists ONLY to add Reanimated's worklet transform. Everything else here is
// what Expo would have applied on its own.
//
// ── Why this file did not exist until now ─────────────────────────────────
// Expo's Metro transformer applies babel-preset-expo with no project config at
// all, resolving the preset from its OWN location. That worked because npm
// nests the preset under expo/ in this tree rather than hoisting it (see the
// note about nested transitive deps in metro.config.js).
//
// The moment this file exists, Babel resolves 'babel-preset-expo' relative to
// THIS DIRECTORY instead — and it was not resolvable from here. That is why
// babel-preset-expo is now an explicit devDependency: adding a babel config
// without it fails the production export while the dev server keeps working,
// which is the failure mode `make bundle-mobile` exists to catch.
//
// ── The plugin MUST be last ───────────────────────────────────────────────
// react-native-worklets/plugin rewrites function bodies marked 'worklet' so
// they can run on the UI thread. It has to see the output of every other
// transform, so any plugin appended after it silently produces a worklet that
// runs on the JS thread instead — no error, just a sheet that stutters under
// load. On SDK 54+ this plugin lives in react-native-worklets, NOT in
// react-native-reanimated where older guides put it.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
