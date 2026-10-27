# App Privacy labels — answers for App Store Connect

The App Privacy questionnaire asks what the app collects, why, and whether it is
linked to identity. Answering it from memory at submission time is how labels
end up wrong, and a label that overstates is as much of a problem as one that
understates — Apple treats a mismatch between the questionnaire and observed
traffic as grounds for rejection or removal.

So this file records the answer for each category **and the code that makes it
true**. If a data flow changes, this file changes with it and the labels are
re-checked.

Scope: the iOS app (`eddy-ios/`). The website's own analytics are covered by the
privacy policy, not by these labels.

---

## Summary

Prepared for float-history/account-backup release, October 12, 2026. These are
repository answers, not confirmation that App Store Connect has been updated.
Apply and verify the questionnaire before the new binary is submitted.

| Category | Collected | Linked to identity | Tracking |
| --- | --- | --- | --- |
| Contact Info → Email Address | Yes | Yes | No |
| Identifiers → User ID | Yes | Yes | No |
| Purchases → Purchase History | Yes | Yes | No |
| User Content → Photos or Videos | Yes | Yes | No |
| User Content → Other User Content | Yes | Yes | No |
| User Content → Customer Support | Yes | Yes | No |
| Diagnostics → Crash Data | Yes | Yes, via SDK installation ID | No |
| Diagnostics → Other Diagnostic Data | Yes | Yes, via SDK installation ID | No |
| Location → Precise Location | Yes | Yes | No |
| Location → Coarse Location | Yes | Verify provider/log linkage before publishing | No |
| Identifiers → Device ID | Yes | Yes | No |

Coarse Location linkage is an open release check, not an answer ready to paste.
The forecast endpoint retains rounded coordinate cache keys for up to one hour;
this is more than processing solely to answer the current request. Check hosting,
weather-provider and diagnostic payloads for identifiers before choosing its
linkage answer. Do not mark all remaining categories uncollected until the
submitted binary's SDK payloads and privacy report have been checked.

**Tracking: No.** Answer "No" to the tracking question and do not add
`NSUserTrackingUsageDescription`. There is no advertising, no IDFA, no ad SDK,
and no sharing with data brokers. The one third-party SDK that collects on its
own behalf by default is Mapbox, and the app turns that off — see Location.

---

## Contact Info → Email Address

**Collected, linked to identity. Purpose: App Functionality (including customer support).**

Two sources:

- Sign in with Apple returns an address, which may be a private relay address if
  the user chose to hide it. Stored by Supabase auth.
- The in-app feedback sheet **requires** an address so a reply can be sent
  (`src/components/FeedbackSheet.tsx` rejects an empty one). It is prefilled from
  the session when there is one.

Not used for tracking, not used for advertising, not sold.

## Identifiers → User ID

**Collected, linked to identity. Purposes: App Functionality; Analytics for
opted-in completed-float summaries.**

The Supabase user id. An anonymous account is created on first launch. Linking
a new Apple identity upgrades it in place; signing into an existing Apple-linked
account can switch user ids. Guest float history is adopted into the signed-in
account. Its opt-in summaries are used for Analytics as well as App Functionality.

The same id is RevenueCat's `appUserID` (`src/lib/purchases.ts`), which is why
purchases require a signed-in account: an entitlement bought under an anonymous
id is stranded by the next reinstall.

### Identifiers → Device ID

The app sends an **Expo push token** plus the device model name to
`/api/me/device-tokens` (`src/lib/push.ts`). It identifies an app installation
and is stored against the account. Sentry also supplies a persistent SDK
installation ID in diagnostic events.

**Collected, linked to identity. Purpose: App Functionality.** Apple's definition
includes other device-level IDs, not only IDFA/IDFV. An installation identifier
does not need to reveal someone's name to fall under this category. No tracking.

## Purchases → Purchase History

**Collected, linked to identity. Purpose: App Functionality.**

Subscription state: which product, active or not, renewal/expiry, billing
problems. Arrives through RevenueCat and Apple. **No payment details ever reach
Eddy** — Apple takes the payment and reports only whether access should be
granted.

## User Content → Photos or Videos

**Collected, linked to identity. Purpose: App Functionality.**

Community river photos submitted from `src/components/PhotoSubmitSheet.tsx`.

Two facts worth having ready for review:

- **Location metadata is stripped.** The server re-encodes every upload with
  sharp before storing it, which drops all EXIF including GPS. The coordinate
  stored alongside a photo is the **access point the user selected**, not the
  phone's position.
- **Every photo is moderated before it is public.** Uploads land in a private
  quarantine bucket with `pending` status and are reviewed by a human before
  anyone else can see them.
- **Submitting requires Sign in with Apple** (App Store Guideline 1.2). The
  report is filed with the account's `user_id`, so a moderator can ban the
  submitter from `/admin/reports` (Ban submitter). The ban also stores a SHA-256
  hash of the Apple `sub` in `banned_submitters` and survives account deletion;
  the privacy policy discloses that. Website submissions remain anonymous.

## User Content → Other User Content

**Collected, linked to identity. Purpose: App Functionality.**

Feedback message text, photo descriptions and optional submitter name, manual
gauge readings, favorites, alert rules, and private saved-route collections and
completed-float summaries synced through `/api/me/float-archive` for signed-in
users. Shared plan links use `/api/plan/save` and remain a separate feature.

Completed summaries include the route, date/times, boat type if supplied,
tracked distance, moving/stopped/unobserved time, pace, arrival status and a
historical gauge reading when available. **Purposes: App Functionality and,
for trips contributed with the optional setting, Analytics.** Contributions
remain account linked; do not label them anonymous. The setting defaults off,
affects newly completed floats, and can be withdrawn without losing backup.

## Diagnostics → Crash Data

**Collected, linked to identity through a device/installation ID.
Purpose: App Functionality.** Also disclose **Other Diagnostic Data** for handled
errors and diagnostic context. No advertising or tracking.

Sentry configuration limits data but does not make it unlinked:

- `sendDefaultPii: false` and `tracesSampleRate: 0` (`src/lib/monitoring.ts`).
- `Sentry.setUser` is never called anywhere in the app.
- JavaScript error text and custom diagnostic extras are redacted on the device
  for emails, tokens, UUIDs and coordinate pairs (`src/lib/redact.ts`, applied
  by `src/lib/scrub-event.ts`). These hooks do not prove that every native SDK
  event or HTTP breadcrumb is scrubbed.

The installed `@sentry/react-native` implementation, `ios/RNSentry.mm` in
`fetchNativeDeviceContexts`, supplies `PrivateSentrySDKOnly.installationID` as
`user.id` when no user is configured. Its DeviceContext integration attaches
that user to events. Eddy's scrubber does not remove it. `sendDefaultPii: false`
and never calling `setUser` are therefore insufficient for a "not linked" answer.

Apple sign-in diagnostics now record only that the identity changed and whether
the previous account was a guest; no full ID or searchable prefix is included.
Before submission inspect both a handled JS error and a native crash from the
actual binary, plus release-health events and network breadcrumbs. Confirm the
diagnostic/location categories against what is actually sent.

## User Content → Customer Support

**Collected, linked to identity. Purpose: App Functionality.** In-app feedback
includes an email address and support text. Customer Support is a data type;
it is not a separate purpose option in Apple's questionnaire.

## Location → Precise Location

**Collected, linked to identity. Purposes: App Functionality; Analytics for
opted-in completed-float summaries. No tracking.**

- Nearby sorting and River Mode use GPS on the device. River Mode requests
  When In Use permission only; Eddy never requests Always. While a float is
  running, a Core Location background activity session keeps recording with
  the phone locked and shows the blue location indicator (ADR 0014).
  `app.json` enables the location background mode for that session. Ending
  stops recording. If iOS ends Eddy mid-float, iOS relaunches it to resume the
  session (device-unconfirmed). A float left running ends itself an hour after
  reaching the take-out (once confirmed positions stop moving downstream past
  it) or 45 minutes after leaving the river.
- Raw River Mode positions stay on the phone: each float's GPS track is kept
  in a local file, excluded from iCloud and device backups, never uploaded,
  and deleted with that float's recap or with the account (ADR 0014). Pace
  samples, tracker state and the river-line copy are removed when ending is
  durably saved. The account
  backup contains a summary, including route endpoints and first/last river mile
  with exact times. A route and mile can locate someone precisely even without
  uploading latitude/longitude. Treat these summaries as linked location data.
- Hazard reports (`src/lib/hazardReportQueue.ts`) transmit the captured GPS
  location, accuracy and time to `/api/reports` following an explicit report.
  That request is currently unauthenticated: do not claim this path itself is
  account linked. It still collects precise location; optional submission is
  not a blanket exemption from disclosure.
- Local weather sends coordinates rounded to 0.05 degrees to Eddy. The forecast
  route caches those coordinate keys for up to one hour. Disclose Coarse Location
  for App Functionality; complete the linkage check described above.
- Mapbox telemetry is disabled in `src/map/runtime.ts`. Tile requests still
  disclose IP address and viewport to Mapbox. Diagnostic scrubbing redacts
  coordinates before sending events to Sentry.

Backup is authenticated and serves app functionality. The contribution setting
permits internal analysis of the same records; it creates no separate upload
and does not share trips with outfitters or advertising networks. No ATT prompt
is introduced by these features.

---

## Reviewer notes — paste into App Store Connect

> **Browsing and local history work without sign-in.** Eddy creates an
> anonymous account on launch and every browsing feature — rivers, live gauge
> readings, hazards, access points, and the full float-plan calculator — works
> without signing in. **Sign in with Apple is required to review account backup,
> recovery, optional contributions, and subscriptions.** Use the sign-in action
> in Floats › Float history & backup or Profile. No Eddy password is required.
>
> **The paywall shows no purchase controls until Sign in with Apple completes.**
> This is deliberate and not a bug. Subscriptions are keyed to the account id, so
> a purchase made under an anonymous account would be stranded the moment the app
> is reinstalled and a new anonymous id issued — the user would lose the
> subscription they paid for with no way to restore it. Signing in first is what
> makes Restore Purchases work across reinstalls and devices. Restore Purchases
> is available on the paywall and in Profile.
>
> **Location is requested in context, never on launch.** River Mode uses
> location to show progress to a chosen take-out. It asks for When In Use
> permission only; a float continues while the phone is locked in a dry bag
> through a background activity session, shown by the blue location
> indicator. Ending a float stops tracking, and a float left running ends
> itself after the take-out is reached or the paddler leaves the river.
> Raw float positions stay on the phone. Signed-in users back up trip summaries,
> including route and times, and can optionally contribute them to improve
> estimates. Hazard reports send the location and time of the submitted hazard;
> weather requests send rounded coordinates.
>
> **To review River Mode:** open Floats › Start Float, select a supported river
> from the full list (nearby suggestions are optional), choose a take-out, and
> start. Precise location is required for tracking; no other permission is
> requested. Away from a
> supported river, progress/pace can remain unavailable; that is expected.
> Ending the float still creates a recap and stops tracking. An attached field
> recording demonstrates on-river progress and locked-phone tracking; it is not
> a substitute for access to the feature in this build.
>
> **Float history is under Floats › Float history & backup.** A recap is saved
> when a float ends, works locally without an account, and is recoverable after
> Apple sign-in when backed up. Delete a recap from its detail screen. The
> estimate-improvement setting defaults off and is independent of backup.
> Turning contributions off excludes
> previously contributed trips from future analysis while preserving backup.
>
> **Account deletion is in the app**: Profile › Delete account. It takes effect
> immediately and removes the account, private saved floats, float history,
> contribution preference, favorites, alert rules, and
> registered devices. The screen states that it does not cancel an active
> subscription, since Apple manages billing.
>
> **User-generated content is moderated before publication.** Community river
> photos are uploaded to a private bucket with `pending` status and are reviewed
> by a person before they become visible to anyone else. Location metadata is
> stripped from every upload server-side. Every published photo has a Report
> control. Submitting a photo requires Sign in with Apple, and moderators can
> ban an abusive account, which removes all of its photos and blocks further
> submissions. Contact: the support email in Profile.
>
> **Safety disclaimers** appear wherever conditions or float times are shown.
> The app refuses to estimate a float time in dangerous water rather than
> printing a number.

**Operator checks before pasting:** verify production `features.floatMode` is
true and account flows work in this exact build; attach the field recording
referenced above. Verify that an App Review Apple account can complete sign-in
and sandbox purchases. If it cannot, arrange Apple-accepted review access before
submission; do not state that all features can be reviewed without signing in.
Use the actual Delete account/Delete my data label for the account state tested.

## Apple references (checked October 12, 2026)

- [App Privacy definitions and linkage](https://developer.apple.com/app-store/app-privacy-details/)
- [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):
  2.1 (complete, accessible app), 2.3.1 (specific reviewer notes),
  2.5.4 (background services), 5.1.1 (privacy and deletion).
- [Account deletion and Apple token revocation](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)

---

## When to revisit this file

Any of these changes the answers above:

- Adding analytics or advertising, or sharing data across companies; reassess
  collection, purposes and Apple’s tracking definition for the actual flow.
- Sending a coordinate to any server, for any reason.
- Calling `Sentry.setUser`, or enabling `sendDefaultPii` / tracing.
- Requesting Always location, adding another background mode, or sending a
  float's raw GPS track off the phone.
- Re-enabling Mapbox telemetry, or adding a maps SDK that collects by default.
- Collecting health, financial, browsing, or contacts data — none is collected
  today.
