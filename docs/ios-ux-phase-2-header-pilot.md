# iOS UX Phase 2: Weather and Gauge header pilot

Branch: `codex/ios-native-headers-pilot`.
Baseline: `7f303a9321df5e8348c330dbac45ff7c6e026700` (main after Phase 1 merged, September 30, 2026).

## Scope and behavior

- Weather and Gauge opt into the existing native stack header with inline system titles. Other routes retain their current headers. The route options callback preserves the existing route order and direct-link history.
- Weather keeps its atmospheric hero, Eddy illustration, typography, forecast panels, and pull-to-refresh. Its custom Back/title row and duplicate vertical safe-area padding are removed.
- Gauge keeps its full station name in the scrollable content, avoiding reliance on a truncated navigation title. Share and Favorite move into the native header using SF Symbols. Share keeps the existing canonical website URL and share-sheet behavior. Favorite keeps the same local store and clearly announces Add/Remove from Favorites, with a selected state and filled star.
- Gauge loading, unavailable, and not-found states retain the native navigation header. Their content scrolls when needed at large text sizes; Retry and the source link stay reachable.
- Normal pushes use UIKit's Back button, history menu, and interactive back gesture. A direct link with no previous screen gets a native Map/Home action that replaces the detail route with `/`.
- Both pages use automatic scroll-view insets, with only left/right safe-area padding at the screen level. Content and scroll indicators can move under the header without manually calculated top padding. No screen keys or content fetch policies change.
- Expo Router's navigation theme follows Eddy's existing light/dark scheme and semantic text/tint colors. Navigation keeps system fonts and materials. The stack content background matches Eddy to prevent a mismatched transition background.
- On iOS 26+, the header uses the system scroll-edge treatment without an added blur. Older iOS uses `systemMaterial` on the translucent native bar. Cards and the Weather hero retain their existing opaque/gradient styling.

## API and delivery

Verified against installed Expo Router 57.0.23 and react-native-screens 4.26.2. `Stack.Toolbar` is the supported composition API in this installed version; Expo still marks it alpha, so upgrades need a toolbar regression pass.

References:

- [Expo native stack headers](https://docs.expo.dev/router/advanced/stack/)
- [Expo Stack Toolbar and navigation theme guidance](https://docs.expo.dev/router/advanced/stack-toolbar/)

No dependency, native configuration, fingerprint-policy, or EAS-channel changes. This is a source-only pilot; a matching installed runtime still needs verification before any OTA or TestFlight release. No release is included.

## Automated verification

- `make check-mobile`: passed; 0 errors and the same 30 existing lint warnings.
- `make bundle-mobile`: production iOS Hermes export and archive allowlist passed. The archive contains all Metro-resolved files and no secrets/media.
- All 2,913 registered web/shared regression tests passed through `node --import tsx` using the existing test file list and `tsconfig.test.json`. This uses the loader to avoid the environment’s blocked tsx CLI IPC socket. No new source-pattern tests were added for native UIKit behavior; that requires the device checks below.

## Device QA before expanding the rollout

Test a small iPhone and a larger iPhone, in light/dark mode, at default and accessibility text sizes. Include iOS 26+ and an older supported iOS version when available.

- [ ] Today → Weather: one native header/Back control; no extra top gap; atmospheric hero looks unchanged; pull-to-refresh works.
- [ ] Scroll Weather to the bottom and back: forecast/source content and scroll indicators stay clear of the bar and Home Indicator; no doubled blur.
- [ ] Open a Gauge from Search, Favorites, a river, and an alert. Back and edge-swipe return to the correct screen with prior search/filter/scroll state intact. A partly completed, canceled back swipe leaves Gauge interactive.
- [ ] Open Gauge → River → Back. Gauge retains its scroll position and current Favorite state.
- [ ] Check a long gauge name: it remains fully readable in the content; native controls do not collide with the inline Gauge title.
- [ ] Toggle Favorite twice, open the system Share sheet, cancel it, and try again. Confirm the canonical link and saved state. Unsupported providers still have no Share button; unresolved IDs still have no Favorite button.
- [ ] Cold-open `/gauge/07067000`, a nonexistent gauge, and `/weather?lat=37.1&lng=-91.3` through the development build's link handler. The Map/Home control works during loading, after success, and after failure. Opening `/weather` without coordinates still explains how to choose an area.
- [ ] Offline first load → Retry → recovery: no blank header, hidden Retry, or trap. At large text sizes, error copy and actions can scroll.
- [ ] VoiceOver reads Back or Go to Map, Share plus station name, and Add/Remove from Favorites. Selected state changes after a favorite toggle.
- [ ] Switch appearance while on each screen and push/pop in dark mode: no white flash or stale toolbar tint. Check Increase Contrast and Reduce Transparency on actual native materials.
- [ ] With Reduce Motion enabled, check push/pop and ensure no custom animation was introduced.
- [ ] Confirm the other tabs and custom-header routes still look and behave as before.

No simulator/device is available in this workspace. The device checks above remain outstanding. Remaining detail headers and the map canvas/geometry changes are separate Phase 2 PRs after this pilot is reviewed on device.
