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

| Category | Collected | Linked to identity | Tracking |
| --- | --- | --- | --- |
| Contact Info → Email Address | Yes | Yes | No |
| Identifiers → User ID | Yes | Yes | No |
| Purchases → Purchase History | Yes | Yes | No |
| User Content → Photos or Videos | Yes | Yes | No |
| User Content → Other User Content | Yes | Yes | No |
| Diagnostics → Crash Data | Yes | **No** | No |
| Location | **Not collected** | — | — |
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

The Supabase user id. Created anonymously on first launch and **upgraded in
place** when someone signs in with Apple, so it is the same id before and after
— nothing is migrated because nothing moves.

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
gauge readings, and the float plans / favorites / alert rules synced to
`/api/me/*` for signed-in users.

## Diagnostics → Crash Data

**Collected, NOT linked to identity. Purpose: App Functionality.**

Sentry. What makes "not linked" true rather than aspirational:

- `sendDefaultPii: false` and `tracesSampleRate: 0` (`src/lib/monitoring.ts`).
- `Sentry.setUser` is never called anywhere in the app.
- Every event is redacted **on the device** before sending — emails, bearer
  tokens, JWTs, hex blobs, key=value secrets, and coordinate pairs
  (`src/lib/redact.ts`, applied by `src/lib/scrub-event.ts`).

Note: the app does log a Supabase user id in one diagnostic breadcrumb when an
Apple sign-in changes the account id. If Apple's reviewer or a future audit
treats that as linkage, the honest fix is to drop that field rather than to
re-answer this question.

## Location — **not collected**

This is the answer most worth being able to defend, because the app does ask for
location permission. The chain:

1. **It never leaves the device.** `src/hooks/useLocation.ts` resolves a
   position and uses it on-device to sort put-ins nearest-first and to sort
   search results by distance. Nothing posts it. The permission string says so.
2. **It is only ever requested on an explicit tap** — the locate button on the
   map, the compass in the search field. Never on launch.
3. **No background location.** `isIosBackgroundLocationEnabled: false`, no
   background modes, and the `NSLocationAlwaysAndWhenInUse` string has been
   removed from `app.json` because nothing requests Always authorization.
4. **Mapbox telemetry is off.** `Mapbox.setTelemetryEnabled(false)` runs in
   `src/map/runtime.ts` before any map view mounts. Without this, the Mapbox SDK
   would collect its own location-adjacent telemetry by default and this answer
   would be wrong.
5. **Coordinates are redacted from crash reports** (see Diagnostics), so they
   cannot reach Sentry inside an error message either.

What Mapbox does still receive is the **IP address and map viewport** of any
tile request, which approximates a location the way any web request does. That
is disclosed in the privacy policy under Service Providers. It is not
app-collected location data.

---

## Sign-In Information — leave "Sign-in required" UNCHECKED

Not an oversight, and worth stating here because the field invites the opposite.

**Eddy has no username-and-password login.** Sign in with Apple is the only
sign-in method in the app: `useSession` exposes `signInWithApple`, which goes
through `signInWithIdToken`, plus `signInAnonymously` for the background
session. There is no email/password form anywhere, and no field a reviewer
could type a demo credential into.

So filling that box in is worse than leaving it empty. A reviewer given
credentials with nowhere to enter them files it as a defect, and the round trip
costs a review cycle. Uncheck the box and let the notes below explain it — which
is the standard arrangement for a Sign in with Apple-only app, because Apple's
own policy is what makes a demo account impossible.

## Reviewer notes — paste into App Store Connect

> **Eddy uses Sign in with Apple only, so no demo account can be provided —
> and none is needed.** There is no username/password login in the app. Eddy is
> anonymous-first: it creates an anonymous account on launch, and every browsing
> feature — rivers, live gauge readings, hazards, access points, community
> photos, and the full float-plan calculator — works without signing in at all.
> The two features that do require an account (creating an alert, and
> purchasing) use Sign in with Apple with the Apple ID already on the device.
>
> **The paywall shows no purchase controls until Sign in with Apple completes.**
> This is deliberate and not a bug. Subscriptions are keyed to the account id, so
> a purchase made under an anonymous account would be stranded the moment the app
> is reinstalled and a new anonymous id issued — the user would lose the
> subscription they paid for with no way to restore it. Signing in first is what
> makes Restore Purchases work across reinstalls and devices. Restore Purchases
> is available on the paywall and in Profile.
>
> **Location is only ever requested on an explicit tap** — the locate button on
> the map, or the "near me" chip — never on launch. Coordinates are used on the
> device to sort nearby put-ins and are never transmitted to our servers.
>
> **Account deletion is in the app**: Profile › Delete account. It takes effect
> immediately and removes the account, saved floats, favorites, alert rules, and
> registered devices. The screen states that it does not cancel an active
> subscription, since Apple manages billing.
>
> **User-generated content is moderated before publication, and reportable
> after it.** Community river photos are uploaded to a private bucket with
> `pending` status and are reviewed by a person before they become visible to
> anyone else; location metadata is stripped from every upload server-side.
> Every published photo also carries a **Report** control beneath it (river
> screen › "What it looks like"), which files the photo's id directly to our
> moderation queue as its own report class so it can be unpublished without a
> reply. Our Terms state that Eddy has no tolerance for objectionable content or
> abusive users, name both reporting routes, and reserve the right to bar a
> submitter: https://eddy.guide/terms
>
> **Safety disclaimers** appear wherever conditions or float times are shown.
> The app refuses to estimate a float time in dangerous water rather than
> printing a number.

---

## When to revisit this file

Any of these changes the answers above:

- Adding an analytics or advertising SDK (would likely make Tracking "Yes").
- Sending a coordinate to any server, for any reason.
- Calling `Sentry.setUser`, or enabling `sendDefaultPii` / tracing.
- Requesting Always location or adding a background mode.
- Re-enabling Mapbox telemetry, or adding a maps SDK that collects by default.
- Collecting health, financial, browsing, or contacts data — none is collected
  today.
