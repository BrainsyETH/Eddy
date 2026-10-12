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
| Diagnostics → Crash Data | Yes | **No** | No |
| Location → Precise Location | Yes | Yes | No |
| Identifiers → Device ID | See note below | — | No |
| Everything else | Not collected | — | — |

**Tracking: No.** Answer "No" to the tracking question and do not add
`NSUserTrackingUsageDescription`. There is no advertising, no IDFA, no ad SDK,
and no sharing with data brokers. The one third-party SDK that collects on its
own behalf by default is Mapbox, and the app turns that off — see Location.

---

## Contact Info → Email Address

**Collected, linked to identity. Purposes: App Functionality, Customer Support.**

Two sources:

- Sign in with Apple returns an address, which may be a private relay address if
  the user chose to hide it. Stored by Supabase auth.
- The in-app feedback sheet **requires** an address so a reply can be sent
  (`src/components/FeedbackSheet.tsx` rejects an empty one). It is prefilled from
  the session when there is one.

Not used for tracking, not used for advertising, not sold.

## Identifiers → User ID

**Collected, linked to identity. Purpose: App Functionality.**

The Supabase user id. An anonymous account is created on first launch. Linking
a new Apple identity upgrades it in place; signing into an existing Apple-linked
account can switch user ids. Guest float history is adopted into the signed-in
account. Its opt-in summaries are used for Analytics as well as App Functionality.

The same id is RevenueCat's `appUserID` (`src/lib/purchases.ts`), which is why
purchases require a signed-in account: an entitlement bought under an anonymous
id is stranded by the next reinstall.

### Identifiers → Device ID (judgement call)

The app sends an **Expo push token** plus the device model name to
`/api/me/device-tokens` (`src/lib/push.ts`). A push token identifies an app
installation, not a device or a person, and is rotated and revoked by the OS.

Apple's "Device ID" category is written for durable hardware/vendor identifiers
(IDFV, IDFA), which this is not. Declaring it under **Identifiers → User ID**
(it is stored against the account) with the push token described in the privacy
policy is the accurate reading. If a reviewer asks, the answer is that no
hardware identifier is read or stored.

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

**Collected, NOT linked to identity. Purpose: App Functionality.**

Sentry. What makes "not linked" true rather than aspirational:

- `sendDefaultPii: false` and `tracesSampleRate: 0` (`src/lib/monitoring.ts`).
- `Sentry.setUser` is never called anywhere in the app.
- Every event is redacted **on the device** before sending — emails, bearer
  tokens, JWTs, hex blobs, key=value secrets, and coordinate pairs
  (`src/lib/redact.ts`, applied by `src/lib/scrub-event.ts`).

Note: the one diagnostic breadcrumb that mentioned account ids — fired when an
Apple sign-in changes the user id — now carries only the first eight characters
of each id (`src/hooks/useSession.tsx`). The full UUIDs used to slip past the
redaction (its hex rule wants 32+ contiguous characters, which a dashed UUID
never is), which contradicted the "not linked to identity" answer above. A
truncated prefix still answers "did the id change" and gives the backend
something to search on without being an account identifier.

## Location → Precise Location

**Collected, linked to identity. Purposes: App Functionality; Analytics for
opted-in completed-float summaries. No tracking.**

- Nearby sorting and Float Mode use GPS on the device. Float Mode requests
  foreground permission when started and offers Always permission for tracking
  while locked. `app.json` enables background location. Ending stops tracking.
- Raw Float Mode positions, pace samples, tracker state and the river-line copy
  stay on the phone and are removed when ending is durably saved. The account
  backup contains a summary, including route endpoints and first/last river mile
  with exact times. A route and mile can locate someone precisely even without
  uploading latitude/longitude. Treat these summaries as linked location data.
- Hazard reports (`src/lib/hazardReportQueue.ts`) transmit the captured GPS
  location, accuracy and time to `/api/reports` following an explicit report.
  That request is currently unauthenticated: do not claim this path itself is
  account linked. It still collects precise location; optional submission is
  not a blanket exemption from disclosure.
- Local weather sends coordinates rounded to 0.05 degrees to Eddy. It does not
  send Float Mode's position trace. Check retention of request/security logs
  when completing Apple's separate Coarse Location question.
- Mapbox telemetry is disabled in `src/map/runtime.ts`. Tile requests still
  disclose IP address and viewport to Mapbox. Diagnostic scrubbing redacts
  coordinates before sending events to Sentry.

Backup is authenticated and serves app functionality. The contribution setting
permits internal analysis of the same records; it creates no separate upload
and does not share trips with outfitters or advertising networks. No ATT prompt
is introduced by these features.

---

## Reviewer notes — paste into App Store Connect

> **No demo account is needed.** Eddy is anonymous-first: the app creates an
> anonymous account on launch and every browsing feature — rivers, live gauge
> readings, hazards, access points, and the full float-plan calculator — works
> without signing in. Sign in with Apple is offered but never required to
> evaluate the app.
>
> **The paywall shows no purchase controls until Sign in with Apple completes.**
> This is deliberate and not a bug. Subscriptions are keyed to the account id, so
> a purchase made under an anonymous account would be stranded the moment the app
> is reinstalled and a new anonymous id issued — the user would lose the
> subscription they paid for with no way to restore it. Signing in first is what
> makes Restore Purchases work across reinstalls and devices. Restore Purchases
> is available on the paywall and in Profile.
>
> **Location is requested in context, never on launch.** Float Mode uses
> location to show progress to a chosen take-out. Always permission lets it
> continue while the phone is locked in a dry bag; ending a float stops tracking.
> Raw float positions stay on the phone. Signed-in users back up trip summaries,
> including route and times, and can optionally contribute them to improve
> estimates. Hazard reports send the location and time of the submitted hazard;
> weather requests send rounded coordinates.
>
> **Float history is under Floats › Float history & backup.** A recap is saved
> when a float ends, works locally without an account, and is recoverable after
> Apple sign-in when backed up. Delete a recap from its detail screen. The
> estimate-improvement setting defaults off and is independent of backup.
> For review, confirm that the Float Mode server flag is enabled for this build.
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
> stripped from every upload server-side.
>
> **Safety disclaimers** appear wherever conditions or float times are shown.
> The app refuses to estimate a float time in dangerous water rather than
> printing a number.

---

## When to revisit this file

Any of these changes the answers above:

- Adding analytics or advertising, or sharing data across companies; reassess
  collection, purposes and Apple’s tracking definition for the actual flow.
- Sending a coordinate to any server, for any reason.
- Calling `Sentry.setUser`, or enabling `sendDefaultPii` / tracing.
- Requesting Always location or adding a background mode.
- Re-enabling Mapbox telemetry, or adding a maps SDK that collects by default.
- Collecting health, financial, browsing, or contacts data — none is collected
  today.
