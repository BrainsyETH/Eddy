# iOS UX Phase 4: camping, dam, and weather accessibility

Branch: `codex/ios-phase-4-accessibility`.
Baseline: `425c0a0667eb666a1c7cc8636270116174097f96` (main after Phase 3C merged, September 30, 2026).

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

## Scope and validation

No dependencies, API contracts, backend calculations, permissions, native configuration, or release channels change. Native tab bars, the broader material/contrast pass, and system date-picker replacement remain later work. This PR includes no deployment or release.

- All 2,951 registered regression tests passed with no failures or skips. Three new tests cover the shared date choices, arrival/departure boundaries, the final checkout date, year changes, and Central daylight-saving boundaries.
- Web production/test typechecks and ESLint passed (0 errors, 14 existing warnings). Token/palette checks passed.
- `make check-mobile` passed on Node 20 with 0 errors and 27 existing warnings.
- `make bundle-mobile` passed: production Hermes iOS export and archive allowlist check (424 files, 10.59 MB; every Metro-resolved path included).
- Whitespace check passed.

The environment blocks the tsx CLI IPC socket. The registered test file list and token script ran through the installed tsx Node loader, retaining `tsconfig.test.json` for tests; no dependencies or CI commands changed for this workaround.

No simulator or physical iPhone is available here. Device rendering, safe-area measurements, VoiceOver focus/order, and gestures have not been visually verified.

References: [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Dynamic Type](https://developer.apple.com/videos/play/wwdc2024/10074/), and [React Native accessibility properties](https://reactnative.dev/docs/accessibility).

## Device QA

Use a small iPhone and a Home Indicator device. Check default text and the largest accessibility sizes, light/dark appearance, increased contrast, VoiceOver, Reduce Motion, and Display Zoom. This app remains portrait-only. Include an older supported iOS version and iOS 26.

- [ ] Today remains compact. Open Camping: standard text starts in Grid; large text or VoiceOver starts in List. Manually switch views, change text size, and toggle VoiceOver. Explicit display choices remain respected during the visit.
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
