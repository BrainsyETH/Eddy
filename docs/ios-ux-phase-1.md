# iOS UX Phase 1

Implementation branch: `codex/ios-native-ux-phase-1`.
Source baseline: `1757432abaa912fc485bc778ec058836f8d18668` (main, September 30, 2026).

This is the first implementation batch of the iOS UX plan. Source checks confirmed the scoped-alert link, search dimensions, Back semantics, alert filter dimensions, subtle-text contrast, and map motion findings still exist at this baseline. Open PRs were reviewed; the older API-client refactor remains separate from this change.

## Changes

- Today opens `/current-alerts` with its favorites/nearby/statewide scope and suggested rivers. Both categories counted by Today appear in separate labeled sections, with shared rows and explicit agency attribution. Mine remains the default in the Alerts tab.
- A bounded, versioned route descriptor carries river slugs, without coordinates or alert payloads. Missing or invalid scope falls back visibly to statewide warnings. View all current alerts includes all high-water entries and public notices; returning restores the original scope.
- The summary and destination share filtering and completeness rules. Loading, failed requests, confirmed zero, and cached results after failed refresh remain distinct. The destination retains successful data when another feed fails and provides Retry and pull-to-refresh. New data may legitimately change counts after navigation.
- Custom chevron Back controls share an actual 44-point target and button role, including existing loading/error headers. The error-state Go back link also has a real 44-point target. Centered alert-header spacers match the new Back width.
- Search grows with text size, uses the existing 16-point body style, and gives Clear its own 44 by 44 target inside the field. Today’s VoiceOver escape and Cancel use the same exit handler; result navigation keeps the existing search state.
- Alert filters have a minimum 44-point target and wrap as needed. Their selected accessibility state remains explicit. The Add button is also 44 by 44.
- Light subtle text uses neutral 600. Dark subtle text uses neutral 300 because neutral 400 failed the target on raised dark surfaces. Public-notice headlines use normal text ink, with written severity and source attribution rather than relying on stripe color.
- Map camera commands apply Reduce Motion when executed, including commands awaiting sheet geometry. Reduced moves are immediate; existing static selection cues, gesture cancellation, zoom intent, and command IDs remain intact. Initial camera navigation conservatively avoids animation until the preference resolves.

## Source and delivery baseline

| Item | Verified source configuration |
| --- | --- |
| App version | 1.3.0; portrait; iPhone only; automatic appearance |
| Runtime policy | iOS fingerprint policy |
| Expo / React Native / Router | 57.0.25 / 0.86.3 / 57.0.23 |
| Existing native dependencies | expo-symbols 57.0.3, @expo/ui 57.0.20, expo-glass-effect 57.0.4, react-native-screens 4.26.2 |
| EAS profiles | preview → preview channel; production → production channel with remote auto-increment |
| Installed build number and fingerprint | Not available in this environment |
| Native simulator/device | Not available in this environment |

The changes use existing dependencies and do not alter native configuration. They are candidates for a matching-runtime OTA after device verification. The installed binary, channel, and actual runtime still need checking before a release. Native header, tab, and date-control pilots belong to subsequent phases; existing lockfile entries alone do not prove older binaries support them.

## Automated verification

- Mobile typecheck and lint via `make check-mobile`.
- Production iOS Hermes bundle and archive allowlist via `make bundle-mobile`.
- Web and shared-test typechecks, plus ESLint, passed during `make check-web`. Its token-lint launcher hit the environment’s `tsx` IPC socket restriction. The same token checker and all registered tests were then run through `node --import tsx`, with `TSX_TSCONFIG_PATH=tsconfig.test.json` for the test suite. All 2,913 tests passed.
- New regression coverage checks scope round trips, both alert categories, suggestions, nearby resolution, invalid direct links, empty nearby scopes, loading/zero/failure/cached-refresh distinctions, and all six camera navigation intents with Reduce Motion.
- Calculated subtle-text contrast: light canvas 5.41:1, white card 5.85:1, raised card 5.51:1, selected surface 5.27:1; dark canvas 9.21:1, card 7.54:1, raised/selected surface 5.92:1. These calculations do not substitute for device appearance checks.

## Device checks before visual sign-off

- [ ] Record the installed build number, runtime, channel, iOS version, and device size.
- [ ] Today alert count → matching scoped categories; open a result and return; View all and restore scope. Test favorites, nearby, no personalization, suggestions, and direct links with invalid scope.
- [ ] Exercise zero, one-feed failure, two-feed failure, partial loading, cached failed refresh, and successful retry. Verify no failed request reads as a successful empty result.
- [ ] Check minimum-size and large iPhones at default, largest standard, and accessibility text sizes. Search, Clear, Cancel, Back, and alert filters remain readable and operable without overlapping targets.
- [ ] VoiceOver announces Back/Clear/Cancel, selected alert filters, severity, units, and notice source. Escape exits search; returning from a result retains the query.
- [ ] Check light/dark and increased contrast on actual surfaces, including disabled controls and error copy. Increased-contrast dynamic colors remain Phase 5 work.
- [ ] With Reduce Motion on at launch and toggled during a session, test river, POI, search, location, cluster, and plan framing. Verify the static selection remains clear, gestures still win, and sheet changes never replay a camera command.
- [ ] Confirm the existing camping green/red presentation, Premium Reads behavior, weather/alerts pairing, and five tab destinations remain coherent.

Native headers and map canvas improvements are the next implementation phase. No App Store, TestFlight, or OTA release is included in this branch work.
