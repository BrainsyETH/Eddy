# Eddy for iOS — release runbook

## Current release

- **Release in progress:** 1.6 (`eddy-ios/app.json` is `1.6.0`, repository
  version checked 2026-10-30; this does not confirm a submitted or live build).
  There is no 1.6 readiness report yet; the 1.5 report and its delta gates
  below carry into it unclosed.
- **Last build seen in the field:** 1.5.0 (11), an ad hoc `preview` build
  on runtime `2af3dd12…`, from Sentry events on 2026-10-30. That runtime
  matches neither fingerprint in the 1.5 report, so the build's commit is
  unconfirmed, and it says nothing about the App Store.
- **Live App Store version:** not confirmed since 2026-09-03, when it was 1.1
  and 1.2 was in progress. Whether 1.2 (or anything after it) reached the
  store is not recorded here. Read it from App Store Connect, then replace this
  line with the version and the date you checked.
- **Status confirmed:** 2026-10-29 from `app.json`, `make check` on `main`
  `97bcd980`, and read-only public production/API and database checks. App
  Store Connect, EAS build history, TestFlight and physical-device state remain
  unconfirmed. The maintainer states the last build was made from `e4c5a80e`
  (the 1.5.0 bump); that is not read from an EAS record.

`missouri-float-planner/src/lib/ios-release-runbook.test.ts` fails when the
`app.json` version above stops matching the real one, so a version bump has
to touch this section. It cannot check the store line; that one is on you.

See **[`release-readiness-1.5.md`](release-readiness-1.5.md)** for the current
submission assessment and release order, and
[`release-readiness-1.4.md`](release-readiness-1.4.md) for the one before it.
The 1.2 report's gates below stay unticked until evidence closes them; a later
version number does not close them. The 1.4, River Mode, and history sections
below remain the device checklist, and the 1.5 section adds the delta since
the October 26 bump.

### 1.5 delta gates — October 29, 2026

The native fingerprint moved between `e4c5a80e` (`1878861f…`) and `97bcd980`
(`39c237f6…`): a new binary, never an OTA update. The reasons and the code
review are in the 1.5 report; these are the gates it adds.

- [ ] **Confirm the baseline.** The live build's EAS `gitCommitHash` is
      `e4c5a80e` and its `runtimeVersion` is `1878861f…`; if not, re-measure
      the delta from the real commit.
- [ ] **Time Sensitive Notifications capability** is on the App ID
      (`com.apple.developer.usernotifications.time-sensitive` is new in
      `app.json`); the build and the upload pass without an entitlement
      mismatch.
- [ ] **The widget extension compiles** with the minimum-flow fields, and
      `eddy-ios/scripts/check-condition-widgets.swift` passes (first run on a
      machine with Swift; the Linux audit environment had none).
- [ ] **Favorites dam card and widget on a Bull Shoals minimum-flow day** read
      "Minimum flow", not "No generation" over a full chart (1.5 report,
      finding 1, fixed in code), on the production-profile build.
- [ ] **Manual Finish after landing past the mapped take-out** does not count
      the time on the bank (finding 2, fixed in code): land 200 m below the
      take-out, wait ten minutes, Finish, and check the recap's elapsed and
      stopped time; then a float that carries on paddling past it.
- [ ] **Stacked places hide under their numbered mark** (finding 5 now hides
      them with a Mapbox `in` filter instead of leaving them out of the data):
      zoom so pins merge and split, and check no member draws under its stack
      and taps land on the stack.
- [ ] **Sign in on a phone whose push token another account holds** with the
      owed release delivered and with it blocked: registration succeeds with
      the ledger's row id (finding 10).
- [ ] **Reinstall without signing out, then sign in to another account**
      (finding 10's review follow-up): the iOS token survives, the ledger
      does not. Registration is refused, the server pushes a confirmation,
      Eddy redeems it without showing it, and Settings reads "will get a
      push". Repeat with Eddy in the background (the confirmation shows; a
      tap finishes it).
- [x] **The style-pack check answers on a phone** (new binary: the
      `eddy-style-pack` module changed on October 30). On the 1.5.0 (11)
      preview build every check timed out, on two trips and across launches
      (Sentry "offline map verification unavailable", `reason: timeout`), so
      no trip could reach Ready offline. Download a fresh stretch with
      signal: the card reaches Ready offline. If it says "Couldn’t check
      offline map" instead, the module change did not fix it; record the
      Sentry event's `reason`. Then airplane mode, cold launch, River Mode on
      that stretch: the background map draws with labels. Pan beyond the
      downloaded area and back into it: outside it shows blank tiles but
      never "Background map unavailable", and back inside it draws again.
      *Evidence, 2026-10-31, physical iPhone, a device build made after the
      module change merged (exact commit not recorded):* Caddo River,
      Swinging Bridge Access to Glenwood Access, 9.9 mi. The card went from
      "Downloading · 15%" to "Ready offline", so the style check answered
      with complete counts. In airplane mode the Ready to float preview drew
      roads, labels and terrain. After closing Eddy and reopening it in
      airplane mode, River Mode drew the stretch with labels; panning to St.
      Louis, outside the download, drew from Mapbox's ordinary cache of
      places viewed earlier rather than blank tiles, and returning to the
      stretch drew it again. "Background map unavailable" never appeared.
      Which of the two module changes fixed it (one shared manager, or the
      main queue) was not isolated. Not covered here: starting and resuming
      a float on the river (ADR 0011 device proof 1), and blank tiles
      outside the download on a phone with no cached area.
- [ ] **River Mode on a device:** a 10-minute airplane-mode gap mid-float adds
      gap distance and "GPS gap" time; moving time and speeds; arrival, then
      carrying on past the take-out; Discard for a sub-5-minute float; "Stop
      tracking" when the journal cannot be read; the arrival notification's
      Finish action; the "ahead of you" reminder under a Focus mode.
- [ ] **Live Activity** at an accessibility Dynamic Type size (Lock Screen and
      expanded Island), the compact Island with no distance yet, the eight-hour
      expiry message, and swipe-away.
- [ ] **Native recorder durability:** iOS relaunches Eddy in the background
      after a kill, the float continues, then a hard power-off; the journal
      keeps all but the last minute.
- [ ] **Map:** statewide index below z8, stacks above, places list, compass
      reset, public-land tap, "View on map" from Camping and from Favorites,
      offline search, plan sheet endpoint editing; confirm no hitch after each
      zoom with Camping and Other gauges on (findings 5 and 6, fixed in code)
      on the oldest supported iPhone; "View on map" for a removed place says it
      is no longer listed.
- [ ] **Account and push:** Restore while signed out; sign out then sign in on
      the same device (token re-keyed, owed release delivered); provisional
      permission upgraded in app; fresh install, no account, no network shows
      a Premium call-to-action (finding 7).
- [ ] **Dark mode on every tab** and onboarding at the largest text size.
- [ ] **Trust Ledger:** the `jacks-fork` threshold-order critical and the
      global "reconciliation refused (check_error)" critical (both open at
      2026-10-29 21:00 UTC) are resolved or their judgement recorded.
- [ ] **Store metadata:** screenshots match the new map, dark mode, Favorites
      and Today; reviewer notes say River Mode is on (`floatMode: true` read
      2026-10-29) and that backup and contributions need Apple sign-in.

### October 13 freshness update candidate

The observation-age, Today gauge refresh, and dam-row fixes change JavaScript
only. In the same clean dependency/configuration environment, `expo-updates
fingerprint:generate --platform ios` produced
`7b61aec836fa9b7dcdff6facd3b7f2a0d50d1809` both at base `5da1a76` and with
these fixes. This establishes base-to-candidate compatibility, **not** the
runtime of the shipped binary; no OTA was published during these checks.

- [ ] Confirm the target channel's installed binary/runtime and regenerate the
      candidate fingerprint with its actual production environment before OTA.
- [ ] On device: cache river A, refresh B hours later, fail A's request, and
      verify A's age continues from its observation (or its own receipt time).
- [ ] Resume Today after several hours offline: rivers/gauges must age, dam
      rows must say last observed/unavailable, and retries must retain readings.
- [ ] Pull to refresh the gauge and dam scopes; verify new data and failures,
      then check dam rows with large Dynamic Type and VoiceOver.

Database permission fixes are independent of this update. Apply them through
the migration workflow; an app/OTA release cannot close direct database access.

### October 12 submission blockers

- [ ] Apply the reviewed archive migration, reconcile its recorded version and
      deploy the API/policy before distributing the new build. Read-only check:
      both archive tables are absent and `/api/me/float-archive` returns 404.
- [ ] Enable River Mode for the release **after device acceptance** and verify
      it in the production-profile binary. Public config currently returns
      `floatMode: false`; preview visibility does not prove reviewer visibility.
- [ ] Publish the matching policy and complete App Store Connect privacy answers.
      The live policy still says October 6. The prepared answers now include
      linked diagnostic installation IDs; verify coarse-location linkage and
      SDK payloads before publishing them.
- [ ] Confirm the live store version/build and its EAS `gitCommitHash` and
      `runtimeVersion`; choose the next valid marketing/build version accordingly.
      `app.json` 1.4.0 alone does not establish that 1.4.0 can be submitted.
- [ ] Resolve the Jacks Fork Trust Ledger critical before submission. A fresh
      read on October 12 confirms it remains open; last seen 01:00 UTC. This is
      an existing river-data release gate, separate from the new history work.

Read-only checks also found `minSupportedVersion: "0.0.0"` and an HTTP 200 JSON
association file for `D4U38CY2HK.eddy.guide.app`. Installation-time link behavior
still needs a device check. No production settings were changed.

The checkboxes below are the evidence checklist, and they are deliberately not
inferred from the fact that the previous release shipped: enrolment, signing
and the App Store record necessarily existed, but credentials, environment
values, migrations, device behavior and store metadata can drift between
releases.

### 1.2 delta gates

**Carried, not confirmed.** Written for 1.2 on 2026-09-03. If 1.2 shipped, an
unticked gate here is either still open in 1.4 or was closed without being
recorded — find out which before ticking it. The full reasoning for each is in `docs/release-readiness-1.2.md`; this is the
checklist.

- [ ] **Deploy the web app before the build is distributed.** The 1.2 binary
      calls `/api/me/entitlement/refresh`, which did not exist in 1.1, plus
      several additive response fields (`floodStages` on
      `/api/conditions/[riverId]`, `historyCapabilities` on gauge detail, the
      server-derived visual gauge). Restore breaks loudly; the fields degrade
      quietly, which is worse.
- [ ] **Cut a new binary for this release.** The September 3 delta had no
      native changes and could otherwise put 1.2 JavaScript into a 1.1 binary
      through EAS Update. The October 4 follow-up adds `expo-network`, changing
      the fingerprint runtime: its native module requires a rebuilt client.
      The October 11 Floats refresh also adds `@react-native-community/slider`.
      Both require a new binary; an OTA update cannot add their native modules
      to an already installed build.
- [ ] **Trust Ledger critical — Jacks Fork, still open, no longer snoozed.**
      07065200 (near Mountain View) has `level_low = level_optimal_min = 100`
      cfs, untouched since 2026-07-21. The September 1 recalibration fixed
      *Eminence* (07066000), a different gauge. Second release carrying this;
      it needs the data judgement, not a third snooze.
- [ ] **Trust Ledger high — Courtois gauge proximity, still open.** Encode the
      governed Huzzah proxy (five miles) or accept it.
- [ ] **The Phase 5 device pass** from
      `missouri-float-planner/docs/RECENT_BRANCHES_FIX_PLAN_2026-09-01.md`.
      Nine UI judgement calls landed in code 2026-09-02 and none has been seen
      on a device. Ten minutes on a simulator with a stale gauge, a fresh
      install, and airplane mode. Two are product choices, not fixes: 5.3 and
      5.8.
- [ ] **Set `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in Actions
      secrets.** Without both, `.github/workflows/migration-drift.yml` warns
      and skips — the drift guard added this cycle is inert, and not failing
      reads identically to passing.
- [ ] `make check` green on Node 20, including `make bundle-mobile`. Not run
      as of 2026-09-03; see the readiness report's *What was not verified*.
- [ ] `make check-db` from a linked checkout. The ledger's `[pending]` section
      is empty as of 2026-09-02, but that is a file-and-query comparison, not
      the CLI's view.
- [ ] Correct `app_config.latest_version`, which reads a stale `0.1.0`. It
      drives no gate. (`min_supported_version` is `0.0.0` — verified
      read-only 2026-09-03, no lockout risk.)
- [ ] **The chart-scrub device gate below carries into 1.2 unclosed** — see
      *Delta gate added by the August 18 chart-scrub rework*. Gesture
      arbitration is exactly the class of change the repo's rule says wants a
      device, and the 1.2 chart work sits on top of it.

Expect and do not chase: the three Cumberland dams (Wolf Creek, Center Hill,
Dale Hollow) read 4.7–9.7 hours stale against 1.7–2.7 for the other fifteen.
That is an upstream LRN feed lag, the strip renders those hours as honest
nulls by design, and a tester will report it as a bug.

### 1.4.0 device QA follow-up gates — October 4, 2026 (#1425)

These are pending device and release checks, not evidence of a device pass.

- [ ] **Deploy the outlook API before testing this binary's weather links.**
      `/api/rivers/[slug]/outlook` must return `weatherCoordinates` for the
      exact point used to fetch the forecast. Confirm both the primary and
      selected-gauge paths. Older servers remain compatible, but the new
      “Will it hold?” weather link cannot be verified against them.
- [ ] **Include `expo-network` in the new 1.4.0 binary.** Test a rebuilt client;
      refreshing JavaScript in the old device build is insufficient. Do not
      ship this PR's bundle as an OTA hotfix to the current store binary.
- [ ] **Camping grid:** fling hard in both directions across the full horizon;
      check for blank columns, frame drops and header/row misalignment. Try
      diagonal drags, change direction mid-drag, and start a vertical scroll
      while horizontal momentum is still running. Horizontal pans should not
      scroll the list or navigate back; vertical drags should scroll normally.
- [ ] **Camping controls:** verify the header scrollbar and row tap feedback,
      open several campgrounds after scrolling, and change river filters
      without losing the date position. Grid mode keeps swipe-back disabled;
      List mode, initial loading and unavailable states keep native swipe-back.
      Starting a vertical drag on dates should cancel the delayed highlight.
      Check camping-panel padding on both map sheets and access pages.
- [ ] **Floats hub and collection:** Start/Resume is primary; Build a Route and
      Find a Route share a row. Open a featured route, save it, close, then Build
      a Route: it starts empty. Repeat through Featured Floats → See all and
      through finder results. Close returns to the originating list and preserves
      its filter/scroll. Visit Map afterward: its previous selection, pin, camera,
      and plan are unchanged, including when Map had no selection. Open endpoint
      details and Back to the same plan; Start enters setup without reopening
      the planner later. Try dismissing while a route is still loading.
      Repeat from Today's recommendations: close returns to Today. With Float
      Mode off, Build a Route is the highlighted action. Pan Map, open and close
      standalone planners from several tabs, then cold-launch Map and confirm
      its saved camera is unchanged. Check cached river/access pickers offline,
      and retry after an uncached access-point request fails.
- [ ] **Planner dismissal and memory:** on the oldest supported test iPhone, open and
      close planners repeatedly from different tabs, including opening endpoint
      details and switching tabs with a planner retained in the stack. Inspect
      memory and live Mapbox instances: standalone planners must not create an
      additional native map, and repeated cycles must not accumulate screens.
      Measure close-to-Floats latency before/after; expect only the native sheet
      dismissal, with no second stack animation or visible blank-screen pause.
      Returning to Map stays responsive.
- [ ] **Floats browsing:** verify zero/many saves, three-card previews, Saved /
      History, river filtering and sorting, and the top-right Backup control
      (guest and signed in). Both segments open the same Backup & sharing settings;
      no routine status row repeats in the list. Featured images use the same fallback in See all. Test failed photos,
      horizontal swipes versus vertical scrolling, page dots, light/dark,
      maximum Dynamic Type, and rapid taps on different actions as well as the
      same action; only one destination/session should open.
      Simulate a failed local archive load: both Saved and History show the
      load error and a working Retry button; the backup notice must not stay on
      Loading. A failed account sync keeps locally loaded trips visible and
      identifies the backup problem inline.
- [ ] **Find a Route:** open from a river page in each tab; Back/swipe returns
      to that same river without changing tabs. Open a suggested plan, close to
      the same finder, then Back to the river. Search a river and a town in the
      same picker; change between them and Use my location. No location prompt
      until that action; denied/unavailable location still permits town/river search.
      Type quickly and dismiss during town lookup; stale responses must not replace results.
      New users start with Kayak, and a selected vessel survives reopening and
      plan retry. Open Filters: switches toggle at maximum Dynamic Type, Reset
      and Done work, and the row shows the count. Change trip length and a filter
      after a search: results dim and ignore taps until Update routes. Pick an
      access point and a river with Current location; cards show a drive time and
      Sort offers Shortest drive. Check time-slider VoiceOver, keyboard
      dismissal, footer clearance and returning to the same search results.
      Scroll results in light/dark mode: the native title and Back control stay
      readable. Cards show a photo (route, river, then illustration fallback),
      duration, river miles, condition, and access status at a glance. Check
      typical estimates, private/unconfirmed access, visible cautions, and
      expanded route/search details. Test failed photos, maximum Dynamic Type,
      and VoiceOver on the time-info and disclosure controls. The compact Vessel
      row opens a native menu with the current choice checked; selection updates
      the row, cancels any in-flight search and clears old results. Dismissing
      without selecting preserves results. There are no pace bars or tile grid.
- [ ] **Saved Floats:** a fast online open has no saved-details flash; airplane
      mode shows saved logistics as soon as connectivity reports offline; a
      stalled connection exposes them after the 1.2-second grace period while
      the request continues. Foreground immediately after toggling Wi-Fi or
      cellular: an offline hint must not cancel a request or show an error;
      successful responses should restore current conditions without a retry tap.
      A foreground refresh keeps an already loaded result mounted and preserves
      its scroll position. Old water verdicts, readings and float times must
      be hidden visually and from VoiceOver until the refresh succeeds. On
      failure, logistics and dated cautions remain usable and Check again
      recovers after service returns. Also open an older saved stub with no
      offline details and switch between two saved floats during loading.
- [ ] **Premium Reads:** See all stays unlocked after cold launch, foreground,
      account refresh and pull-to-refresh. Confirm Free still sees the paywall.
- [ ] **Launch/onboarding:** a plain cold launch opens Today; explicit map
      links still open Map. Location requests follow an explicit location
      action, and the removed onboarding sentence stays absent.
- [ ] **Weather:** “Will it hold?” opens weather for the forecast location and
      Back returns to the river. Check day/night icons, light/dark appearances,
      sunny yellow/orange symbols, and the VoiceOver weather action.

The camping list intentionally uses a plain React Native `ScrollView` directly
inside `GestureDetector`, following the [Native gesture example](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/native-gesture/).
Do not simply swap it for RNGH's `ScrollView` while keeping that wrapper:
RNGH's component already has a native handler. Device arbitration checks above
remain necessary. The plan-status line's automatic announcements still use the
Android-only `accessibilityLiveRegion`; explicit VoiceOver status announcements
remain a non-blocking follow-up.

### River Mode release gates (#1448)

River Mode (Phases 2–4 of #1448) adds native code and a background mode. These
are pending checks, not evidence of a device pass.

- [ ] **Ship a new binary.** Native float recording (ADR 0014) adds the
      `eddy-float-recorder` module and its app-delegate subscriber, raises the
      minimum iOS to 18.0 (`expo-build-properties`, and the widget extension in
      `plugins/withFloatActivity.js`), adds
      `NSLocationTemporaryUsageDescriptionDictionary`, and removes
      `expo-task-manager`; `expo-keep-awake` is a direct dependency and
      `isIosBackgroundLocationEnabled` is `true`. `app.json` also declares
      the `com.apple.developer.usernotifications.time-sensitive`
      entitlement for the on-water reminders: confirm EAS enabled the Time
      Sensitive Notifications capability on the app identifier (it syncs
      capabilities from entitlements on build) and that the `.ipa`'s
      entitlements carry it. The runtime fingerprint
      changes; over-the-air updates cannot deliver this. Phones below iOS 18
      stay on the previous store build.
- [ ] **First native compile of `modules/eddy-float-recorder`.** It was
      written against Apple's iOS 18 Core Location reference without a local
      Xcode build. Build a development client, fix anything the compiler
      reports, and record the Xcode version used.
- [ ] **Do not submit a binary that declares background location the reviewer
      cannot see used.** Store builds show River Mode only when the server
      flag is on (`FLOAT_MODE_ENABLED=true` on Vercel; see
      `eddy-ios/src/lib/floatModeFeature.ts`). Either turn the flag on for the
      release, or hold this binary back. Development and preview builds show
      River Mode regardless.
- [ ] **Reviewer notes** (append to the block in `docs/app-privacy-labels.md`):
      River Mode (Floats tab → Start Float) tracks progress to a take-out
      during a river float. It asks for When In Use location only; a Core
      Location background activity session keeps tracking with the phone
      locked in a dry bag, the blue location indicator shows while it runs,
      and tracking stops when the float ends. Raw float positions stay on the device. Signed-in recap summaries
      are backed up, and explicit hazard reports transmit their captured location.
- [ ] **Unified Ready to float:** from Today, Map, Floats, Favorites and Alerts,
      open a plan and a fresh Start a Float. Confirm the same editable River,
      From, Take-out and Vessel, photo rows, labelled distances, moving-time copy,
      offline section and permission card. Edit while an estimate is
      running; an old result must not appear for the edited stretch. Check large
      text, GPS timeout and permission changes in Settings.
- [ ] **Ready vessel menu:** tap the compact Vessel row, see the current
      choice checked, and choose each of canoe, kayak, raft and tube in one tap.
      The menu closes, the row updates, and any previous moving-time estimate
      clears while the new estimate loads. Dismissing without choosing preserves
      the draft. Check the remembered choice on a fresh start and the plan's
      choice when opening a plan. Check light/dark, largest text and VoiceOver;
      the field must be disabled while starting. Both screens use the same picker.
- [ ] **Ready selection and automatic location:** with location already allowed,
      open Start a Float and see Current location populate without another tap
      or permission-card flash. Leave Ready open for over two minutes and verify
      GPS refreshes; repeat after a timeout and after returning from Settings.
      With no river selected, see river search and choices directly on Ready;
      choose a river in one tap, then its take-out. Improve a poor GPS fix and
      verify detection retries without a tap. After its first match, wait for
      later fixes near a confluence: the river and endpoints must stay put.
      Cancel an untouched picker and verify detection resumes. Type in river
      search (then clear it or cancel), or make a selection: late detection must
      not replace the draft or hide the search list. With a river selected, open
      take-outs directly. Change river inside that sheet and close: the previous
      route and download remain. Search with the keyboard open and select in
      one tap. Check light/dark, large text, VoiceOver, Reduce Motion and that
      Start tracking remains reachable above the bottom safe area.
- [ ] **Recording away from the planned launch:** select Akers, then begin
      recording several miles downstream. Before Start, see the distance below
      Akers and a one-tap **Start from here**. With or without switching, the
      first confirmed recording position starts at 0%; the map marker, Float
      Mode note and recap describe the recorded start. Kill/reopen mid-float;
      the origin must not move. Starting beyond the take-out must not claim
      arrival. Repeat upstream of the planned launch.
- [ ] **Named put-in GPS guidance:** verify near, above and below states; try
      a roadside fix at the same river mile, poor accuracy and a fix away
      from the river. None should falsely say **Near**.
      Switching to **Start from here** must update map, distance, estimate and
      download together, and clear a take-out that is now upstream.
- [ ] **Off-map launch (Buffalo City):** at the actual access, Ready says
      **Near Buffalo City** and explains the mapped-river limit. Start and wait
      for accurate fixes, then kill/reopen before reaching the mapped river.
      Once GPS confirms the river, progress begins at 0%; the recap retains
      Buffalo City, with a separate note about where distance tracking began.
      No distance is invented for the gap. Repeat while passing only its
      closest mapped river point: the recap must not claim Buffalo City as
      the launch. Waiting at the actual launch must not trigger away ending.
- [ ] **One recording presentation:** start from each tab; close, switch tabs,
      and Return to float. Repeat Return to float taps and a reminder deep link. Confirm one
      River Mode/map, recording continues when closed, keep-awake releases,
      options return correctly, and manual/automatic ending shows one recap.
      Closing returns to the page underneath; a cold recording link returns to
      Floats. A standalone planner must not leave a blank page behind.
- [ ] **Options sheet and recenter:** open Options and Live Activity repeatedly
      during River Mode, expand/collapse the sheet, and dismiss it. Verify content
      in light/dark and large text on a physical iPhone. Recenter hides while
      following; a pan or Show route makes it available again.
- [ ] **Planner offline handoff:** Build a Route retains river, vessel and any
      named endpoints. A current-location start retains take-out and asks for
      put-in. Save and download there; return to Ready with the unchanged saved
      route and see Offline map ready only after complete tile/style verification.
      The planner requires Save before Download; verify returning to Ready finds
      that saved stretch, including after a relaunch, and that changing an end
      does not borrow its ready status.
      **Use a new iOS binary containing `withSerialMapboxOffline` (not an OTA).**
      Download a multi-chunk route and a second route while the first runs:
      only one chunk's tile/style load may be active. Double-tap Download,
      interrupt/retry, remove queued work, relaunch and test in airplane mode.
      Force a style failure after tiles reach 100% and verify it is reported;
      completion must wait for both loads, and retries must not overlap them.
      If “group load with same identifier” recurs, record exact native wording,
      build/runtime version, create vs resume, chunk counts and style status from
      diagnostics. Confirm completed state clears old errors; do not treat the
      byte count alone as success or unique disk usage.
      A missing verifier or failed check must show an explanation, not a
      finishing spinner. A slow check must end within 20 seconds; the finishing
      indicator must end within 30 seconds. Check again must not start native
      downloads. Return from Storage and foreground Eddy to recheck completion;
      Storage must label partial/unconfirmed maps separately from Ready offline.
- [ ] **Backup and sharing recovery:** reproduce Sync now on an affected account;
      correlate client method/status and server `[float-archive]` stage/code.
      Apply the reviewed account-read grant migration only with authorization;
      verify `service_role` can read `auth.users.id`/`is_anonymous` while client
      roles and unrelated account columns remain restricted.
      Confirm pending floats become backed up and restore on another installation.
      Sharing errors stay inline; failed opt-in stays off, failed opt-out stays
      locally off and retries. Verify account-linked summary disclosure, raw GPS
      staying local, and backups continuing independently of optional sharing.
- [ ] **Float history card and recap:** in light, dark, Increase Contrast and
      the largest Dynamic Type size, check a measured float ("9.6 river mi",
      never a distance paddled), an untracked one (no stretch, the standard
      otter, "GPS tracking unavailable"), a partly tracked one ("Limited GPS
      tracking"), one with no condition, a dam-tailwater float (its condition
      badge with no USGS id in the tip), and one
      whose reading was too old to rate (its value and age, no badge). The
      river's name never truncates; the badge and stats wrap. The recap's hero
      takes the condition's tint for a current reading: check a High and a
      Flood recap (orange and red behind the mood line) and decide whether
      that is wanted. Save the screenshots to `design/float-history-card/`.
- [ ] **Float share image rollout:** deploy `GET /api/share/float/image` before
      the app change reaches devices. Share a float from its recap and from a
      History card: Messages receives the image and the river page link;
      cancelling the sheet is silent; offline, an older API, or a float whose
      access point was removed reports "Image unavailable". VoiceOver reaches
      a card's share as an action. Check an untracked float (standard otter,
      "GPS tracking unavailable") and a Flood float (Big water, "Flood stage",
      with the stamp drawn only when the gauge's readings that day bear it
      out: `X-Eddy-Share-Condition: verified`). The shared file is named by
      the day, not the session id.
- [ ] **Historical recaps:** open last month's float from History, including
      while a different float is active. Keep the tab bar and ordinary Back;
      return to the same History list. Resume the active float from another
      tab, close it, and verify one recording view with no old recap replacing
      the active session. Just-finished recaps still use recording's Close.
- [ ] **Start-note backup rollout:** deploy the API accepting optional
      `startNote` and its authenticated capability response before this binary.
      Against an older API, verify a new mid-route recap stays locally saved
      and backup pending (no permanent refusal or lost note). Upgrade the API,
      sync, and restore on a clean installation: launch fields remain null and
      the descriptive note survives. Old recaps retain their original names.
- [ ] **Recap-context backup rollout:** deploy the API accepting optional
      `startCondition`, `riverSpan`, `coveredMiles` and `startWeather`, with
      `recapContext: true` in its capability response, before the app change
      reaches devices. Against an older API, verify a new recap stays locally
      saved and backup pending while deletions still sync. Upgrade the API,
      sync, and restore on a clean installation: the four fields survive.
- [ ] **Legacy unfinished offline setup:** use a location-start package saved
      by the earlier app, clear ordinary saved river data, quit Eddy, enable airplane mode,
      and reopen Start a Float. Confirm the downloaded river, take-out and boat
      recover. With fresh GPS at that launch, its own download is recognized;
      without GPS, show the reason and never use the saved position as a fix.
      Edit the start/take-out and verify the old tiles are not labelled ready
      for the new stretch. Start, close River Mode and verify Storage cannot
      delete its package. Finish; another start must have a new recording id.
- [ ] **Permission states on a device:** While Using (tracks with the phone
      locked; no Always prompt ever appears), Allow Once, Precise Location off
      (tapping Start float or "Allow precise location" shows Apple's
      precise-location prompt inside Eddy and the float starts once it is
      allowed; declining it switches the card to Open Settings), Location
      Services off, denied, and
      permission withdrawn in Settings mid-float. Each shows the line its
      Core Location diagnostic calls for. No prompt loops.
- [ ] **Release acceptance matrix in #1448** passed on physical iPhones,
      including an older one: download at home → no service at the river →
      start → lock for an hour → reopen with credible position, miles and time
      left. Record battery drain per hour, screen on versus mostly locked.
- [ ] **Offline map device proofs in ADR 0011** done and their measured sizes
      recorded there.
- [ ] **On-water reminders (Phase 5)** on a physical iPhone, phone locked,
      no cell service: the take-out reminder arrives about half a mile out,
      once; a chosen stop's arrives a quarter mile out; nothing arrives while
      paddling upstream, off the river, or before a relaunched float re-finds
      its position; tapping one opens River Mode. With notifications denied,
      River Mode says reminders can't appear. Pure rules:
      `src/lib/float-reminders.test.ts` in the web suite.

- [ ] **Arrival, hazards and ending (#1448 follow-up)** on a physical iPhone,
      phone locked, no cell service: "<take-out> take-out is approaching" about
      half a mile out; "Arriving at <take-out>" within 0.1 river mile remaining
      (including a first confirmed fix past the take-out), once, with "Finish
      your float in Eddy once you’re off the water to stop tracking and save
      your recap." Check neighboring landings at Turner Mill and
      Onondaga/Ozark Outdoors: the notice names the chosen take-out and does
      not claim the paddler has landed. A serious
      known hazard (danger, warning, or a required portage) announced a quarter
      mile out, with the Next hazard card on screen; the recap says the take-out
      was reached and, when the paddler stays there, ends at arrival even when
      Finish is tapped later or away from the river. Leave a float running: it
      ends itself an hour after arrival, or after driving well away from the
      river ("Still floating?" after ten minutes of unbroken away fixes, ended
      at 45; a GPS outage between away fixes adds nothing), with a "Float
      ended" notice that opens the recap. A long lunch on the bank must NOT end
      it, nor a GPS gap followed by returning to the river, nor paddling on
      past the take-out: keep floating downstream for over an hour after
      arrival and confirm the float continues, then stop for fifteen minutes
      and confirm it ends where you stopped, with the recap's time and
      distance including the stretch past the take-out (and "take-out
      reached"). Swipe Eddy away mid-float, keep floating past the take-out,
      reopen: recovery must not end the float before reading the newer fixes. The "Arriving at" notice shows
      a Finish float action: with the phone locked and in a Focus mode, the
      take-out and hazard reminders still appear (time-sensitive); tapping
      Finish ends the float and opens its recap; after Finish no float
      reminder remains in Notification Center. Tap End within the first few
      minutes: Discard is offered and leaves nothing in history or Storage. An off-map take-out (Buffalo City) must not
      be recorded as reached. Its "Take-out reminder: <take-out>" notice names
      the chosen landing, with "Once you’re off the water, finish your float
      in Eddy to save your recap." Verify that the off-water instruction is
      visible in the collapsed Lock Screen notification and that the notice
      gives no remaining distance or claim of proximity or arrival.
      The arrival time and
      sunset warning read right late in the day. Pure rules:
      `float-reminders.test.ts`, `float-session.test.ts`.
- [ ] **Closing Eddy mid-float:** swipe Eddy away, keep floating, and
      confirm recording resumes without reopening it: iOS relaunches Eddy for
      the background activity session and the app-delegate subscriber resumes
      it (ADR 0014). Open Eddy afterwards: the path while it was closed is in
      the recap, replayed from the journal. Record how long the gap was, with
      and without cell coverage, and repeat after a reboot mid-float. Until
      this passes, River Mode tells people to leave Eddy open in the
      background; only change that copy (`floatTrackerStatus.ts`) with this
      evidence recorded.
- [ ] **Journal durability:** mid-float, force a termination from Xcode
      (stop the process) with the phone locked; reopen and confirm no
      distance is lost. Delete that float's recap and confirm Storage no
      longer counts its GPS track; delete the account and confirm Storage
      shows no tracks. Make the journal unreadable mid-float (or simulate a
      read failure in a debug build) and tap Finish: "Couldn't save your
      float" appears, nothing is added to history, and the float keeps
      recording.

- [ ] **GPS quality, VoiceOver and the map dot** on a physical iPhone: under
      a bluff or tree canopy with fixes worse than 75 m, the panel reads
      "Weak GPS · ±N m" and the status line explains, never "Waiting for
      GPS"; the dot shows an accuracy ring and, while moving, a heading
      needle; the map does not re-frame while sitting still. With VoiceOver
      on, arrival, a hazard just ahead, the sunset warning and a tracking
      problem are each spoken once when they appear. In Essentials, Keep
      screen awake is one tap away and off by default. Open Ready to float
      with location never asked: no system prompt until the Location card's
      button is tapped. Start a float (or download its map) with signal,
      then go to airplane mode: Float tools' Take-out card and Ahead rows
      show their access photos; a place with no photo shows its Eddy mark.
      Open Float tools mid-float for a minute: Share location stays enabled
      throughout. End a float that never found the river after a long wait:
      the dialog says Eddy never placed you on the river.
- [ ] **Starting a float and the on-water layout** on a physical iPhone,
      including the smallest supported screen at the largest text size, with
      several warnings showing at once (a tracking line, a sunset warning and
      the next hazard). The start summary shows the
      route preview with both ends (also with no signal). In River Mode,
      Options, Hazard and End/Finish are all visible without scrolling, and
      Options opens reminders, the Lock Screen card and keep-awake as a sheet.
      Show route frames the stretch, and Recenter then zooms back in. Access,
      hazard and end markers are labelled and open a card when tapped. A quick
      start in a parking lot reads "not on the <river> yet (about N m away)",
      not "Finding your spot". A float started more than 1 km from its river
      offers "choose another river", and that adds no recap to history. While
      recording, the tracking line says locked-phone tracking is on. In airplane mode mid-float,
      the arrival line holds still and reads "as of <time>". Pure rules:
      `float-session.test.ts`, `float-session-store.test.ts`,
      `float-permissions.test.ts`.

For the Lock Screen/Dynamic Island follow-up, use
[`float-live-activity-plan.md`](float-live-activity-plan.md). Native implementation
and device gates remain separate from the preparation fixes.

- [ ] **Hazard reports from River Mode (Phase 5, #1453).** Migration
      `20261011022115_report_client_ids.sql` was applied to production on
      2026-10-11; the column and unique index were verified. Device check
      still required: report with no signal → "Saved on your phone"; signal returns
      (foreground, or locked during a float) → "Sent for review" and exactly
      one pending row in `community_reports`; a report far from the river →
      "Not accepted" with the server's reason. Pure rules:
      `src/lib/hazard-report-queue.test.ts`.

### Float history and backup release gates — October 12, 2026

Implementation in this branch; device verification and release status unconfirmed.
See ADR 0012 for scope, consent, storage and measurement semantics.

- [ ] Apply the reviewed `float_archive` migration to the intended environment;
      verify the recorded version and move it from pending to applied in the
      production ledger when appropriate. Run `make check-db` after applying.
      Deploy the additive web API before distributing the new iOS binary.
- [ ] Update and verify App Store Connect privacy answers and reviewer notes
      from `docs/app-privacy-labels.md`. Publish the matching privacy policy.
      The `app.json` permission-text change requires a **new binary**, not OTA.
- [ ] On TestFlight, complete several real floats with a known moving interval,
      a long stop, a GPS gap, locked-screen tracking, and an interrupted/restarted
      app. Compare elapsed, moving, stopped and unobserved time to a written log.
      Test an early end and a float longer than seven hours. Record evidence
      before accepting these measurements for internal analysis.
- [ ] Test guest recap → Apple sign-in → backup → reinstall/second device →
      restore, including an existing Apple account with a different user ID.
      Recover old saved routes as well as completed summaries. Verify offline
      history and the explicit pending/error backup states.
- [ ] Exercise corrupt current and legacy local history: a recovery copy remains,
      River Mode can start, and cloud history restores. Check temporary read/write
      failures retry without resetting valid data. Refuse one trip in a backup
      larger than 20 rows: later trips and restores continue, the refused trip
      stays visible, and manual retry works. Verify a missing endpoint shows
      temporary unavailability and network retries back off. During the real-float
      stop test, confirm stationary GPS drift does not accumulate tracked miles.
- [ ] Delete a trip offline, reconnect, then open an older second device. It
      stays deleted. Delete the account with an active float and pending backup;
      no local history, raw session or queued write restores the deleted data.
- [ ] Confirm the sharing setting starts off; old trips are not enrolled when
      enabled. Finish a new trip while on, review it in `/admin/float-contributions`,
      disable sharing, and verify it disappears from future admin queries.
      Repeat a withdrawal offline and confirm retry after reconnection.
- [ ] Verify light/dark mode, large text and VoiceOver on history/recap/boat
      selection. Explain a missing historical water reading without implying
      current water. Public float estimates must remain unchanged by contributions.

### Location lifecycle and keep-awake — October 14, 2026

Implemented on this branch; device verification and release status unconfirmed.
JavaScript-only (no native change), so it can ride the same over-the-air update
as the freshness and photo-ban work if the runtime fingerprint matches.

- [ ] Locate after moving: open the map, drive or walk well away (or simulate
      a location change), tap Locate. The map centres on the new position, not
      the earlier one. With GPS unavailable (airplane mode, indoors), the
      spinner ends within about 15 seconds.
- [ ] End during start: start a float and tap End
      immediately. The blue location indicator disappears and stays gone;
      repeat with the phone locked straight after End.
- [ ] River Mode with keep-awake on: the screen stays awake through several GPS
      fixes and sleeps normally after leaving the screen or ending the float.

### Photo submitter bans (Guideline 1.2) — October 14, 2026

Implemented on this branch; device verification and release status unconfirmed.
JavaScript-only on iOS (no new native module), so it can ship over the air if
the runtime fingerprint matches the store binary.

- [x] **First, confirm #1504's report-write restrictions are live in
      production.** A ban trusts `community_reports.user_id`; while clients
      can write that table, anyone can file a report under another user's id
      and get that user banned. *Evidence, 2026-10-14:* applied (SQL editor,
      recorded as `20261013210729`); a read-only catalog query found no
      `anon`/`authenticated` INSERT or UPDATE privilege on `community_reports`,
      only its select and delete policies, and only the four allowlisted
      client-callable definer functions.
- [x] Apply the `banned_submitters` migration and record it in the ledger.
      *Evidence, 2026-10-14:* recorded as `20261014185949` (file renamed);
      RLS on, no client privileges, service role has access.
- [ ] Run `make check-db` against the linked project. Deploy the web app
      (report route + admin ban route) before publishing the iOS update; older
      app builds keep submitting anonymously and are unaffected.
- [ ] On a device as a guest: Add a photo shows only the Sign in with Apple
      prompt; signing in reveals the form in place; a submitted photo lands as a
      pending `community_reports` row WITH `user_id`.
- [ ] In `/admin/reports`, Ban submitter on that report: its photos (pending and
      verified) become rejected and leave the public gallery; a new submission
      from the same account gets "This account can no longer submit reports."
      Delete the account, sign in again with the same Apple ID, and confirm the
      ban still applies (Apple-subject key). Remove the test ban row afterwards.
- [ ] Update App Store Connect privacy answers and paste the revised reviewer
      note from `docs/app-privacy-labels.md`; publish the updated privacy policy.

### In-app web browser gates — October 11, 2026

Device and release status are unconfirmed. `expo-web-browser` and the local
`eddy-links` bridge add native modules: rebuild the development/preview/production client before testing or
shipping; do not ship this change as an OTA-only update.

- [ ] Open a River Guide, a gauge source, an alert source, an outfitter site
      and a policy page. Confirm a Safari sheet with **Done**, a visible domain
      and the standard option to open in the full browser. Check Eddy's control
      tint in light/dark mode, including closing, changing appearance and reopening.
- [ ] Open Recreation.gov from the camping list, campground detail modal,
      campsite card and map sheet **with its app installed and already signed
      in**, then **without it installed**. When iOS recognizes the specific
      booking URL, confirm it opens the provider app and keeps its session;
      otherwise confirm an in-app Safari sheet opens without a separate Safari
      launch. Include a link the provider app does not support and a disabled
      universal-link association. Confirm the URL/site/query is preserved;
      test login and the booking flow without submitting a reservation. Browser Done
      and swipe-to-dismiss return to the same selected campground, dates and
      scroll position; returning from Recreation.gov preserves that context too.
      Rapid repeated taps initiate only one handoff/browser presentation.
- [ ] On both river and access-point detail screens, a service website stored
      as `www.example.com` opens successfully. Invalid/empty websites have no
      website button; the phone action remains available independently.
- [ ] Verify directions (Apple Maps and an installed alternative), saved-float
      shuttle directions, telephone/email links, subscription management and
      offer redemption still open their appropriate system apps. Existing
      native river/gauge/access/float navigation still opens the app screen.
- [ ] With no connection, the browser can still be dismissed and Eddy remains
      usable. Exercise a failed browser handoff: system-browser fallback works;
      if that also fails, a retry alert or the existing inline booking error
      appears and a later tap can retry.

### 1.1 delta gates found in the August 11 repository audit

**Historical.** 1.1 shipped. These are kept because the ones still unticked
are unticked for a reason, and two of them recur above.

- [x] Apply `20260811130000_search_gauges_provider_provenance.sql` and verify
      both `search_gauges` overloads. The four-argument form keeps 1.0 working;
      the five-argument form serves paged 1.1 search. The migration adds one
      column and changes no reading semantics, so a rollback is a re-apply of
      00207. *Verified in production 2026-08-15: both overloads present
      (`pg_proc` shows the 4-arg and 5-arg signatures).*
- [ ] Confirm a saved USGS gauge still shows its site number in Reports before
      any account syncs. A star written by 1.0 carries no provider, and for a
      signed-out user nothing will ever fill one in — the caption has to fall
      back to the site number rather than to a bare "Gauge".
- [x] Apply `20260810202000_trust_usgs_site_scope.sql`, confirm it with
      `npm run db:check-migrations`, then rerun `usgs_site_drift`. The live
      check currently calls this RPC with no readable scope and refuses
      reconciliation as `check_error`. *Verified 2026-08-15: applied, and
      `trust_runs` shows `usgs_site_drift` green since 2026-08-11 with
      `scope_count: 43`; the stuck finding auto-resolved on the first run.*
- [x] Deploy the web/API changes, then confirm the exact Clearwater Dam search
      result says **USACE release**, carries `provider: "usace"`, and never
      exposes `swl-clearwater-dam` as though it were a public station number.
      Migration-first is still the intended order, but it is no longer a gate:
      an unknown provider now falls back to the site number when the id is one,
      so code-before-migration lands on 1.0's copy instead of blanking every
      site id in search. See `shared/station-caption.ts`. *Verified against
      the live API 2026-08-15: `/api/search?q=clearwater dam` returns
      "Black River below Clearwater Dam" with subtitle "Black River · USACE
      release" and `provider: "usace"`; no station-number caption.*
- [x] Confirm Clearwater detail qualifier copy says **USACE**, not USGS.
      *Verified live 2026-08-15: `/api/gauges/swl-clearwater-dam` says
      "Provisional USACE data".*
- [x] Run the USGS site-drift regression suite in both UTC and
      `America/Chicago`; the official `end_utc` field must win.
- [ ] Review every critical/high Trust Ledger finding after the August 11
      snoozes expire. Resolve only after the invariant passes; do not extend a
      snooze as a substitute for remediation. *August 15 state: the
      `admin_policies_use_is_admin` high is fixed (see the August 15 gates
      below); the Jacks Fork critical and the Courtois high remain open and
      each needs a judgement, not a snooze.*
- [ ] Run `npm run db:check-services` against production and account for every
      eligible service without coordinates before calling the Maps service
      model complete.
- [ ] Exercise access-point badges on device: plain access keeps **Access**;
      `access + boat ramp/campground/bridge/gravel bar/park` drops the redundant
      generic badge.
- [x] Run the complete web and iOS automated checks.
- [ ] Smoke-test the 1.0 production app before TestFlight so the staggered
      backend rollout proves backward compatibility.

### Delta gates added by the August 15 pre-release review

Everything the August 11 audit missed because it happened after August 11.

- [x] **Migration history reconciled with production.** Two-way drift had
      accumulated: seventeen post-baseline migrations were applied through the
      SQL editor with recorded versions that differed from their repo
      filenames; `tailwater_gauge_roles` (2026-08-13) was applied to production
      from a checkout whose migration file never landed; and three repo
      migrations (`dam_metric_history`, `reconcile_access_point_slugs`,
      `dam_metric_history_retention_comment`) were unapplied. Fixed 2026-08-15:
      the seventeen version strings were repaired in
      `supabase_migrations.schema_migrations` to match the repo filenames (the
      filenames are what code comments and provenance notes cite),
      `tailwater_gauge_roles` was adopted into the repo verbatim from the
      recorded statements — see the header of
      `20260813005710_tailwater_gauge_roles.sql` — and the three pending
      migrations were applied and recorded. Post-baseline histories now pair
      1:1 (58 = 58).
- [ ] Run `make check-db` from a linked checkout to confirm the reconciliation
      from the CLI's view. (The fix was verified by direct comparison of
      `schema_migrations` against the migrations directory, but this command is
      the release gate and needs the linked project.)
- [x] **Generation pattern strip has data.** `/api/cron/sync-dam-history`
      (`25 * * * *`) had been warn-failing since the dam console deployed,
      because `dam_metric_readings` did not exist; the table was created
      2026-08-15. *Verified the same evening: 878 hourly rows per metric
      across 18 dams (the 48-hour lookback window), and the live
      `/api/dams/<id>` pattern payload serves them, with older days honestly
      null.*
- [x] **Backfill the strip's older days while CWMS can still serve them.**
      Done 2026-08-15/16, ahead of the age-out deadline. The deployed route
      needs `CRON_SECRET`, so the 192-hour pull ran out-of-band using the
      same series resolution as the route (`seriesFor` → CWMS `timeseries`,
      hourly-bucketed, inserted with `on conflict do nothing` below the
      2026-08-13 20:00 UTC table-creation cutoff so cron-written rows were
      never touched). This included the three LRN Cumberland dams, which
      main added after this branch was cut (PR #1198) — their series came
      from main's registry so their pre-cutoff week was saved too.
      *Verified: all 18 hourly dams hold 190–193 rows per metric spanning
      2026-08-07/08 → now, joining the cron's rows with no gap.*
- [x] **`access_point_services` admin policies call `is_admin()`.**
      `20260811140000` wrote its three admin policies in the inlined
      `user_roles` form that `20260804235408` had already banished, and
      `trust_schema_invariants` flagged it (high) from August 14. Fixed by
      `20260815180000_access_point_services_policies_call_is_admin.sql`,
      applied 2026-08-15; the finding auto-resolves on the next trust tick.
- [x] Regenerate `src/types/database.ts` after the schema work (done
      2026-08-15; the regen was purely additive — `access_point_services`,
      `dam_metric_readings`, `river_gauges.role` and the condition-rating
      provenance columns, `rivers.controlling_dam_id`).

### Delta gate added by the August 18 chart-scrub rework

- [ ] On device: exercise the gauge chart's scrub everywhere it renders. The
      scrub moved from PanResponder to `Gesture.Pan()` so it exists inside the
      map sheet (it used to be switched off there), and gesture arbitration is
      exactly the class of change the repo's rule says wants a device.
      Specifically: **in the map sheet's History tab**, a horizontal drag on
      the plot scrubs without turning the page, a vertical drag still moves the
      sheet (the readout may flash for ~8pt — expected), and a tap reads out
      while held; **on the gauge and river screens**, a vertical drag on the
      plot now scrolls the screen (it used to freeze) and the scrub still
      works. Then **with VoiceOver**: the plot is an adjustable element — a
      swipe up/down steps one reading at a time, announcing value, time, and
      the forecast/provisional labels.

### Live production backlog inspected August 11

The Trust Ledger is operating (day 6 of 28, 0% false positives among 35 reviewed,
all six safety-baseline findings still closed), but it is not release-green:

- ~~**Critical — `usgs_site_drift`**~~ **Resolved 2026-08-11:** the scope
  migration went in and the check has run green since (`scope_count: 43`,
  the stuck finding auto-resolved). Re-verified 2026-08-15.
- **Critical — Jacks Fork threshold order (still open as of August 15):** the
  offending gauge is Jacks Fork near Mountain View (07065200), where
  `level_low = level_optimal_min = 100` — not strictly increasing, so the
  badge at exactly 100 cfs sits on an ambiguous boundary. `optimal_max =
  high` is repo-wide design (see `align_high_threshold_with_optimal_max`)
  and is not the problem; `high < dangerous` holds everywhere. The fix is a
  data judgement about that reach (nudge `level_optimal_min` above 100), and
  it was deliberately left unfixed by the August 15 review pending that
  judgement. The finding has been re-snoozed at least once; a snooze is not
  remediation.
- **High — Courtois gauge proximity (snoozed):** Courtois intentionally borrows
  Huzzah's gauge about five miles away. Encode or accept that governed proxy
  relationship instead of repeatedly snoozing a geometry warning.
- **Medium — unsnapped access points:** run the idempotent
  `npm run db:snap-access-points` for Mother Nature's Riverfront Retreat
  (Niangua) and Montauk State Park (Current), then rerun validation.
- **Medium — War Eagle Creek length:** investigate the 33.17-mile stored length
  versus the 68.1-mile line before changing either. After the correct half is
  fixed, run `npm run db:correct-miles`; do not blanket-copy geometry lengths.

The public production service API currently reports 153 eligible services, 138
mapped and 15 missing coordinates. Twenty-seven mapped services still lack
coordinate provenance. The full authenticated `db:check-services` run remains a
release gate because the public endpoint does not expose verification timestamps,
Google place IDs, or embedded-service drift.

Everything between a green `make check` and an app on someone's phone. None of
it is verifiable from a checkout, which is exactly why it is written down: the
app degrades *silently* when any of it is missing, so a misconfigured build
installs fine and simply looks like it is missing features.

**This doc is the single source of truth for the release path.** Any PR that
changes it must update this file in the same PR. Dashboard credentials live in
the operator's password manager, never here.

For the RevenueCat dashboard specifically, `missouri-float-planner/docs/REVENUECAT_SETUP.md`
is the detailed guide — this file only names the checks.

---

## The order matters

Each block gates the next. Doing them out of order mostly wastes time, except
where noted.

```
Apple enrolment → App ID + ASC record → EAS credentials (signing, APNs)
      → environment variables → preview build → field test
      → IAP products + store metadata → production build → submit
```

---

## 1 · Apple Developer Program

- [ ] Enrolment complete, Team ID visible in App Store Connect.
- [ ] App ID registered for **`eddy.guide.app`**.

The bundle identifier is the domain in forward order, not reverse-DNS. That is
deliberate and immutable once a build ships — see `eddy-ios/README.md`.

- [ ] Capabilities on the App ID: **Push Notifications**, **Sign in with Apple**,
      **In-App Purchase**.

> **You can skip this whole block to test locally.** The `development` EAS
> profile sets `ios.simulator: true`, and a simulator build is signed ad-hoc, so
> the native modules, the icon, the splash and the Map tab can all be exercised
> before enrolment finishes. Everything that installs on a physical device
> needs the account.

## 2 · App Store Connect record

- [ ] App record created for `eddy.guide.app`.
- [ ] `eas submit --profile production` finds it.

`eas.json`'s `submit.production` is empty. That is fine — Expo's interactive
flow locates or creates the record. Adding `ascAppId` only makes submission
repeatable and non-interactive; it is not a prerequisite.

## 3 · EAS credentials

- [ ] `eas credentials` shows a distribution certificate and provisioning
      profile for `eddy.guide.app`.
- [ ] **APNs key uploaded.** `eas credentials` → iOS → Push Notifications.

EAS can create these during the first build; you do not have to pre-upload
them. But push cannot be exercised before this exists, and it cannot be
exercised in a simulator either — `getExpoPushToken` returns null when
`Device.isDevice` is false, so the first real test of the whole push path is
the first TestFlight build.

## 4 · Environment variables

**This is the block most likely to produce a "why is everything broken" build**,
because every one of these fails gracefully and separately.

Set per environment with `eas env:create`, for **`development`, `preview` and
`production`** — `eas.json` declares `environment` on each profile, so a
variable set for only one silently does nothing in the others.

| Variable | Missing ⇒ |
|---|---|
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Map tab shows the "missing token" panel — the flagship tab, gone |
| `EXPO_PUBLIC_SUPABASE_URL` | no auth ⇒ no alerts, no push, no purchases, favourites local-only |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | as above |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | paywall says "Subscriptions are not available in this build" |
| `EXPO_PUBLIC_SENTRY_DSN` | SDK inert — **you get no crash reports from the field test** |

- [ ] `eas env:list --environment preview` shows all five.
- [ ] Same for `production`.
- [ ] `make check-eas-env` green.

**The failure mode is asymmetry, not absence, and `env:list` cannot show it.**
It prints one environment at a time, so a variable set for `production` and
forgotten for `preview` looks correct from either screen. That is not
hypothetical: `SENTRY_ORG` and `SENTRY_PROJECT` were present on `production`
only while every build ran `--profile preview`, so the source-map step executed
with no org — and the build failed inside Xcode, naming a build phase and never
the variable. `make check-eas-env` diffs the *names* across both.

**Source maps are a different, secret credential.** `SENTRY_ORG`,
`SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` go in as EAS **secrets**, never as
`EXPO_PUBLIC_` — Metro inlines anything `EXPO_PUBLIC_` into the bundle, and the
auth token can write to the Sentry org.

**Set all three for EVERY environment you build**, not just `production`. The
Sentry config plugin adds a source-map upload step to the Xcode build, and
sentry-cli reads these from the environment at that moment. Setting them on
`production` alone means a `preview` build reaches the upload step with nothing
and fails:

```
sentry-cli - error: An organization ID or slug is required
```

`eas.json` sets `SENTRY_ALLOW_FAILURE=true` on all three profiles so that
cannot take a build down. **This is deliberate, not a workaround:** symbolicated
stack traces are worth having and are not worth losing a build over. A crash
reporter that can break the thing it observes has its priorities backwards, and
this failure mode is at its worst exactly when you are least able to absorb it —
mid-incident, shipping a fix, with a token that expired.

The cost of the flag is that a broken upload is a warning rather than an error,
so **check for symbolication once per credential change** rather than trusting
it silently: a crash whose stack is minified means the upload is not working
even though the build went green.

- [ ] Sentry project created. Same org as the web app, whose own wiring is
      specified in `missouri-float-planner/docs/OBSERVABILITY_AND_UPGRADES.md`.

### Vercel — the server side of the same release

These are **not** EAS variables and none of them are `EXPO_PUBLIC_`. They live in
Vercel's project settings and every one of them, like the block above, fails
silently and separately.

| Variable | Missing ⇒ |
|---|---|
| `SENTRY_DSN` | **server and edge** web errors go to `ERROR_WEBHOOK_URL` if set, otherwise nowhere |
| `NEXT_PUBLIC_SENTRY_DSN` | **browser** errors go nowhere. A separate variable, and it must carry the prefix or it never reaches the page |
| `SENTRY_AUTH_TOKEN` | stack traces point at minified output — source maps are not uploaded. A **write** credential: never `NEXT_PUBLIC_` |
| `SENTRY_ORG` / `SENTRY_PROJECT` | as above; source-map upload needs all three or it is skipped |
| `APPLE_TEAM_ID` | Token exchange fails; queued revocations retry — see below |
| `APPLE_KEY_ID` | as above |
| `APPLE_PRIVATE_KEY` | as above |
| `APPLE_CLIENT_ID` | as above; the value is the bundle id, `eddy.guide.app` |

- [ ] All four `APPLE_*` set in **production**. Any one missing and
      `appleCredentialsFromEnv()` returns null, so `/api/me/apple-token` answers
      `{ stored: false, reason: 'not_configured' }` and account deletion never
      calls Apple's revocation endpoint. **That is a Guideline 5.1.1(v)
      rejection**, and nothing in the app looks broken: sign-in works, deletion
      works, only Apple is never told.
- [ ] `APPLE_PRIVATE_KEY` is the whole `.p8` including the BEGIN/END lines.
      Vercel cannot hold real newlines, so paste it with literal `\n` — the code
      unescapes them. A key that fails to import produces an opaque Apple `400`
      that names neither the variable nor the cause.
- [ ] The key is an **Apple Developer key with Sign in with Apple enabled**
      (Certificates → Keys), not an APNs key. They look identical on disk.
- [ ] Migration `00211_apple_refresh_tokens.sql` applied.

Verify end to end, in sandbox, before submission — this path cannot be exercised
from a checkout:

- [x] Applied `20261004034340_apple_revocation_outbox.sql` to production on
      2026-10-04 **before deploying the new deletion route**; the filename and
      migration ledger match the recorded version. Verified the outbox, enabled
      auth deletion trigger, RLS and service-only permissions. Other environments
      must also apply this migration before deploying the new deletion route.
- [ ] Enable **manual identity linking** in Supabase Auth before shipping the new
      client. Do not silently fall back to a new user if linking is disabled.
- [ ] Sign in with Apple on device; confirm `/api/me/apple-token` returns
      `{ stored: true }` and a row exists. HTTP 200 alone does not prove storage.
      Check only row existence/status; never print or copy refresh tokens.
- [ ] Delete the account in-app. Confirm `appleRevoked: true` and
      `appleRevocationStatus: "revoked"` in the response or server event, both
      token tables are clear for the test account, and the Apple authorization
      is revoked. `missing_token` means exchange/storage needs investigation.
- [ ] In a **sandbox/preview environment only**, break Apple credentials or
      simulate a timeout and delete a test account: deletion succeeds with
      `pending`, and the retry row survives the user/token cascade. Restore the
      credentials, run `/api/cron/revoke-apple-tokens` with cron authentication,
      and verify the retry disappears after success. Missing credentials and
      retry failures must appear in job monitoring. Never test by disrupting
      production credentials or deleting a real user's account.
- [ ] Verify guest Delete my data removes server rows and local favorites/floats.
      With no backend session, verify local cleanup; with a guest session and a
      network failure, preserve the session/data so deletion can be retried.
- [ ] Fresh Apple signup preserves the guest user id and selected favorites.
      Existing Apple-account sign-in restores its id and merges newly selected
      favorites. Test with Hide My Email, cancellation, offline failure and
      relaunch at the optional sign-in step. Restored signed-in sessions and
      completed existing installs must not be asked again.
- [ ] Location prompts only on “Find rivers near me,” map Locate, or another
      explicit location action. Verify Allow Once, While Using, approximate
      location, denial/manual search, and return from Settings. No location or
      notification prompt is automatically chained to Apple sign-in.

Read-only production check on October 4, 2026: 13 community reports, none with
`user_id`; `river_photos` has no account column; zero stored Apple refresh tokens.
This supports the anonymous-submission policy but does **not** verify Apple
configuration. The device exchange/revocation checks above remain required.

## 5 · Supabase

- [ ] Deploy server code required by a restrictive migration before applying it.
- [ ] Smoke-test the newly deployed server path while the old policy still exists.
- [ ] Run `supabase db push --dry-run`, review the exact statements, then apply them.
- [ ] Smoke-test both the public operation and its admin operation after migration.
- [ ] From `missouri-float-planner/`, `npm run db:check-migrations` passes.

For `20260731010000_feedback_api_only.sql`, this order is mandatory. The
predecessor feedback POST uses the session client and depends on the public
INSERT policy; applying the migration before deploying its service-role
replacement would break feedback submissions. Deploy the route first, verify a
submission, apply the migration, then verify submission and admin triage again.

This is a release gate, not a PR gate: a PR that introduces a migration is
supposed to be ahead of production until deployment. The command uses the
repository-pinned Supabase CLI and fails if either side has a newer migration
missing from the other. It is deliberately forward-only: the frozen legacy
baseline is not evidence that historical RLS policies or CHECK constraints are
correct. Use the separate legacy schema-security audit before relying on those
objects. New migrations use timestamp identifiers. On a new checkout, link it
once with `npx supabase link --project-ref <project-ref>`.

Run it as `make check-db`. It is deliberately outside `make check`, because it
needs a linked project and CI has to stay hermetic — which is also why it cannot
be a PR gate, and why it goes unrun unless something names it. That has already
cost something: `20260803170000_recalibrate_ozark_float_ladders` was applied by
hand in the SQL editor and the recording step was missed, so `schema_migrations`
disagreed with the repo for a day while every effect of it sat in production.
Invisible from the app, invisible from the console, and surfaced only by running
this check. **Run it after applying anything by hand, not just before a
release.**

- [ ] **Anonymous sign-ins enabled** (Authentication → Providers).

Without it the client gets `422 anonymous_provider_disabled`, silently stays
local-only, and every account-dependent feature is dark.

- [ ] Apple provider enabled, with `eddy.guide.app` as an authorised client ID.

## 6 · Do not lock your testers out

- [ ] `app_config.min_supported_version` is **null, or ≤ the shipped version**.

`UpgradeGate` is the only screen in the app with no way out. It fails open
correctly — an unreachable config means no requirement — but a value above the
shipped version bricks every install with no recourse but a new build.

```sql
select min_supported_version from app_config;
```

## 6b · Universal links

Shared float links (`eddy.guide/plan/<shortCode>`) open the app instead of
Safari. Everything is in the repo — Team ID `D4U38CY2HK` is in
`src/lib/navigation/apple-app-site-association.ts` — but the association is made
by Apple at install time and cannot be verified from a checkout.

- [ ] The web app is deployed **before** the build is distributed. iOS fetches
      the association file when the app installs; if it 404s, the app is
      installed WITHOUT the association and only a reinstall fixes it.
- [ ] `curl -sI https://eddy.guide/.well-known/apple-app-site-association`
      returns **200**, `content-type: application/json`, and **no 3xx**. Apple's
      CDN does not follow redirects for this file.
- [ ] `curl -s https://eddy.guide/.well-known/apple-app-site-association | jq`
      shows `D4U38CY2HK.eddy.guide.app`.

Then on a real device, with a build that has `associatedDomains`:

- [ ] Send yourself an `eddy.guide/plan/<shortCode>` link in Messages or Notes
      and **tap** it. It must open Eddy on the float screen.

Two things that will otherwise waste an afternoon: universal links do **not**
work in the simulator, and typing the URL into Safari's address bar is specified
*not* to trigger them — it has to be a tapped link from another app. If it opens
in Safari, pull down on the page for the "Open in Eddy" banner; if that is
missing too, the association never happened.

Apple caches the association file, so a wrong version outlives the fix. Get the
`curl` checks green before distributing a build.

## 7 · Build

**Use the make targets.** They exist because three of the failure modes below
are caused by commands you are *supposed* to run, and are not something to
remember:

```bash
make build-ios     # internal distribution, for device testing
make testflight    # production build, auto-submitted
```

Each one first deletes `eddy-ios/ios` and `eddy-ios/android`, then runs the
`.easignore` allowlist check, then builds. The raw commands still work if you
need them, but you own the cleanup:

```bash
cd eddy-ios
eas build --profile preview --platform ios     # internal distribution
eas build --profile production --platform ios  # App Store, autoIncrement
```

- [ ] Running Node matches `.nvmrc` (`nvm use`). Every make target enforces
      this; the raw commands do not.
- [ ] `make check` green at the repo root first — the bundle step there is what
      catches Metro/EAS breakage that is invisible in dev.
- [ ] `make check-eas-env` green. It compares variable *names* across `preview`
      and `production`, which `eas env:list` cannot do — see §4.
- [ ] Build succeeds.

### The archive trap, and why it is not a checklist item

`expo prebuild` and `expo run:ios` **generate** `eddy-ios/ios/`. Precompiled
Swift modules under `ios/build/` record the absolute path of the machine that
built them, so if that directory reaches the worker the build fails with:

```
missing required module 'SwiftShims'
… was compiled with module cache path '/Users/<someone>/Eddy/eddy-ios/ios/build/…'
```

naming a Swift module and a stranger's home directory rather than the cause.
`.easignore` denies `ios/`, and `check-easignore.py` asserts that rule — but the
script needs the `pathspec` package, and without it the check does not run at
all. That is why the deletion is a make prerequisite rather than a line in this
list.

To see exactly what would be uploaded, rather than reasoning about gitignore
semantics:

```bash
cd eddy-ios
npx eas-cli@latest build:inspect --platform ios --stage archive --output-dir /tmp/eas-archive
```

### Building without a cloud build credit

The Free plan's iOS builds are monthly and they run out. When they do, nothing
about the app is wrong and there is nothing to wait for — the work moves to
your Mac. Three targets, in the order you reach for them:

| Target | Produces | Signing | Costs an EAS build |
| --- | --- | --- | --- |
| `make run-ios` | app on the simulator | none (ad-hoc) | no |
| `make archive-ios` | .ipa via Xcode, submittable | Xcode, your login keychain | no |
| `make build-ios` / `make testflight` | .ipa via EAS | EAS-held credentials | **yes** |

**Pull the environment first, once per machine:**

```bash
make env-pull      # writes eddy-ios/.env from the EAS 'production' environment
```

This is the step with no error message. A cloud build has `EXPO_PUBLIC_*`
injected by EAS; a local one does not, because Metro inlines them from the
process. Skip it and the build succeeds, the app launches, and the map is an
empty panel, auth never happens and the paywall says purchases are unavailable
— which reads as several unrelated bugs rather than as one missing file. The
table in §"What each variable costs you" is the same list of symptoms.

`.env` holds live keys. `.gitignore` covers `.env` and every `.env.*`
variant except the tracked `.env.example`, and `.easignore` denies them from
the archive; neither of those is a reason to be casual with it.

**Why `eas build --local` is not in that table.** It exists and it is the
obvious thing to try, but it fails on recent macOS in a way that is not worth
debugging under release pressure:

```
[PREPARE_CREDENTIALS] Importing distribution certificate into the keychain
[PREPARE_CREDENTIALS] Validating whether the distribution certificate has been imported successfully
Error: Distribution certificate with fingerprint ... hasn't been imported successfully
```

It creates a throwaway keychain, imports the `.p12` EAS holds, and validates
it there. The certificate is fine — `security find-identity -v -p codesigning`
will list it — it is the temporary-keychain round trip that is unreliable.
`make archive-ios` avoids the whole path by letting Xcode sign with the
identity already in your login keychain.

It also needs fastlane on PATH (`brew install fastlane`, not `gem install`:
macOS system Ruby is 2.6 and Apple-deprecated), and it fails
`spawn fastlane ENOENT` without it.

**`expo doctor` runs first and can stop a local build** over patch-level
dependency drift that a cloud build tolerates. `npx expo install --check` is
the fix, on Node 20, followed by `make check` — it rewrites
`package-lock.json`, which is exactly the file `guard-node` exists to protect.

### Local builds and code signing

A simulator build is signed ad-hoc and needs no certificate. A **local device**
build does — and any signing configured in Xcode lives in `ios/`, which the next
`prebuild --clean` deletes. That is why the certificate error keeps coming back.

| Need | Use | Signing |
|---|---|---|
| JS iteration, most screens | `make dev` → simulator | none |
| Push, StoreKit sandbox, universal links | `make build-ios` → install internally | EAS holds credentials |

Known issue: on Xcode 26.6 with Expo CLI 57.0.10, `expo run:ios` has resolved a
signing certificate even for a **simulator** destination, failing with
`No code signing certificates are available to use`. Bypass with xcodebuild,
which cannot require signing for a simulator:

```bash
cd eddy-ios/ios
xcodebuild -workspace *.xcworkspace -scheme Eddy -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
  CODE_SIGNING_ALLOWED=NO build
```

**Verify the native archive for this release.** The repository does not establish
which of the newly added modules/extensions were in the last shipped binary.
A JavaScript export does not prove Swift compilation, signing, extension version
matching, Mapbox pod integration or App Store validation.

### If the app launches to a splash screen that never lifts

The hardest symptom this app has, because it names nothing. Work out WHICH
splash you are looking at first — that alone halves the search.

**`app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` at module
scope.** So if JS never ran, that call never happened, and the Expo splash would
have hidden on its own. A splash that stays forever therefore means one of two
very different things:

| What you see | What it means |
|---|---|
| Expo splash, stuck | JS ran. Something in the tree never reached `ThemedShell`, which owns `hideAsync`. The 8s backstop in `_layout.tsx` should have lifted it — if it did not, JS did **not** run |
| iOS launch storyboard | The React Native bridge never started. No JS of ours has executed and no JS-side fix can help |

They look nearly identical, which is the trap.

**If the bridge never started**, the suspect is whatever runs before it, and on
this app that is `expo-updates` — it decides which bundle Hermes gets. Two
settings in `app.json` are explicit for that reason rather than left to
defaults: `fallbackToCacheTimeout: 0` (launch from the embedded bundle at once,
fetch any update in the background for next time) and `checkAutomatically:
"ON_LOAD"`. Neither may be raised without understanding that the launch waits.

The decisive test, one build:

```json
"updates": { "enabled": false, ... }
```

Launches ⇒ it is `expo-updates`. Still hangs ⇒ the embedded bundle or Hermes,
and `updates` is eliminated.

**Bisecting with Expo Go is free and worth doing first.** `npx expo start` runs
every screen except the Map tab. If the app is fine there, the JS is sound and
the problem is native — which is most of the answer for the cost of two minutes.

**Reading the device is definitive.** Connect the phone, open **Console.app**,
select it in the sidebar, and — the step everyone misses — **Action → Include
Info Messages *and* Include Debug Messages**, or `expo-updates` logs at info
level are hidden and the window looks empty. Filter on `Eddy`, then launch.

## 8 · Field test (TestFlight, internal)

- [ ] Build uploaded and installable.
- [ ] Sentry receiving events — trigger a deliberate throw and confirm one
      arrives **with no token in it**.
- [ ] Map tab draws.
- [ ] Push: create an alert, accept the primer, confirm a token registers and a
      test notification lands.
- [ ] Airplane mode on a river screen — expect the name, the line and the
      put-ins, not "River not found".

IAP products are **not** needed for an internal build. They block purchase
testing and the first submission, not installation.

## 9 · App Store submission

- [ ] Subscription products created in ASC, attached to the RevenueCat offering
      marked **current**, and **submitted with the build**. If they are not,
      `fetchOfferings()` returns empty and the reviewer sees "No subscription
      options are available right now" — a clean 2.1 rejection.
- [ ] StoreKit sandbox purchase run end to end: purchase → RevenueCat webhook →
      `entitlements` row → `/api/me/profile` → `waitForEntitlement`.
- [ ] Support URL, Marketing URL, privacy policy URL.
- [ ] App Privacy nutrition labels, age rating. **The answers are written down**
      — see `docs/app-privacy-labels.md`, which records each category, whether it
      is linked to identity, and the code that makes the answer true. Transcribe
      the verified answers after closing its open SDK/coarse-location checks;
      do not paste unresolved categories as if they were verified.
- [ ] Screenshots (6.9" and 6.5").
- [ ] **Reviewer notes** — a paste-ready block lives at the bottom of
      `docs/app-privacy-labels.md`. It covers the things that otherwise read as
      broken: the app is anonymous-first so no demo account is needed to browse,
      but the paywall deliberately renders no purchase controls until Sign in
      with Apple completes; location is only ever requested on an explicit tap;
      account deletion is in Profile; and community photos are moderated before
      publication.

### Home Screen widget release gates

River level (small) and Your rivers (medium) share the Live Activity extension.
See [condition-widgets.md](condition-widgets.md) for the contract. These gates
require a new binary; do not deliver the native changes as an OTA update.

- [ ] Deploy the additive gauge `widget` and history `widgetSeries` API fields
      before distributing the binary. Deploy and validate
      `GET /api/gauges/:siteId?widget=1` on production BEFORE a build containing
      the new widget request ships. Confirm its compact payload includes the
      same observation, unit-specific river rating, suspect flag and NWS
      warning as the full endpoint; old binaries and a new binary against an
      older server must still decode the full response.
- [ ] Run `expo prebuild --platform ios --no-install` and
      `node scripts/check-float-activity.cjs` from `eddy-ios`, then compile/archive
      both targets in Xcode or EAS. Inspect the archive for all five bundle
      members (four condition widgets and the Live Activity), both otter assets,
      `DamMark`/`RiverMark`, `ConditionsPreview.json`, and the
      extension privacy manifest. Run the Mac Foundation contract checks in
      [condition-widgets.md](condition-widgets.md#build-and-acceptance).
      Confirm `ConditionWidgetData.swift` compiles in BOTH the Expo native
      module and the WidgetKit extension; `refreshConditionsWidgets` and
      `readWidgetDiagnostics` must be callable in the installed native build,
      and the extension must be signed and archived. JS checks do not compile
      Swift; an OTA-only update cannot deliver these methods.
- [ ] Register/provision `group.eddy.guide.app.widgets` for BOTH
      `eddy.guide.app` and `eddy.guide.app.FloatActivity`. Verify the installed
      build reads the same shared defaults from the app and extension. Inspect
      the signed entitlements, not only the generated project.
- [ ] In Alerts → Mine, confirm widget discovery appears once on a supported
      iOS binary for signed-in and signed-out users, with no permission prompt.
      Dismiss the invitation and confirm it becomes a compact, always-reopenable
      River Widgets row across app restarts. Verify old binaries without
      widget support and Expo Go do not advertise a widget they cannot add.
      Open the setup guide and switch between River level (small, Edit Widget
      station picker), Your rivers (medium, three station pickers), Dam generation
      and Daily river report. Old binaries must retain the original two-widget
      guide and automatic-Favorites instructions.
      Check Apple Home Screen steps, illustrative sample-data labeling,
      non-notification/freshness copy, and VoiceOver, large text, light/dark,
      sheet swipe dismissal and scrolling on a small phone.
- [ ] Compile `SupplementaryWidgetData.swift` in both host and extension, and
      `EddyReportWidgets.swift` in the extension. Verify `widgetLayoutVersion()`
      returns 3 and all four widgets appear. Deploy the additive dam `?widget=1`
      API before distributing the binary; old API responses must remain unavailable.
- [ ] Upgrade a device with an existing static Your rivers widget. Confirm it
      keeps Favorites defaults and now offers Edit Widget with three pickers.
      Check explicit choices, cleared slots, duplicates, unstarred choices and
      independent configurations on two medium widgets. Check small-widget
      “Steady”/“Slow rise” labels and one large CFS or FT reading, matching the
      river's rating unit. Check six-digit CFS, negative/decimal feet and long
      station names; no second unit should appear or crowd the reading.
- [ ] Verify the dam's 24 posted-MW bars, current-hour pointer and Central-time
      axis against its detail schedule, including zero and missing hours,
      a late-night phone in another timezone, Central midnight and DST.
      Stale schedules must stop drawing and yesterday must never become today.
      Confirm Daily River Report shows its title/river/condition once, uses the
      river artwork and weather icons, and preserves flood warnings and gauge
      observation time. Inspect all three layouts on small phones and at xxLarge
      text in light, dark and tinted appearances. These are native visual gates.
- [ ] Add/edit Dam generation and Daily river report. Check compact and large
      text, light/dark/tinted, VoiceOver, gallery sample labels, no selection,
      cold/warm deep links, offline cache and 404 removal. Exercise two-hour
      observation expiry, 90-minute schedule expiry and Central midnight/three-hour
      forecast expiry without network refresh. Missing turbine flow must not say
      generation is off; a failed forecast must not hide a valid gauge reading.
- [ ] On a physical iPhone, add/edit River level, add Your rivers, and verify
      light, dark, tinted Home Screen, smallest supported screen, large text,
      and VoiceOver. Names, units, status and observation age must remain legible.
      Check the larger-text row reduction/link, long ages, and warning labels;
      optional details must yield before essential text shrinks or clips.
      Confirm the gallery has sample readings/history before starring anything,
      with "Sample data" replacing every reading age visually and in VoiceOver;
      an installed empty widget still shows the setup prompt, and an installed
      configured widget shows the real observation age.
- [ ] Verify no-star/first-launch states; multiple independently configured
      small widgets; river/gauge stars, unstar while refreshing, account deletion,
      and offline relaunch. Favorites must reflect the app and never resurrect
      removed items. National gauges must remain unrated.
      Unstar a national gauge selected in a small widget, including before its
      first refresh; its saved station name must survive app/widget relaunch.
- [ ] Verify each row/card deep link with Eddy cold, warm, and already on a
      different tab. For Huzzah/Courtois, verify the widget uses its selected
      river's ladder while opening the correct shared physical gauge.
- [ ] With a previously stale small and medium widget on a physical iPhone,
      open Eddy and verify a foreground reload is requested and newer readings
      appear when the API has them (iOS controls actual scheduling). Repeat
      within 15 minutes and verify the persistent throttle; changing a river
      or gauge favorite must force a reload despite the throttle. Test cold
      app launch, relaunch, background-to-foreground, and both widget sizes.
- [ ] Exercise airplane mode, a slow detail response, HTTP 429 and 5xx, a
      deleted station (404), and a new binary against an old full-response-only
      API. Read the per-station detail/history diagnostics to distinguish
      skipped timelines from attempted failures and successful fetches of old
      observations. A failure must retain the original cached timestamp and
      must not reset flood-warning or condition freshness deadlines. Confirm
      30-day diagnostic pruning, no account/location data, and NWS alerts
      when compact and full snapshots agree.
- [ ] Verify cached/offline, failed and 404 requests, missing CFS/stage, zero,
      future/invalid observation times, suspect readings, and six-hour expiry.
      Color expires without a network refresh; each row retains its own age.
      Trends expire at three hours, never bridge gaps, and exclude daily data.
- [ ] Verify an active NWS flood warning overrides a Flowing label and still
      appears for stale/flagged/unrated readings. Test expired/missing-expiry
      warnings, a successful empty lookup, unavailable NWS, and offline refresh:
      known warnings keep their original expiry; after their 15-minute display
      lifetime the card says "Check flood alerts" until refreshed or expired.
      Undated warnings switch to neutral "Alerts unavailable" without a triangle
      at the server's 24-hour reminder deadline. Repeated failures must not renew
      that deadline; a successful empty lookup must clear the unavailable state.
      Watches/advisories must not acquire warning weight. Verify these local
      transitions with networking disabled and that tapping opens the gauge.
- [ ] Confirm the existing River Mode Live Activity still starts, updates,
      expires, deep-links and ends on Lock Screen and Dynamic Island.

Record the build/device and evidence before marking these verified or released.

### Privacy manifest

Inspect the final Xcode archive's privacy report, bundled SDK manifests/signatures
and required-reason API declarations before submitting. Expo/dependency manifests
are inputs, not proof that the final app and Live Activity extension are valid.
Use only declarations that match actual API use. Resolve missing-manifest,
signature and required-reason warnings (including ITMS-91053) before submission;
do not wait for App Review to find them. See Apple's
[third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/).

---

## Things that are true and easy to get wrong

- **`.easignore` is an allowlist, and it disables `.gitignore` entirely while it
  exists.** Run `python3 eddy-ios/scripts/check-easignore.py` after touching it,
  the `file:` dependencies, or `metro.config.js`. Its own header explains why.
- **Never install `eddy-ios` with `--legacy-peer-deps`.** It silently drops
  shipped native packages. The `overrides` block is the correct fix and plain
  `npm ci` works.
- **`ios.runtimeVersion` is `{ "policy": "fingerprint" }`.** Adding a native
  module or config plugin mints a new runtime version, and old binaries stop
  being offered updates. JS-only changes ship over the air; native changes need
  a build. When the fingerprint moves, ship a build, not an update.
- **A `pk.` Mapbox token and the RevenueCat public key are public by design**
  and ship inside every binary. Restrict them in their dashboards; do not try
  to hide them.
