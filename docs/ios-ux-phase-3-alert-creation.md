# iOS UX Phase 3B: alert creation in one sheet

Branch: `codex/ios-alert-creation-flow`.
Baseline: `828530a38111611f0c51dfe7a1bd96bcc328886b` (main after Phase 3A merged, September 30, 2026).

## What changes

Alert creation is one native modal containing a native navigation stack. Choose water pushes the editor inside the sheet. Existing `/alerts/new` and `/alerts/configure` URLs stay valid, so Alerts, river, gauge, and dam entry points keep their parameters. Cancel closes the whole task and restores its originating screen; a direct link with no history falls back to Alerts. Native Back returns to target selection when that step exists.

Save and Cancel stay below the scroll content, above the keyboard and Home Indicator. Actions and threshold fields stack at larger text sizes. Search rows show complete names, use Favorites terminology, support clearing and pagination, and distinguish a failed search from no matches. A failed river-options request offers Try again instead of claiming the river has no gauge. A local safe-area provider measures the modal presentation; the shared action frame reserves layout space rather than covering content.

Meaningful edits require confirmation before Back, Cancel, or native swipe dismissal. Untouched defaults and reverted edits do not show a discard warning. Hidden threshold fields do not make a condition alert dirty. The removal hook also prevents leaving during a save, Apple sign-in, or notification-permission request. Dismissal protection does not persist a draft across force-quitting the app.

Sign-in and the notification primer are inline steps in the same sheet. Apple still supplies the actual authentication prompt and iOS supplies notification permission. Canceling sign-in preserves the configured values. After successful sign-in, the original Save resumes once. After saving, the confirmation includes the already-met threshold explanation when returned by the server. Notifications are offered only when permission is undetermined, and declining leaves the saved alert intact. Permission errors cannot become alert-creation retries.

A synchronous save coordinator prevents duplicate requests before a disabled-button render. Only the server write commits the task; a refused or failed write remains retryable with its values intact. A successful write cannot be retried because refresh or presentation work failed. The existing river-subscription and gauge-rule APIs, seed behavior, delivery timing, and push opt-out policy stay intact. “Just once” is now offered only on gauge-rule paths that actually save it; the river condition subscription API does not accept that option.

## Scope

This PR covers alert creation. Existing alert editing, the river's one-tap bell, Today child routes, the broader typography/material pass, and native tabs remain separate work. The shared Apple sign-in control gains a synchronous duplicate-tap guard and optional busy notification for its containing task.

No dependencies, auth credentials, backend schema, native configuration, or release channels change. No deployment, OTA, TestFlight, or App Store submission is included.

The implementation uses the removal hook shipped with the pinned Expo Router 57 React Navigation compatibility export (`expo-router/react-navigation`). The newer top-level Expo removal API requires SDK 58 and is deliberately not used. References: [Expo modals](https://docs.expo.dev/router/advanced/modals/), [React Navigation removal prevention](https://reactnavigation.org/docs/use-prevent-remove/), [Expo removal API version note](https://docs.expo.dev/router/advanced/prevent-screen-removal/).

## Validation

- All 2,938 registered web/shared regression tests passed with no failures or skips, including 8 new draft/save coordinator tests.
- `make check-mobile`: passed on Node 20; 0 errors and the same 30 existing warnings.
- Web production/test typechecks and ESLint passed (0 errors, 14 existing warnings). Tailwind token and palette checks passed.
- `make bundle-mobile`: production Hermes iOS export and archive allowlist check passed (415 files, 10.57 MB; all Metro-resolved paths included).
- `git diff --check`: passed.

The environment rejects the tsx CLI IPC socket. The registered test file list and token script ran through the same installed tsx Node loader instead; test resolution retained `tsconfig.test.json`. No dependency or CI commands changed for this workaround.

There is no iOS simulator or physical device in this environment. Native presentation, keyboard, gesture, and VoiceOver behavior require device QA.

## Device QA

Use a small iPhone and a Home Indicator device. Repeat layout checks with light/dark appearance, increased contrast, Reduce Motion, and the largest accessibility text sizes.

- [ ] Open New alert from Alerts: one sheet opens. Search or choose a favorite, then verify the editor pushes inside that sheet. Back restores the search query and list position. Cancel closes the entire task.
- [ ] Open Alert me from a river, gauge, and dam: the correct water and reading appear directly in the editor, with Cancel available. Cancel and Done return to the original detail screen, not an extra target picker. Direct `/alerts/configure` links without history can exit to Alerts.
- [ ] Change the trigger, units, value, upper bound, or Just once. Try Back, Cancel, edge-back, and dragging down the sheet. Keep editing preserves every field; Discard performs the intended navigation once. Untouched defaults or fully reverted edits exit without a warning.
- [ ] Show the decimal keyboard and scroll to the end of the form. Save and Cancel remain reachable, with no Home Indicator overlap or hidden final fields. Repeat with a between range, a long gauge name, and the largest text size. Fields and actions stack when needed.
- [ ] Save rapidly on a slow connection: one create request and one alert result. While saving, controls cannot change the request and Back/swipe/Cancel cannot lose the pending task. Success shows Alert saved, then Done closes the sheet.
- [ ] Go offline after options load: Save shows a readable error and retains all values. Reconnect and retry successfully. Check server duplicate/validation messages too. A failed refresh after a successful write must never invite another create request.
- [ ] Signed out or using an anonymous session: Save reveals sign-in inside the sheet. Cancel Apple's prompt, use Back to alert, and verify the draft. Sign in successfully and verify exactly one saved alert. No app-owned sheet opens over another sheet.
- [ ] On a fresh notification-permission state, save successfully. The saved confirmation offers Turn on notifications / Not right now. The system prompt appears only after the former; allow or deny leaves the alert saved. Not right now dismisses without spending the system prompt. Existing allowed/denied permission must not offer the primer again.
- [ ] Set a threshold that is already true. The confirmation explains that Eddy waits for the next crossing; that explanation appears before notification permission is requested. Verify ft/CFS in the explanation and verify changing units re-anchors to the correct reading rather than retaining digits from another unit.
- [ ] River + Eddy's call has no Just once option; My own level and gauge rules retain it. The saved rule has the chosen repeat behavior. Empty upper bounds and reversed ranges cannot be saved.
- [ ] Start with a failed river-options request: Try again recovers after reconnecting and Cancel remains available. An unavailable gauge reading still permits a custom threshold.
- [ ] Search loading, no matches, and offline states remain readable. Clear search returns to Favorites, scrolling loads more results, and tapping a result while the keyboard is open opens the editor once.
- [ ] VoiceOver reads the water name, selected trigger and units, threshold units, native switch state, Save busy/disabled state, inline errors, sign-in step, and saved confirmation. Verify focus after each step change and that all action targets are at least 44 pt. Reduced-motion system transitions remain usable.

Report device/iOS version, text-size/appearance setting, entry point, action sequence, and a recording for layout or gesture failures.
