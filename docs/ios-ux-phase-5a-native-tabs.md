# iOS UX Phase 5A: native tabs and scroll-under content

Branch: `codex/ios-native-tabs`

## Scope

The first Phase 5 pass replaces the iOS bottom navigation with the installed
Expo Router SDK 57 native tabs. On iOS 26+, UIKit supplies the floating Liquid
Glass bar; earlier supported iOS uses its own native appearance. All five
destinations keep their order, labels, route names, and existing links. Today
remains first and the initial route. Tab minimization is explicitly disabled.

The bar uses SF Symbols and system label metrics, with Eddy's interactive tint
for selection. It has no custom background, border, blur, inactive color, or
fixed font. System material accessibility behavior is left to UIKit. The native
material is retained at scroll edges because FlatList and Map are not reliable
inputs to Expo's scroll-edge detection. The non-iOS JS tabs remain available.

Today, Favorites, Settings, and all three Alerts lists explicitly use automatic
content insets. Their top safe areas remain in place, and content can scroll
under the bar while the last row can be brought completely above it. The
navigator's first-descendant inset heuristic is disabled: it must not attach
tab-bar padding to a horizontal filter or a map-sheet scroller.

Map fills the native tab scene. Its local bottom safe area, including the tab
bar, lifts search results, Locate, Plan/View float, sheet hosts, and Mapbox
attribution. Camera padding includes this obstruction; sheet budgets exclude
it exactly once. Native Map-tab reselection does not scroll an unrelated sheet.
The Layers modal measures its own safe area so it does not inherit the tab
bar's clearance and add an empty strip beneath Done.

SDK 57 native tabs render every route eagerly. `LazyTabScreen` defers each
screen's content/effects until first focus, then keeps it mounted through tab
switches and detail pushes. This preserves the previous startup request timing
and in-memory search, map selection, planner, filters, and list state.

Phase 4 is a separate PR; this branch starts at `main` and does not include it.
Additional glass treatments for Map controls, native date-picker evaluation,
and the broader custom-content contrast pass remain later Phase 5 work.
Content cards, camping availability, charts, illustrations, and branding are
outside this change. No dependencies, native configuration, backend, or release
channels change.

## Device QA

Test on an iOS 26+ build made with a matching supported Xcode SDK, plus an older
supported iOS device if available. A JS export cannot verify UIKit's material,
actual safe-area values, VoiceOver focus, or transitions. No simulator or
physical iPhone was available during implementation.

1. **Launch and navigation:** cold launch opens Today. All five labels/icons
   remain visible in order. Switch tabs repeatedly; push a river/gauge/dam detail
   and go Back. Deep links and notification taps still open their destination.
   On cold launch, Map/Alerts screen requests should wait until those tabs are
   visited, apart from existing root/onboarding preloads.
2. **Preserved state:** enter a Today search, change tabs, then return; preserve
   the query and scope. Select a Map pin, create a float, switch away/back;
   preserve the selection/plan. Favorites filters and Alerts segments survive
   switching. Map reselection does not jump an open sheet to its first row.
3. **Scroll clearance:** on Today, long search results, Favorites, every Alerts
   segment, and Settings, scroll to the end and tap the last action. Content
   should move behind the bar with no permanent painted strip or doubled bottom
   gap. Check pull-to-refresh, short/empty/error lists, and the search keyboard.
4. **Map:** check closed, peek, half, and full sheets for river, gauge, access,
   dam, and service pins. Locate, Plan/View float, logo, and attribution must
   clear the tab bar. Drag/close sheets, switch sheet tabs, search with keyboard,
   locate, and fit a planned route. Search results and attribution stay tappable;
   selected geometry remains in the usable camera area. Test a small phone and
   a Home Indicator device, including larger text/Display Zoom.
5. **Appearance/accessibility:** check light/dark over both plain lists and the
   busy map. Enable Reduce Transparency, Increase Contrast, and Reduce Motion;
   bar labels/selection must remain distinguishable. With VoiceOver, each tab
   has its visible label, selection is announced, and the last list action and
   Map controls remain reachable. Verify maximum text sizes and the system's
   enlarged tab-label presentation where supported.
6. **Transitions:** present/dismiss alert creation, planner, sign-in, and premium
   sheets. The tab bar should not overlap modal actions or remain over a pushed
   full-screen detail. Return to the correct tab without losing its state.

## Validation

Four new geometry regressions cover native inset equivalence, full-sheet
attribution clearance, changing insets with stale sheet heights, and the
unmeasured first frame. They join the existing map/sheet tests.

- All 2,952 registered web/shared regressions passed, including 57 map/sheet
  tests. The separate Today pretest passed all 16 tests.
- Mobile typecheck/lint passed with 0 errors and 27 existing warnings.
- Web production/test typechecks, ESLint (0 errors, 14 existing warnings), and
  token/palette checks passed.
- The final Layers-modal adjustment passed mobile checks, all 5 theme tests,
  and a fresh production Hermes iOS export and archive allowlist check: 422
  files, 10.57 MB, all Metro-resolved paths included.
- Whitespace checks passed. The sandbox's blocked tsx CLI IPC socket is avoided
  by using the installed tsx Node loader with the test tsconfig; no dependency
  or CI workaround is committed.

Device QA above remains a merge gate.

## References

- [Expo SDK 57 native tabs](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/)
- [Expo native tabs guide](https://docs.expo.dev/router/advanced/native-tabs/)
- [Apple: Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
