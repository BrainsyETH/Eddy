# iOS UX Phase 4: camping, dam, and weather accessibility

Original Phase 4 branch: `codex/ios-phase-4-accessibility` (merged in PR #1382).
Review follow-up branch: `codex/ios-review-stabilization`.
Original baseline: `425c0a0667eb666a1c7cc8636270116174097f96`. Updated against main after Phase 5A native tabs merged (PR #1383).

Phases 4A and 4B are combined at the user's request.

## Camping

The full Camping screen offers Grid and List. List is the automatic default with VoiceOver or a text scale of at least 1.3; an explicit display choice wins for the current screen visit. The grid, green/red availability marks, river grouping, campground images, and All rivers / Favorites / Nearby filters remain. The compact Today camping card is unchanged.

List shows every matching campground for one selected night. Each row names the campground, date, availability state, and freshness, using the same current-observation rules as the grid. Not checked, no reservable sites, no reservable openings, closed, and not yet released remain distinct. First-come sites are named separately. Previous/next controls step within the tracked horizon, and the date picker exposes the full horizon, including nights that have not been checked. Opening a row carries its selected night into the individual-site view as a one-night stay. Existing facility/river/night links still work.

The stay picker uses full-width date rows for VoiceOver, larger text, or a measured width too narrow for seven 44 pt targets. Both calendar and list use the same allowed-date function. Checkout can be the day after the final tracked night and must follow arrival. Picking arrival advances to departure, including across a month boundary; VoiceOver announces that transition. Apply and Cancel stay outside the scrolling dates, and Apply is disabled for an invalid draft. Cancel/escape leaves the original stay intact. Site cards show night-by-night text at larger sizes and with VoiceOver, with clear booking links and scalable labels.

Camping filter rows can grow with text. The new night picker and existing campground/stay sheets measure their own safe areas. These sheets and the river picker respect Reduce Motion. New buttons and selectable date rows have at least 44 pt targets.

## Dams and weather

Dam metrics use one column at larger text sizes or narrow phone widths. Labels can wrap, numeric readings use tabular typography, and VoiceOver reads the label, value, units, and freshness together. Older readings have a text indicator. The generation hero's spoken summary is attached to its visible figure instead of a zero-height text node.

Generation schedules offer Show hourly details, with complete time windows and values. Details are the default for VoiceOver, larger text, or narrow phones; the chart remains available, and compact list-row charts remain unchanged. Generation patterns show their existing measured/scheduled/missing-data summaries as readable text at larger sizes. The shared disclosure heading places trailing status below its title when space is tight and allows its summary to wrap; dam schedule headings include the trailing status in their spoken label. Buttons and loading/error copy on the dam page can wrap.

Weather keeps its atmospheric background, illustration, colors, and standard-size structure. At larger text sizes or narrow phone widths, the hourly forecast becomes wrapping text rows, daily forecasts show labeled high/low values, and wind/humidity cards stack. The large hero reading uses a smaller base text token while retaining system text scaling. Forecast rows and metrics have grouped VoiceOver descriptions, including conditions, Fahrenheit, miles per hour, and rain probability. Decorative imagery does not become a separate reading.

## Phase 1–5 review corrections

- Current Alerts, Camping, and Quiet Hours use the root native stack header in
  loaded, loading, error, and empty states. Camping filters and coverage copy
  scroll away; only grid dates pin. The loaded Camping list uses explicit
  measured navigation-bar/bottom-safe-area insets, including the sticky stop
  and scroll indicators; other states/screens retain automatic insets.
- Loaded river, gauge, dam, and access-point names appear in native titles.
  Full names remain in the body. Cold detail links show a Map symbol for Map;
  Current Alerts/Camping return to Today, and Quiet Hours returns to Settings.
- Current Alerts uses section loading indicators on first load/retry and the
  native refresh spinner only for a user pull.
- Supporting text uses separate secondary/tertiary tones in both schemes.
  Standard page, card, raised, and selected backgrounds clear 4.5:1 without
  making tertiary text brighter than secondary. Selected toolbar stars use
  the interactive tint and filled symbol, preserving a non-color selection cue.
- Alerts segments expose tab roles and selected state. An unchanged alert
  configuration no longer registers a dismissal block; unsaved edits still
  prompt, and save/sign-in/permission work still blocks dismissal while busy.
- Map fading and interaction eligibility use the live sheet clearance. Only
  boundary crossings reach React; hit testing and VoiceOver no longer wait for
  the sheet's settled height. Camera padding/attribution retain settled updates.
- Map filters now dismiss by dragging the grabber/header down. Small or
  cancelled pulls settle back, rows scroll independently, and live selections
  survive closing. Done, backdrop tap, and VoiceOver escape remain available;
  Reduce Motion removes the release animation.
- A local iOS module disables UIKit scroll-edge effects inside Map detail page
  scrollers and their horizontal tabs, targeting the lingering white veil
  reported after fast expansion. The native tab bar retains its glass. This
  correction needs a new iOS binary and device confirmation.
- Dam chart labels have an 11 pt base minimum. The current-time label stays
  inside the plot. Spoken schedule headings include full hour counts, peak and
  idle windows, and Central time; the chart/details button states the current
  presentation instead of claiming to expand a disclosure.
- README documents native-tabs API, lazy mounting, insets, and accessibility
  checks for future SDK upgrades.

## Scope and validation

The iOS changes add no third-party dependencies and change no API contracts, backend calculations, permissions, or release channels. The Map blur follow-up adds a local native Expo module and therefore requires a new iOS binary. The branch also incorporates the independently reviewed web security patches in the now-merged PR #1384. Native tabs are inherited from main. Adaptive increased-contrast tokens, additional materials, and system date-picker replacement remain later work. This PR includes no deployment or release.

- All 2,959 registered regression tests and the separate 16-test Today pretest passed with no failures or skips. New coverage includes date-choice boundaries, supporting-text contrast/hierarchy across light/dark surfaces, and Map interaction thresholds during a drag/reset.
- Web production/test typechecks and ESLint passed (0 errors, 14 existing warnings). Token/palette checks passed.
- `make check-mobile` passed on Node 20 with 0 errors and 27 existing warnings.
- `make bundle-mobile` passed: production Hermes iOS export and archive allowlist check (424 files, 10.59 MB; every Metro-resolved path included).
- Review follow-up: 104 targeted camping, alerts, Map geometry, and theme tests passed; mobile typecheck/lint retained 0 errors and the same 27 existing warnings. The production export and archive check were repeated for the follow-up.
- Map gesture follow-up: 118 existing Map geometry, layer-row, tab, and peek
  regressions passed. Expo Apple autolinking resolves `EddyMapSheetModule` and
  its podspec. The archive guard includes all four local module files and
  rejects generated module build files and secrets (428 files, 10.60 MB).
- Whitespace check passed.

The environment blocks the tsx CLI IPC socket. The registered test file list and token script ran through the installed tsx Node loader, retaining `tsconfig.test.json` for tests; no dependencies or CI commands changed for this workaround.

No Xcode, simulator, or physical iPhone is available here. The new Swift view has not been compiled here; device rendering, safe-area measurements, VoiceOver focus/order, gestures, and the blur correction require verification in a rebuilt iOS app.

References: [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Dynamic Type](https://developer.apple.com/videos/play/wwdc2024/10074/), and [React Native accessibility properties](https://reactnative.dev/docs/accessibility).

## Device QA — combined next-build checklist

Use a small iPhone and a Home Indicator device. Check default text and the largest accessibility sizes, light/dark appearance, increased contrast, VoiceOver, Reduce Motion, and Display Zoom. This app remains portrait-only. Include an older supported iOS version and iOS 26.

- [ ] Cold-launch each tab. Today is first; labels and SF Symbols remain clear.
  Switching tabs preserves state. Scroll the last row above the inset tab bar;
  verify content moves under system chrome without an extra colored band.
- [ ] Open Current Alerts, Camping, and Quiet Hours through the app and direct
  links. Verify one native title/back control, edge-swipe, and correct home
  fallback. Check loading, failure/retry, signed-out, and empty states; no
  initial row or final action sits under a bar/Home Indicator.
- [ ] Open river/gauge/dam/access details with long names, including offline
  access data and dam catalog fallback. Native titles identify the place, full
  names remain readable in the body, and selected stars stay clear in both
  appearances. Inspect supporting text on raised/selected surfaces, too.
- [ ] VoiceOver identifies Alerts segments as selected/unselected tabs. Open
  alert configuration and swipe-dismiss without edits; then edit and retry:
  Keep editing preserves the form and Discard closes it. Try cancellation while
  saving/signing in/enabling notifications, and confirm a successful save is
  not duplicated on retry or interrupted by dismissal.
- [ ] Slowly drag a Map sheet through the point where search and lower controls
  fade away, pause without releasing, and drag back. Invisible controls must
  not accept taps or VoiceOver focus; they become usable as they return. Watch for a dropped frame at the hide/show boundary. Repeat
  with search open, large text, Reduce Motion, rapid close/reopen, and tab changes.
- [ ] Map filters: drag down from the grabber and from the title/header. Try a
  short pull, a deliberate pull, a downward flick, and reversing upward before
  release. Scroll the rows to the bottom and drag the header again. Reset,
  switches, refinement chips, Done, backdrop tap, and VoiceOver escape still
  work; close/reopen retains filters and starts with the sheet at rest.
- [ ] In a rebuilt iOS 26 app, open Slabtown Recreation Area and rapidly flick
  the detail sheet from peek to expanded several times. Overview text/photos
  and the tab row must stay clear after release, including light/dark mode,
  Reduce Motion, changing sheet tabs, changing app tabs, and closing/reopening.
  Repeat with a river, gauge, dam, and another access point. Native tab-bar
  glass remains visible; page scrolling, sticky headers, horizontal paging,
  final-row reach, and older-iOS behavior remain intact. Reloading JavaScript
  in an old client is insufficient to validate the native blur correction.
- [ ] Today remains compact. Open Camping: standard text starts in Grid; large text or VoiceOver starts in List. Manually switch views, change text size, and toggle VoiceOver. Explicit display choices remain respected during the visit.
- [ ] Scroll Camping Grid on a small iPhone: filters, Grid/List, and coverage
  scroll away; only the date row pins below the native header. Swipe the dates
  horizontally while pinned; columns stay aligned. Change text size/Display
  Zoom, switch Grid/List, and test empty filters and pull-to-refresh. The last
  campground/booking action and scroll indicator clear the Home Indicator.
- [ ] Cold-open Current Alerts on a slow connection: section spinners appear
  without an active pull-to-refresh spinner. Retry a failed section, then pull
  to refresh; each action uses its appropriate loading state.
- [ ] In List, step through nights and open the date picker. First/last-night arrows disable correctly. Choose dates across month/year boundaries and beyond the last observed night. Rows use the same selected night and show unknown availability honestly.
- [ ] Compare Grid and List against the same campground/night. Check open, full, zero reservable sites, closed, unreleased, missing/stale data, and first-come states. No status requires distinguishing green from red. Filters still return to All rivers; campground ordering stays grouped by river.
- [ ] Tap a list row and verify the campsite view's arrival equals that selected night, with checkout the next day. Done returns to the same filter/date. Check existing Today river/night links and direct facility links too.
- [ ] Open Stay dates at default, large, and narrow widths. No calendar cell has a hit area narrower than 44 pt; the alternative uses full-width rows. Select arrival at a month end, then departure. Check the last tracked night and its checkout. Apply updates the site results; Cancel/VoiceOver escape preserves the old dates. Apply and Cancel stay above the Home Indicator while the dates scroll.
- [ ] With VoiceOver, hear each campground's name/date/status/freshness once, then open it. Hear the arrival-to-departure prompt, selected date, disabled month controls, per-site nightly states, and booking-link destination. Check focus after each modal opens/closes and after date selection. Native modal focus still needs device confirmation.
- [ ] Camping loading, failed refresh, empty filter, denied Nearby permission, and booking-link failure stay actionable at large text. Reconnect and retry without losing the selected night. Reduce Motion removes the app-owned sheet animation.
- [ ] Open a dam with turbine generation, lake/tailwater metrics, and a schedule, then one with partial/no data. At large text, readings stack and labels/units/actions remain complete. VoiceOver reads the visible generation figure and older-reading indicators.
- [ ] Expand a schedule day and switch between hourly chart/details. Compare every displayed time/value with the chart. VoiceOver can reach each hour without scrubbing a tiny bar. Measured versus scheduled generation, missing observations, and stale-plan caveats remain distinct in the pattern summaries. Check a shared disclosure elsewhere (for example, river hazards) for heading/trailing-status wrapping.
- [ ] Open Weather with current readings and forecast-only data. Default layout keeps its visual character; larger text stacks metrics and exposes labeled highs/lows. Check long day/city names, negative and three-digit temperatures, 0%/100% rain, offline retry, and pull-to-refresh. VoiceOver announces conditions and units once per reading, without decorative glyph names.

Report device/iOS version, text size, accessibility settings, entry point, and exact action sequence. Include a recording for clipping, focus, or gesture issues.
