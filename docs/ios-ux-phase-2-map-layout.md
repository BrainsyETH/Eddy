# iOS UX Phase 2C: Map canvas and floating controls

Branch: `codex/ios-map-layout`.
Baseline: `23ecf453204ac0ba86dd2309baaed555e4c5cca3` (main after the Phase 2B detail headers merged, September 30, 2026).

## What changes

The Map title band is removed. The map fills the tab scene and extends behind the status bar. Search and Layers float together below the top safe area, using Eddy's existing semantic surfaces and elevation. Locate and planner controls retain their bottom positions and follow the selected sheet. The status bar uses dark text over the light Outdoors basemap and gives appearance control back to the app when Map loses focus or opens its planner/layers modal.

The measured map canvas, rather than window height, now supplies camera geometry. Top padding clears measured search/notice height and the safe area. Bottom padding clears the selected sheet and attribution band whenever there is room, with a minimum usable camera viewport when the sheet is expanded. Attribution uses the full sheet height independently of that camera cap. Horizontal safe areas also apply to controls, sheet pages, and attribution.

The sheet host has a stable top boundary below the safe area and ends above the existing tab bar. Expanding sheets, notices, and search no longer change the map's layout height. Search and bottom controls fade as the available space shrinks; settled controls without room are removed from hit testing and VoiceOver. Visibility follows measured space, including tall accessibility-sized previews, rather than assuming only a named full detent can overlap controls.

Camera movements remain one-time responses to explicit actions. A new selection must publish its own sheet measurement before its pending camera move runs; an earlier selection's height cannot mark it ready. Closing or entering search clears readiness, including reopening the same selection. Resizing a sheet or receiving fresh data does not replay an already consumed camera command. Existing gesture cancellation and Reduce Motion behavior remain in place.

Search has an explicit Cancel action. Focusing it hides the selected sheet and map action controls; Cancel clears the query, dismisses the keyboard, and restores the selection. Selecting a result also dismisses the keyboard. Keyboard avoidance applies to the search overlay, so results can shrink/scroll without resizing the canvas. Empty/error search copy can scroll, and result rows have a minimum 44-point height.

## Scope

The existing tab bar still consumes its own bottom safe area. Native floating tabs, SF Symbols across tabs, and the wider material pass remain Phase 5. This change adds no glass to map content or sheets and introduces no new brand tokens.

No dependency, native configuration, runtime-policy, backend, or release-channel changes are included. Mapbox still requires a development/native build; Expo Go can only check the fallback screen. No OTA, TestFlight, or App Store release is included.

References: [Mapbox Camera](https://rnmapbox.github.io/docs/components/Camera), [React Native KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview). Implementation was checked against the installed package sources as well.

## Validation

- `make check-mobile`: passed with Node 20; 0 errors and the same 30 existing lint warnings.
- `make bundle-mobile`: production Hermes iOS export and archive allowlist passed; all Metro-resolved paths present, no secrets/media.
- All 2,919 registered web/shared regression tests passed, with no failures or skips. Six new geometry tests cover small/large phones, sheet detents, attribution clearance, large chrome, and resizing. The existing camera-command/gesture regression tests also pass.
- `git diff --check`: passed.

Device QA remains required; this environment has no iOS simulator or physical device.

## Device QA

Use a small iPhone and a larger notched/Dynamic Island iPhone. Check light/dark appearance and default/accessibility text sizes, with iOS 26+ and an older supported iOS version where available.

- [ ] Open Map with no selection: no Map title band or extra painted top strip; map reaches behind the status bar. Search/Layers clear the notch. Locate, planner, attribution, tabs, and Home Indicator are unobstructed.
- [ ] Select a river, then an access point, gauge, dam, hazard, and service. Expand/collapse each sheet. The canvas never jumps in height, tabs remain reachable, and the logo/attribution remain available at every resting position.
- [ ] At peek/half, selected pins and fitted rivers land in the visible area between search and the sheet. Switch between short and tall previews quickly, close/reopen the same pin, and select from search: no framing based on the previous sheet's size.
- [ ] Drag to a tall/full sheet, then collapse: search and map controls fade away before overlapping and return afterward. VoiceOver does not land on settled hidden controls. Sheet Close/Back and its adjustable grabber remain usable.
- [ ] Pan/zoom manually after selecting. Expand/collapse sheets and let data finish loading: the camera does not jump back. Start a gesture while a selection is still loading: a delayed camera command does not take control back.
- [ ] Search with the keyboard open: results remain scrollable and tappable on the first tap. Cancel dismisses the keyboard, clears the query, and restores the selection. Repeat with one character, no results, failed/offline search, and large text. Check VoiceOver escape too.
- [ ] Open Layers, toggle a layer/filter, close it, and return from another tab. Search, controls, and status-bar contrast remain correct. The changed-layer indicator still appears.
- [ ] Request location with permission granted and denied. Locate stays reachable, the successful fix frames below search, and the existing denied-permission recovery remains usable.
- [ ] Create a plan, close/reopen its sheet, clear it, and create another. Route/endpoints frame as expected; there is no jump or leftover control offset when the planner closes. Check dark status-bar text does not carry into dark planner content.
- [ ] Switch tabs and push/open a detail screen, then return to Map. No stale search keyboard, displaced controls, duplicate top inset, or status-bar contrast change persists.
- [ ] Test slow/failed readings and the Expo Go/missing-token fallback. Loading/error copy stays readable and navigation remains available. A conditions notice does not resize the canvas or sheet.
- [ ] Repeat core gestures with Reduce Motion, Increase Contrast, Reduce Transparency, and VoiceOver. Check 44-point actions and large-text layout on the smallest device.

Report device/iOS version, entry path, appearance/text size, and a recording for layout or gesture failures.
