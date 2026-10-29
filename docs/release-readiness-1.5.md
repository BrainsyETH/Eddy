# Eddy 1.5 — release readiness

**Checked:** October 29, 2026 UTC.
**Candidate:** `main` at `97bcd980` (PR [#1655](https://github.com/BrainsyETH/Eddy/pull/1655)
merged), on branch `claude/beautiful-hopper-qjz8ll`.
**Baseline:** `e4c5a80e` (October 26, the commit that set `app.json` to
`1.5.0`), **stated by the maintainer as the commit the last build was made
from**. It was not read from an EAS build record: there is no Expo session
here. If the live build's `gitCommitHash` differs, every count and the
fingerprint comparison below move with it.

**Verdict: not ready for App Store submission; ready to cut a new binary once
this branch (which fixes every code finding below) is merged and the Time
Sensitive Notifications capability is confirmed on the App ID.** The native fingerprint moved, so this
release cannot ship as an OTA update; the server side is already deployed and
every migration in the delta is recorded in production, so the build is the
remaining engineering step. Device verification, the two open Trust Ledger
criticals and the carried runbook gates still stand between a build and
submission.

## Release identity and measured delta

`app.json` is **1.5.0**. The live App Store version, build number and the
shipped build's `gitCommitHash`/`runtimeVersion` are **unconfirmed** (no App
Store Connect or EAS access here). The runbook's last confirmed store version
is still 1.1 (September 3). Before building, read the live build number from
App Store Connect, match it to its EAS build record, and confirm the baseline
above is that record's commit.

Measured from `e4c5a80e` to `97bcd980` on an unshallowed clone:

| Area | Delta |
| --- | --- |
| History | 85 first-parent commits, 82 merged PRs (#1569–#1655), Oct 26–29 |
| Whole repository | 766 files; +46,151 / −11,199 lines |
| iOS (`eddy-ios/`) | 264 files; +10,581 / −3,568 lines |
| Shared conditions + packages | 33 files; +1,474 / −192 lines |
| API tree (`src/app/api/`) | 20 files; 2 routes added, 18 changed |
| Migrations | 7 added; all 7 recorded in production (read October 29) |

Dependencies did not change: `eddy-ios/package.json` and
`package-lock.json` are identical at both ends, as are `.easignore`,
`metro.config.js` and `plugins/`.

## Native fingerprint: moved — a new binary is required

Computed with `npx expo-updates fingerprint:generate --platform ios` from
`eddy-ios/` after a clean `npm ci` at each commit:

| Commit | Fingerprint |
| --- | --- |
| `e4c5a80e` (baseline) | `1878861fb8b0060b4a6469a667e32bcf240e3a4f` |
| `97bcd980` (candidate) | `39c237f649ddc5180e4fb91ec0d88e8619f53ac5` |

The candidates in the diff that explain it:

- `eddy-ios/app.json`: new entitlement
  `com.apple.developer.usernotifications.time-sensitive` (used by
  `src/lib/floatSessionStore.ts` for "ahead of you" reminders).
- `modules/eddy-float-recorder/ios/`: `FloatRecorder.swift`,
  `FloatJournal.swift`, `EddyFloatRecorderModule.swift` (F_FULLFSYNC journal
  sync, foreground guard on start, held journal-error status, shared
  precise-location prompt, events bridged only while JS observes).
- `modules/eddy-live-activity/`: `EddyLiveActivity.podspec` platform
  `16.4 → 18.0` (matches the app's `deploymentTarget` of 18.0),
  `EddyLiveActivityModule.swift` (dismissed vs expired, no past stale date),
  `EddyFloatActivity.swift` (accessibility-size layouts, no-distance state),
  `SupplementaryWidgetData.swift`, `EddyReportWidgets.swift`.

An EAS Update to `production` would reach binaries that lack the entitlement
and the new Swift; do not publish one for this release. Note that the
runbook's October 13 fingerprint (`7b61aec8…`, measured at `5da1a76`) differs
from the baseline's as well: something native also moved between October 13
and the October 26 bump. That is before this delta and was not investigated.

The new entitlement needs the **Time Sensitive Notifications** capability on
the App ID. EAS normally syncs capabilities from entitlements when it manages
credentials; a profile that predates it fails the build or the upload with an
entitlement mismatch. Confirm it in the Apple developer portal (or let EAS
sync it) before the first 1.5 build.

## What ships

Status is per the repository's three states. Nothing in this delta has a
ticked device gate anywhere, so every row reads "unconfirmed" for device and
release; the store state is unknown because the live version is.

| Area | Implemented (on `main`) | Device verified | Released |
| --- | --- | --- | --- |
| River Mode: distance across GPS gaps, moving time and speeds, arrival and past-take-out rules, Discard for short floats, "Stop tracking", finish action on the arrival notification, hazard report queue with withdraw, Float tools (take-out photos, keep-awake) | #1604, #1609, #1610, #1622, #1649, #1653 | Unconfirmed | Unconfirmed |
| Native recorder and Live Activity: periodic F_FULLFSYNC, foreground-only start, accessibility-size Lock Screen card, expired vs dismissed | #1604, #1653 | Unconfirmed | Unconfirmed |
| Map: statewide clustered index, numbered stacks, places list, selection layer, hazards on top, compass, public-land callouts, offline search fallback, consistent place sheets, route-first plan sheet, compact access picker | #1595, #1613, #1620–#1623, #1632–#1637, #1639, #1641, #1644, #1645 | Unconfirmed | Unconfirmed |
| Dams: Bull Shoals minimum flow labelled as such, spillway release line, tomorrow's schedule, "last checked … CT", widget-style Favorites card, upcoming generation in cards and widget | #1629–#1631, #1633, #1638, #1642, #1643, #1654, #1655 | Unconfirmed | Unconfirmed |
| Account and push: Restore while signed out, device-local sign-out, on-disk push ledger with owed release via `POST /api/device-tokens/release`, provisional-permission upgrade | #1608, #1653 | Unconfirmed | Unconfirmed (server route live) |
| Dark mode (charcoal surfaces, opaque condition badges), onboarding motion and copy, Today icon, copy polish, Camping capacity wording, alerts polish, gauge chart station calendar and universal-link restore | #1592, #1593, #1603, #1627, #1647, #1648, #1547 | Unconfirmed | Unconfirmed |

Server-side in the same delta (already deployed, Vercel builds from `main`):
Zod 4 schema migration and payment-header bounds (#1589), Next patch
dependencies (#1591), St. Francois access points, Norfork/White/Taneycomo
tailwater pilot activation behind a per-river gate (#1650, #1652), Bull Shoals
minimum-flow floor 850 cfs (#1655), gauge history station calendar and chart
share images (#1547), nationwide gauges on web maps, and the web-only pages
(Floats discovery, Find a Route, Conditions, planner). Web-only pages were not
reviewed here.

## Code review findings

The delta was reviewed by reading the code paths, not only the diff, in four
areas (float tracking, map, Today/dams/account, shared+API). Findings are
ranked; "confirmed" means the path from a real input to the wrong result was
read end to end.

### Resolution (October 29, on this branch)

Every finding below is **implemented** on `claude/beautiful-hopper-qjz8ll`;
none is device-verified. Where a closer reading changed the finding, the
row says so.

| # | Resolution | Commit |
| --- | --- | --- |
| 1 | Favorites card and widget say "Minimum flow" and draw minimum-flow hours as a baseline; packet carries `minimumFlow` additively (still v1). Swift not compiled here. | `d231fae4` |
| 2 | Past the take-out, a float ends where its movement stopped (the stop, or the last position if GPS went quiet), never before arrival; still moving at Finish keeps accruing. | `555075c3` |
| 3 | A GPS gap over two hours credits no miles; a reacquisition within the stay radius is drift. Real upstream travel across a gap still counts (distance is gross). | `555075c3` |
| 4 | An off-line take-out ends measuring at the river's end; the panel and recap read one function. | `555075c3` |
| 5 | Stacked members are hidden by a layer filter, so pin sources rebuild only when their data does; the statewide index is keyed on count-relevant layers; no national-tier pins below the zoom floor; `layerCounts` deps fixed. | `2bb19888` |
| 6 | The recording layout subscribes only to whether a float is active. | `555075c3` |
| 7 | A guest whose profile read fails sees Free plan and Go Premium; permanent accounts keep "Couldn't check". | `d231fae4` |
| 8 | A named place its river no longer lists fits the river without waiting for a sheet and says "That place is no longer listed on this river."; a slow held-access fetch cannot replace a sheet opened since; a river with no map line says so. | `2bb19888` |
| 9 | Root cause differed: the recorder does report idle, but "Your float" then read "Finding GPS". It now says "Tracking stopped" once tracking is stopped. | `555075c3` |
| 10 | Moving a push token off another account needs that row's id (the release route's proof), sent from the app's push ledger; otherwise 409 `token_held`. | `980f8c38` |
| 11 | A station the lookup does not return is unknown (no `timeZone`, served no-store), not a cached UTC answer. | `980f8c38` |
| 12 | "Connecting this iPhone…" while post-sign-in registration is in flight; a 400 to a request with `tz` is retried once without it; a response without `timeZone` draws in the phone's zone; Places rows read river and mile to VoiceOver; the public-land scrim is hidden from VoiceOver and the card is modal; a withdrawn hazard report leaves no cooldown (its impact was smaller than first reported). | `d231fae4`, `555075c3`, `2bb19888` |

Trade-offs to know: a phone that dies mid-float and is charged at the
take-out under-counts that stretch (finding 3); past the take-out, a GPS
gap of more than two minutes while still paddling ends the float at the
last position (finding 2); an old binary signing in on a phone whose token
another account still holds now gets 409 instead of taking the token
(finding 10), which was the behaviour before October 29.

### Fix before the build (confirmed, user-visible)

1. **The Favorites dam card and the Home Screen widget undo #1655 for Bull
   Shoals.** `shared/dam-widget.ts` builds the widget packet without
   `minimumFlow` on `scheduleDays[].hours`, and
   `eddy-ios/src/lib/damFavoriteDisplay.ts` derives its status from
   `generationKind` alone (`'Generating'` / `'No generation'`) instead of
   `moment.status`, which already says "Minimum flow". With Bull Shoals
   starred on a day of only minimum flow (SWPA posts ~7 MW every hour), the
   card reads "No generation" while its chart draws every hour as a full bar
   captioned "7 MW" — the "generating all day" misreading #1655 fixed on the
   dam screen. The native widget reads the same packet, so it shows the same
   bars. The dam screen, saved-place schedule and first-run card are correct.
   Fix: carry `minimumFlow` into the packet hours (additive to packet v1, so
   older binaries keep working), use `moment.status`, and draw minimum-flow
   hours the way `DayBars` does.
2. **A manual Finish after landing past the mapped take-out counts the time
   on the bank.** `eddy-ios/src/lib/floatSession.ts:523` latches
   `pastTakeOut` on one matched fix more than 0.1 mi below the take-out and
   never clears it; `floatAccount` (`:541`) then runs to `until`, which is
   `Date.now()` for a manual Finish. A paddler who lands 200 m below the
   mapped point (a long ramp, or eddying out past it), loads for 40 minutes
   and taps Finish gets a recap whose elapsed and stopped time include the
   40 minutes, and the panel's "on the water" clock runs meanwhile. The
   automatic end is unaffected (dated at `movementEndedAt`). Baseline stopped
   accounting at arrival.

### Decide (confirmed or plausible, lower impact)

3. **Gap miles across an off-river gap with no fixes**
   (`floatSession.ts:477,486`, `packages/eddy-geo/float-totals.ts:17`).
   `leftRiver` is only set by a usable fix more than 1 km off the river. Stop
   at mile 8 without Finish, drive to camp at mile 14 with the phone off,
   push off next morning: the reacquired sample adds 6 "paddled" miles,
   because implied speed over 12 hours is far under the 4 m/s bound and
   nothing auto-ends such a float. Confirmed by reading; the comments
   acknowledge the speed bound is the only guard.
4. **Panel clock and recap disagree for an off-line take-out**
   (`floatDisplay.ts:66` vs `floatSession.ts:539`): the panel rests at
   `riverEndAt`, the recap runs to Finish. New disagreement; recap matches
   baseline.
5. **Map pin sources re-uploaded on every camera stop that changes a stack**
   (`src/map/RiverMap.tsx:1433-1523`). `stackedKey` feeds all nine
   feature-collection memos, so at z10 with Camping and Other gauges on,
   each pinch that merges one pair re-serialises hundreds of features across
   the bridge. Baseline re-uploaded only on data changes. Confirmed; the
   cost is device-dependent, likely a hitch after each zoom on older phones.
   Related: `statewideIndexShape` depends on the whole `layers` array
   (`RiverMap.tsx:1576`), and below `MIN_GAUGE_ZOOM` the full 14k-station
   index is mapped to pins and uploaded to a hidden layer
   (`index.tsx:2359`, `gaugeCoverage.ts`).
6. **The whole `(recording)` stack re-renders on every GPS fix**
   (`app/(recording)/_layout.tsx:25` uses `useFloatSession()` only to test
   non-null; `useHasFloatSession()` exists for this). Confirmed perf
   regression, ~1 render/s while recording.
7. **Guests offline lose the Premium call-to-action**
   (`src/hooks/useAccount.tsx:56`, `profile.tsx:661-688`): an anonymous
   session whose profile fetch fails now shows "Couldn't check your
   subscription" and hides Go Premium; baseline showed "Free plan" and the
   button. This is what a reviewer on flaky Wi-Fi sees on a fresh install.
8. **"View on map" for an access point the river no longer returns does
   nothing, then the map flies to the whole river minutes later** when an
   unrelated sheet opens (`app/(tabs)/(map)/index.tsx:1547-1567`; the
   `fitRiver` command waits on `sheetReady`). Inherited shape, made certain
   by #1636's `answered` path. Low frequency.
9. **Tracker status stale after "Stop tracking"**
   (`floatSessionStore.ts:296` discards the status `recorder.stop` returns):
   "Your float" can read "Tracking on the X" until the next native status
   event. Plausible; River Mode itself says "Tracking stopped".
10. **`POST /api/me/device-tokens`** deletes every other account's row for
    the same Expo push token before the caller's upsert
    (`route.ts:65-69`). Anyone with a permanent account who learns a
    victim's `ExponentPushToken[...]` can unregister them from alerts.
    Server-side only; low likelihood.
11. **`stationTimeZoneForSite` can cache `'UTC'`** for a station keyed by an
    external id or outside the top-50 fuzzy hits
    (`src/lib/gauges/history-response.ts:287`, `station-time-zone.ts:27`).
    iOS always sends `tz`, so only web share charts are affected.
12. Cosmetic: the alert-completion screen can say "Connecting now…" for a
    device that is fine (`alerts/(create)/configure.tsx:570`); a 400 from
    the history route is cached as "no history" (`src/api/client.ts:1149`);
    history cached by the previous build has no `timeZone`, so the first
    open after upgrade labels times in UTC with a visible notice
    (`GaugeChart.tsx:1016`); VoiceOver rows in `MapPlacesSheet` omit the
    river · mile subtitle; the public-land callout scrim is announced as a
    second "Close" button; `hazardReportQueue.remove()` clears
    `cancelledUntil` before aborting.

Checked and sound: hooks order and post-unmount writes across the new map,
onboarding, float-mode and float-options screens; the push ledger's
register/release ordering and sign-out sequence; Restore while signed out;
`signOut({ scope: 'local' })`; archive 413 halving; the Finish notification
action; `readThrough` settle sequencing; all `me/*` routes keep
`requireUser`/`requirePermanentUser`; gauge-alert `[id]` ownership; Zod 4
schemas keep `.strict()`; payment-header limits apply before SDK parsing;
the chart-image route validates every parameter and canonicalises before
its fail-closed rate limit. Dark mode: every condition-colour caller passes
`isDark`; no light-on-light pairs were found.

Tests: no registered test was removed (24 added); assertions changed only
where copy or behaviour changed, with replacements (arrival/past-take-out,
Back/Close split, minimum flow, spillway, Central time).

## Server compatibility

The web deploys from `main`, so production already serves this delta to the
binaries installed today.

**Old binaries, new server.** No route or field was removed, renamed or made
required. One semantic change reaches installed apps: for Bull Shoals only,
`/api/dams` now sets `generationFloorCfs: 850`, flags `hours[].minimumFlow`,
and counts minimum-flow hours as idle windows. The baseline binary ignores
`minimumFlow`, so on an all-minimum-flow day it prints "No generation
scheduled: midnight – midnight" next to "Scheduled to generate all day", and
730 cfs through the turbine reads "No turbine generation observed".
Contradictory copy, no crash; the only remedy is the new binary. Also
additive or harmless: `/api/float-search/places` mixes access points into
`places` (old client treats them as towns, works); `/api/rivers/[slug]/
access-points` dropped the synthetic `campground` type (old client also reads
`npsCampground`); `/api/me/gauge-alerts` can answer 422 `no_stage` (old client
shows the message); `/api/reports` limits signed submissions per account
instead of per IP.

**New binary, old server.** Only relevant if the web is rolled back behind
`e4c5a80e`: `POST /api/float-search` with `days` or `filters` would get 400
from the baseline's strict schema (day-trip searches without filters still
work); `POST /api/device-tokens/release` would 404 and the release stays
owed and retried; `calendar=station`, `starredAt`, `timeZone`, `altLevel*`,
`readingStale`, `minimumFlow*`, `spillwayFlow`, `driveMinutes` are all
optional on the client.

No forced upgrade is needed for compatibility. `minSupportedVersion` is still
`0.0.0`; the Bull Shoals contradiction is a reason to prefer the new binary,
not to lock old ones out.

## Before the build is distributed

1. **Confirm the baseline.** Read the live build in App Store Connect, its
   EAS record's `gitCommitHash` and `runtimeVersion`, and check they are
   `e4c5a80e` and `1878861f…`. If not, re-measure this delta from the real
   commit; the fingerprint verdict (moved) can only get stronger, but the
   compatibility section can change.
2. **Enable Time Sensitive Notifications on the App ID** (or confirm EAS
   capability sync does), then build. A new binary, not an OTA update.
3. **Merge this branch before building.** Findings 1–12 are fixed here
   (see Resolution), and `main` was red until the three unregistered tests
   were added. The server fixes (findings 10, 11) deploy with the merge.
4. **Compile the widget.** Finding 1 changed Swift in the widget extension
   and `scripts/check-condition-widgets.swift`; no Swift toolchain was
   available here, so the first Xcode or EAS build is their first compile.
5. **Migrations: nothing pending.** Production recorded all seven files added
   in the delta (latest `20261029154803`) and the ledger's `[pending]` list is
   empty. `make check-db` was not run (no linked CLI credentials here); run it
   in the release environment to confirm no drift and the definer allowlist.
6. **`make check-eas-env`** in the authenticated release environment; verify
   Mapbox, Supabase, RevenueCat and Sentry names match across `preview` and
   `production`.

## Before App Store submission

1. **Device pass on the exact production-profile build**, covering the delta:
   - River Mode: a float with a deliberate GPS gap (airplane mode for 10
     minutes mid-float) shows gap distance and "GPS gap" time; moving time
     and speeds; arrival then carrying on past the take-out; manual Finish
     after landing; Discard for a sub-5-minute float; "Stop tracking" when
     the journal cannot be read; the arrival notification's Finish action;
     time-sensitive "ahead of you" reminder under a Focus mode.
   - Live Activity at an accessibility Dynamic Type size (Lock Screen card
     and expanded Island), the compact Island, the 8-hour expiry message,
     and swipe-away.
   - Native recorder: relaunch by iOS in the background after a kill, then
     a long float, then a hard power-off — the journal keeps all but the
     last minute.
   - Map: the statewide index below z8, stacks above, places list, compass
     reset, public-land tap, "View on map" from Camping and Favorites,
     offline search, plan sheet endpoint editing, access picker.
   - Dams: Bull Shoals Favorites card and widget on a minimum-flow day
     (after finding 1), tomorrow's schedule, "last checked … CT".
   - Account: Restore while signed out, sign out then sign in on the same
     device (push token re-keyed, owed release delivered), provisional
     notification permission upgraded in app, fresh install with no account
     and no network (finding 7).
   - Dark mode on every tab; onboarding at the largest text size.
2. **Trust Ledger: two open criticals** (read-only, October 29 21:00 UTC):
   `jacks-fork` threshold order (open since before October 12) and a new
   global "River data validation (SQL): reconciliation refused
   (check_error)", last seen 21:00 UTC today. Two highs: Courtois geometry
   without a gauge, and "Mammoth Spring State Park (Dam #1)" offered as a
   put-in without a launch. Resolve or record the judgement for each.
3. **Privacy.** The live `/privacy` says October 16, 2026 and matches the
   repository. The delta adds no new data category: the push ledger stores
   the device row id on disk, the time-sensitive entitlement changes
   interruption level only. Re-check the App Store Connect answers against
   `app-privacy-labels.md` for the actual binary (the 1.4 report's linked
   installation-ID and coarse-location items are still open).
4. **Reviewer visibility.** Public config now returns `floatMode: true`
   (read October 29 21:09 UTC; it was `false` on October 12), so River Mode is
   visible to the reviewer. Confirm from a production-profile cold launch and
   update the reviewer notes; backup and contributions still need Apple
   sign-in.
5. **Store metadata.** The map, dark mode, Favorites and Today changed
   visibly; existing screenshots may no longer match. `latestVersion` in
   public config is still `0.1.0`.
6. **Carried gates.** Unticked in `ios-release-runbook.md`: River Mode (27),
   Home Screen widget (16), 1.4.0 device QA (12), Vercel (11), 1.2 delta
   (10), float history and backup (8), October 12 submission blockers (5,
   of which the archive migration/API and `floatMode` items are now
   satisfied by the reads above but not ticked here), in-app browser (5),
   photo submitter bans (4), October 13 freshness (4), location lifecycle
   (3), plus the numbered sections. None closes because 1.5 exists.

## Expected reports, not automatic submission blockers

- Old binaries show contradictory Bull Shoals copy on minimum-flow days
  until they upgrade (see Server compatibility).
- History cached by the previous build labels times in UTC once, with a
  visible notice, until the next fetch.
- Owed push-token releases can be starved by the 10-per-15-minutes per-IP
  limit on `/api/device-tokens/release` behind carrier NAT; they retry on the
  next launch.
- Supabase security advisors (October 29): no ERROR-level items; the WARNs
  are the anonymous-sign-in pattern on every RLS table (by design), two
  `is_admin` definer functions executable by `anon`/`authenticated`, one
  mutable `search_path` (`update_inbound_emails_updated_at`), and leaked
  password protection off. None is new to this delta.

## Validation and what was not verified

On Node 20.20.0 after `./bootstrap.sh`:

- After the fixes on this branch, `make check-web` passed **4,330 of 4,330**
  tests, and `make check-mobile` and `make bundle-mobile` passed (lint
  warnings 27 → 26, no errors; 780-file, 12.75 MB archive allowlist ok).
- `make check-web` on `97bcd980`: typecheck and lint passed; **1 of 4,301
  registered tests failed**: `src/lib/trust/registered-tests.test.ts`, because
  PR #1653 (commit `24c31acc`) added `float-activity-visibility.test.ts`,
  `float-hazard-data.test.ts` and `hazard-report-position.test.ts` without
  listing them in the web `test` script, so they never ran. `main` is red on
  this check. This pass registers them (all 14 of their tests pass) and
  reruns `make check-web`; the result is recorded in the commit that carries
  this report.
- `make check-mobile`: typecheck and lint passed. `make bundle-mobile`:
  production bundle exported (12 MB Hermes bundle) and the `.easignore`
  allowlist check passed (780 files, 12.73 MB archive; every Metro-resolved
  path present, no secrets or media).
- Fingerprints were computed at both commits in this container (clean
  `npm ci` per worktree); the shipped side was not read from EAS.

Not verified: no native archive, simulator, physical device, TestFlight, App
Store Connect, EAS build record or environment parity, RevenueCat offering,
Sentry, or Apple developer portal capability state was inspected. No
authenticated Expo session exists here. `make check-db` was not run (needs
linked CLI credentials; the connector reads below do not replace it). No
production write, build, submission, flag change or OTA was made. Web-only
pages, data-ingestion scripts and ClipEngine changes in the delta were not
reviewed.

Production reads on October 29, 2026 were **read-only**:

- 21:09 UTC `GET https://eddy.guide/api/app-config` → `minSupportedVersion
  "0.0.0"`, `latestVersion "0.1.0"`, `floatMode true`, `push true`.
- 21:09 UTC `GET /.well-known/apple-app-site-association` → 200 JSON,
  `D4U38CY2HK.eddy.guide.app`, `/plan/*`.
- 21:19 UTC `GET /privacy` → "Last updated: October 16, 2026".
- 21:19 UTC `POST /api/device-tokens/release` with `{}` → 400 (route
  deployed); `GET /api/me/float-archive` unauthenticated → 401 (deployed;
  404 on October 12).
- 21:19 UTC `GET /api/dams` → Bull Shoals carries
  `minimumFlowThroughTurbine: true`, `generationFloorCfs: 850`.
- Supabase project `ilefwfpvphadsbptiaur`: migration list (matches the
  ledger through `20261029154803`), security advisors, and one query of
  `trust_findings` for open critical/high rows. No account, token, trip or
  report rows were read.
