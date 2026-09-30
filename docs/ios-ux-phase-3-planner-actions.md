# iOS UX Phase 3A: persistent planner actions

Branch: `codex/ios-planner-actions`.
Baseline: `fc0bc781dc3a5e40dede6c841b3e11e2c01f65a8` (main after the Phase 2C map layout merged, September 30, 2026).

## What changes

Save and Share move from the end of the plan into a persistent bottom action area inside the planner sheet. The footer occupies normal layout space, so it cannot cover the result's final rows. A safe-area provider at the modal root measures that presentation's insets; the footer owns its bottom inset when visible. Pickers, loading, and failed calculations do not display result actions.

The existing outlined Save/filled Share hierarchy and semantic colors remain. Save becomes Saving while its request is pending and Saved only after the server succeeds and the existing favorites provider remembers the plan. Sharing still creates a link without adding a favorite. A link failure retains the plain-text share fallback; a native share-dialog failure now produces a recoverable error instead of automatically opening another dialog. Save and Share errors remain separate and readable in a bounded, scrollable area above the controls.

Request guards act synchronously, before a disabled-button render, to prevent duplicate taps. Save state belongs to its original plan and survives closing/reopening the modal. An explicit Save can finish after the planner closes; a new plan cannot inherit its spinner or error. Closing the planner, changing the result, or returning to a picker cancels a pending share presentation, so a delayed link cannot open a dialog over another task. A canceled request cannot clear a newer request's busy state.

Above font scale 1.3, Save and Share stack. River, Put-in, and Take-out become full-width rows with complete names and edit indicators. The heading and rows move into the relevant scroll content, leaving Close and the result actions reachable on a small phone. Loading, error, and empty states also scroll. At ordinary sizes the compact three-column summary remains. The shared result component permits full endpoint names at larger sizes, including on saved-float screens.

Hazards, warnings, logistics, and the safety disclaimer remain in the result. Plan a different stretch stays a secondary action at the end of that content. No date, vessel, endpoint, estimation, API, favorites-storage, or alert-delivery contract changes are included.

## Scope and delivery

This is Phase 3A only. Alert creation and Today child routes remain separate PRs. Native tabs and the broader system-material pass remain Phase 5.

No dependencies, native configuration, or release channels change. No deployment, OTA, TestFlight, or App Store submission is included. Device QA remains required; this environment has no iOS simulator or physical device.

References: [React Native Share](https://reactnative.dev/docs/share), [SafeAreaProvider](https://appandflow.github.io/react-native-safe-area-context/api/safe-area-provider/). Installed package sources and current provider guidance were used for the modal inset boundary.

## Validation

- All 2,930 registered web/shared regression tests passed with no failures or skips, including 11 new asynchronous action tests. Updated the existing tailwater-copy test to follow the extracted share helper.
- `make check-mobile`: passed on Node 20; 0 errors, the same 30 existing warnings.
- Web production/test typechecks, ESLint (0 errors, 14 warnings), and Tailwind token checks passed.
- `make bundle-mobile`: production Hermes iOS export and archive allowlist passed (411 files; all Metro-resolved paths present, no secrets/media).
- `git diff --check`: passed.

The environment rejects the tsx CLI IPC socket. The test file list and token script ran through the same installed tsx Node loader instead; test resolution retained `tsconfig.test.json`. No dependency or CI commands were changed for this workaround. Native rendering, VoiceOver, and gesture checks remain device QA.

## Device QA

Use a small iPhone and a larger iPhone with a Home Indicator. Repeat the key checks in light/dark appearance and at the largest accessibility text size.

- [ ] Build a plan: Save and Share appear as soon as the result is ready and remain visible while scrolling. Neither appears while picking points, calculating, or showing a calculation error.
- [ ] Scroll to the end: hazards, the safety disclaimer, and Plan a different stretch are fully reachable above the footer. There is no overlap with the Home Indicator or duplicate bottom inset.
- [ ] Save: tap rapidly while the request is slow. One request/one favorite is created, Saving changes to Saved only after success, and tapping Saved removes that stretch. Close/reopen while saving and verify the correct pending/saved state.
- [ ] Share an unsaved plan, cancel, and reopen Share: it does not add a favorite. A second rapid tap does not produce another dialog. Check the link, endpoint names, distance, and time in the message.
- [ ] Go offline after calculating a plan: Save reports failure and remains unsaved; retry after reconnecting succeeds. Share can still offer plain trip details when a short link cannot be created. Native dialog cancellation is not shown as an error.
- [ ] Start Share on a slow connection, then close or edit the plan before the link arrives: no delayed share dialog opens over the next task. Reopen and explicitly share again.
- [ ] Start Save, change the put-in/take-out, and calculate another plan: the first save finishes for the original stretch; the new result does not show the old spinner, error, or incorrect Saved state.
- [ ] At large text sizes: actions stack, all selected names wrap, River/Put-in/Take-out rows scroll, and their edit actions work. The fixed Close control remains reachable. Check empty/loading/error paths and long river/access names too.
- [ ] VoiceOver: Close, Save/Remove, Share, and edit controls have useful labels; busy/disabled/selected states are announced. Escape closes the planner. Error text remains available even when it needs scrolling.
- [ ] Plan a different stretch resets to choosing a put-in. Closing/reopening a completed plan retains it. Map route framing and saved/shared-float native toolbar actions still work.

Report device/iOS version, text-size/appearance setting, action sequence, and a recording for layout or gesture failures.
