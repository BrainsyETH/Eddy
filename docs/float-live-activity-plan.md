# Float Mode: Lock Screen and Dynamic Island

Follow-up to merged #1468 and the core Float Mode plan in #1448.
This is the implementation plan for the next native PR, not a claim that a
Live Activity exists or that the device release gates have passed.

## Delivery order

1. Merge the preparation fixes: notification/location permission refresh on
   foreground, explicit report-idempotency lookup failures, separate report
   creation and retry limits, and awaited/cancellable background report sends.
2. Apply the existing report-client-ID migration to production before any
   client sends `clientReportId`. Record the actual production migration
   version, rename the file if necessary, and move that version from pending
   to applied. Run `make check-db`. It remains pending until this succeeds.
3. Prove current locked-screen tracking on a physical iPhone. Record location
   permission, OS/device, duration, battery drain, GPS gaps, and recovery.
4. Implement Lock Screen + Dynamic Island in one native PR, with the lifecycle,
   stale presentation, build packaging, and conditional keep-awake below.
5. Validate the native binary on a device and repeat the river pass with the
   activity visible. Home Screen widgets follow separately.

No estimator, calibration, or route-matching changes are part of this work.

## What the paddler sees

- Starting a float starts one Live Activity while Eddy is in the foreground,
  if the system allows it. Failure to start a card never blocks the float.
- Lock Screen: river, take-out, remaining river miles, progress, estimated
  moving time, and an honest location status. Tap to reopen the active float.
- Dynamic Island: compact remaining miles/status; expanded destination,
  progress, and moving-time estimate. No map or route geometry.
- Stops are ordinary pauses wherever they happen. Use `remainingCopy` from
  the existing estimator. Time remaining is a fixed, rounded estimate with an
  as-of date, never an ETA countdown that keeps decreasing during a stop.
- A dismissed card does not end tracking. Ending the float ends its card.
- `arrived` says “At the take-out.” `atRiverEnd` says “End of mapped river,”
  and retains the `offLineMeters` explanation. They are different states.
- Live Activities disabled/unavailable: the in-app float continues normally;
  no repeated prompts or compulsory Settings detour.

## Architecture and native packaging

Use a local Expo module, following `eddy-ios/modules/eddy-style-pack`, with an
optional JS bridge so binaries without the module do not crash. Use ActivityKit
for lifecycle and a SwiftUI WidgetKit extension for rendering. Share one Swift
attributes/content definition between the host module and extension.

Add an Expo config plugin that deterministically creates the extension target,
embeds it, configures its bundle identifier/signing/build settings, and sets
`NSSupportsLiveActivities` on the host app. Repeated prebuilds must not create
duplicate targets or file references. Check EAS extension credential discovery
and provisioning. Do not hand-edit or commit the generated app `ios/` project.

`.easignore` excludes every `ios/` directory. Explicitly allow each required
native source/podspec and extension file; add them to the required-file list in
`eddy-ios/scripts/check-easignore.py`. Keep secret/build-directory exclusions.
Validate Apple module autolinking and generated extension embedding.

The fingerprint runtime policy stays in place. Ship a new binary; an OTA cannot
add ActivityKit or the widget extension. Metro success does not prove Swift
compilation, code signing, or Lock Screen rendering.

## One source of progress

Build a small pure presentation adapter from `viewSession`, `remainingCopy`,
and `statusCopy`. Both foreground and background tracking use the same session
store. The activity must not start another GPS watcher, calculate its own pace,
or read the network. No coordinates leave the phone for this feature.

Content carries the session ID, bounded river/take-out names, remaining miles,
progress, estimate text and as-of date, last reliable fix date, tracker status,
paused/earlier-pace state, arrival/mapped-end state, and optional off-line-end
explanation. Keep combined static/dynamic encoded data under Apple's 4 KB limit,
including with long Unicode names. Do not include route geometry or samples.

Update only for a meaningful displayed change: roughly 0.1 mile, tracker status,
rounded ETA, pause/resume or earlier-pace state, arrival, or a 60-second heartbeat
when the app has execution time. Compare against the last successfully delivered
snapshot. Serialize/coalesce updates; an older async update cannot overwrite a
newer one or revive an ended session. The background task awaits the activity
handover without waiting for optional report delivery first.

## Staleness without JavaScript execution

Set `ActivityContent.staleDate` from the last reliable fix plus
`STALE_POSITION_MS` (currently two minutes). Carry the fix as a Date, not a
preformatted age. Use `context.isStale` for the stale presentation and SwiftUI's
relative-date text for its age. With no reliable fix, show finding/resuming and
withhold unsupported numbers.

Do not extend freshness for rejected/uncertain fixes or a heartbeat. Preserve
`live`, `uncertain`, `off-route`, `stale`, and `resuming`; a still-fresh timestamp
must not override uncertainty. A stale card labels its numbers as last known.
The estimate's as-of time must reflect its source estimate, not a cosmetic
refresh. No JS timer is required to mark a suspended app's card stale.

## Lifecycle and recovery

- Start only after the session is persisted, via the foreground Start Float
  action. First version uses local ActivityKit; no APNs/push-to-start service.
- Reconcile `Activity.activities` by session ID on launch/foreground. Reattach
  to a matching existing activity; end orphaned/duplicate Eddy activities.
- Persist the session's activity-attempt/dismissal state. Absence of an activity
  on restore is not permission to recreate a card the user dismissed. Offer an
  explicit in-app “Show on Lock Screen” action to restore one.
- Observe system activity-state changes. Dismissal/expiry/disabled activities
  never end the float. Background location callbacks update existing activities;
  they do not try to create replacements.
- Account for Apple's eight-hour active lifetime. Tracking continues; a new
  local activity can be offered when the user returns to Eddy. Do not promise
  an automatically renewed card throughout a longer float.
- End Float invalidates queued updates and ends the matching activity even if
  session-storage cleanup has trouble. Reconcile leftovers at next launch.
- Foreground-only tracking can still have a card, but locking means its position
  will go stale. The card must not promise continuous tracking in that mode.

## Keep Screen Awake and permissions

Keep the existing switch until locked-screen tracking passes physical-device
checks. In the native PR, make it a fallback for foreground-only tracking; hide
and release it once the background stream is confirmed running. Permission alone
is not proof that `startLocationUpdatesAsync` succeeded. If background startup
fails, expose the screen-on fallback and explain the actual mode.

The fallback works only while the Float Mode screen is visible. Preserve its
opt-in preference; release it on screen exit, session end, and transition to
working background tracking. Permission changes in Settings refresh on return.
Keep-awake/native failure must not interrupt the float.

Expo SDK 57 documents Always for iOS background location, and Eddy currently
checks it. Investigating native `CLBackgroundActivitySession` with When-In-Use
is a separate experiment that may require a different native tracking bridge.
It is not a prerequisite for the Live Activity and does not justify removing
the current fallback based on an isolated successful test.

## Verification and release gates

Automated checks:

- Pure presentation cases: learning pace, ordinary stop, slow drift, uncertain,
  off-route, stale, restored session, arrived, and off-river take-out.
- Lifecycle cases: repeated Start, restore/reattach, dismissal then relaunch,
  update/end race, system expiry, disabled activity, failed update/retry, and
  no activity recreation from background callbacks.
- Throttling includes pause/ETA transitions; uncertain fixes cannot refresh
  staleDate. Content-size checks use worst-case names.
- `make check-web`, `make check-mobile`, `make bundle-mobile`, allowlist and
  autolinking verification, plus a real native compile/prebuild check.

Physical-device checks, with an older supported iPhone as well:

| Scenario | Required result |
| --- | --- |
| Start, lock for an hour, reopen | Credible progress/ETA; one session and one GPS stream |
| GPS stops while app is suspended | Card marks itself stale without a JS update |
| Ordinary stop, then resume | Moving time holds; no false arrival countdown |
| Downloaded map and no-download route-only mode, without service | Tracking and activity update locally |
| Repeated loss/recovery of cellular service | No reset, duplicate activity, or camera change |
| Dismiss card, relaunch | Float survives; dismissed card does not reappear automatically |
| End float while update is pending | Activity ends and cannot be revived by that update |
| Off-river take-out | End of mapped river does not claim arrival |
| Change permissions/disable activities in Settings | Updated warning and supported fallback on return |
| Multi-hour river session | Record battery drain and gaps; establish release battery target |

Do not mark device gates complete based on unit tests or a simulator screenshot.
Report-client-ID migration and an idempotent send/retry check remain required
before exposing reports from the new build to production.

## Separate follow-ups

- Home Screen widget: an at-a-glance resume surface, with honest freshness and
  system-controlled refresh. It is not a second continuous location engine.
- Missed take-out notice: require confirmed downstream crossing, persisted
  one-time deduplication, and explicit treatment of reacquisition gaps and
  off-river destinations. Do not infer it merely from `atRiverEnd`.
- Validate published versus geometric distance on Buffalo/Niangua during the
  river pass. Uniform calibration scales distance and observed speed together,
  so ETA does not automatically share the distance error multiplier. Different
  calibration spans and planner blending still need real-world checking.

## References

- [Apple: Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
- [Apple: staleDate](https://developer.apple.com/documentation/activitykit/activitycontent/staledate)
- [Expo SDK 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [Apple: CLBackgroundActivitySession](https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession-4nl4y)
