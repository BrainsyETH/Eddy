# iOS UX Phase 2B: remaining detail headers

Branch: `codex/ios-native-detail-headers`.
Baseline: `c3622197706f9852cc5a0184d4e4d6cd8c3a30e7` (main after the Weather/Gauge pilot and camping availability colors merged, September 30, 2026).

## What changes

The native inline header from the Weather/Gauge pilot now covers these routes:

| Screen | Route | Native toolbar actions |
| --- | --- | --- |
| River | `/river/[slug]` | Share, Favorite |
| Dam | `/dam/[damId]` | Favorite |
| Access point | `/river/[slug]/access/[accessSlug]` | Share when a canonical website path is available |
| Saved/shared float | `/float/[shortCode]` | Share; Favorite once the live plan identifies the stretch |
| Saved floats | `/floats` | Back or Map |
| Eddy's Favorite Floats | `/favorite-floats` | Back or Map |
| Storage | `/storage` | Back or Map |
| Existing alert editor | `/alerts/[id]` | Back or Map |

Native Back, its history menu, and interactive back gestures remain owned by the stack. Direct entry without a previous screen uses the pilot's Map/Home action. Route options live in the root layout so headers remain available during loading, not-found, and failure states. This does not reorder routes or manufacture a previous screen.

The screens use automatic scroll insets and horizontal safe-area edges. Loading and error bodies can scroll at accessibility text sizes. Full river, dam, access, float, and alert target names remain in the content; the navigation titles are short and stable. The alert editor also opts into keyboard insets while retaining its existing Save and Delete controls and deletion confirmation.

Access points show the full river link beneath the place name in a target at least 44 points high. This works in both cached and live states and avoids fitting a potentially long river name next to Share in the navigation bar. Existing map, directions, photo, and campground actions keep their behavior.

Share and Favorite use native toolbar items and SF Symbols, with accessible action labels and selected/filled favorite state. River sharing still includes only the free summary and the canonical website path. Dam favorites still wait for the snapshot that supplies tailwater context. Float sharing and saving retain their existing URL, stretch identity, and local storage behavior.

Saved-float headings move inside the scroll view for both current and cached logistics. `PlanResult` accepts an optional header and inset behavior; its planner-sheet caller keeps its existing default insets. Warnings still precede measurements, and cached logistics never present old water conditions as current.

River's `focus=read` arrival accounts for the native header height when scrolling to Eddy's Read, including the top safe area on iOS. The existing cancellation after the user starts scrolling is retained. The installed Expo Router public `react-navigation` entry point supplies this height; its helper is deprecated upstream and should be rechecked during SDK upgrades.

## Materials and scope

The existing shared navigation theme and pilot material policy are reused: native iOS 26 scroll-edge treatment, standard translucent material on older iOS, and Eddy's existing semantic tint. No custom glass is added to content.

This pass does not change the Map canvas or camera/sheet geometry, tabs, search, camping screens, alert creation/configuration, or quiet hours. Map geometry is the next separate Phase 2 PR; task sheets and persistent planner actions remain Phase 3.

No dependencies, native configuration, runtime policy, or release channels change. No OTA, TestFlight, or App Store release is included. Native toolbar composition remains an alpha Expo API and needs a regression pass when upgrading SDKs.

References:

- [Expo native stack headers](https://docs.expo.dev/router/advanced/stack/)
- [Expo Stack Toolbar](https://docs.expo.dev/router/advanced/stack-toolbar/)

## Validation

- `make check-mobile`: passed with Node 20; 0 errors and the same 30 existing lint warnings.
- `make bundle-mobile`: production Hermes iOS export and archive allowlist passed (409 files, 10.55 MB; all Metro-resolved paths present, no secrets/media).
- All 2,913 registered web/shared regression tests passed, with no failures or skips. Ran the existing test file list through the tsx Node loader and `tsconfig.test.json`.
- `git diff --check`: passed. No new source-pattern tests were added for native layout or gestures.

Device QA remains required; this environment has no iOS simulator or physical device.

## Device QA

Run the main paths on a small and a larger iPhone. Check light/dark appearance and default/accessibility text sizes, with iOS 26+ and an older supported iOS version where available.

- [ ] Search → River → Gauge → Back → Access point → river link → Back: one header per screen; correct previous screen, search query, and scroll position; canceled edge-swipe leaves controls interactive.
- [ ] Today → Eddy's Read → View full Read: the Read heading lands below the native header. Starting to scroll manually cancels pending auto-positioning.
- [ ] River and Dam: toggle Favorite twice; verify the Favorites tab updates and the native icon/VoiceOver label changes. Dam Favorite still appears only once the snapshot is available.
- [ ] River and Access: Share opens the correct website link; River includes only the free summary. Cancel and reopen the share sheet. Missing Access share paths produce no Share control.
- [ ] Access: open a cached place offline and an uncached place with a slow or failed connection. Back/Map remains available in every state. The river link wraps at large text sizes and opens the correct river. Horizontal photo galleries still swipe normally.
- [ ] Favorites/Profile → Saved floats → Float: title, route, warnings, measurements, and final content remain readable while scrolling under the bar. Favorite and Share work, and returning to the list keeps its position.
- [ ] Open a saved float offline: cached trip details, dated cautions, and the current-conditions retry remain reachable. Reconnect and check that the current plan replaces the cached logistics correctly. Open an invalid float link and verify the error, retry, and navigation.
- [ ] Today → Eddy's Favorite Floats: header and introductory text are readable, pull-to-refresh still works, and Plan this float opens the expected stretch on Map. Empty/offline states remain scrollable.
- [ ] Profile → Storage: measured size and the clear-data action are reachable. Cancel the confirmation and verify nothing was cleared. If testing Clear, use a test device and confirm favorites/saved floats remain intact.
- [ ] Alerts → existing river alert → child gauge alert: each full target name is visible. Edit thresholds with the keyboard open, scroll to Save, and confirm the save result. Active/Just once behavior and parent links are unchanged. Cancel Delete and verify the rule remains. Missing alert IDs retain navigation.
- [ ] Cold-open River, Dam, Access, Float, and an invalid alert route without navigation history: the house control returns to Map during loading, success, and failure.
- [ ] Across all migrated screens: no doubled headers, extra top bands, hidden first/last rows, white flashes in dark mode, or stacked blur. Check Increase Contrast, Reduce Transparency, Reduce Motion, and VoiceOver action labels.
- [ ] Regression: Weather/Gauge pilot still works. The Map planner sheet retains its previous spacing and Save/Share behavior; tabs, current-alert filters, camping, and alert creation look unchanged.

Report device/iOS version, entry path, appearance/text-size setting, and a screen recording for layout or gesture failures.
