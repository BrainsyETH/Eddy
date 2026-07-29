# Eddy for iOS — release runbook

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
| `SENTRY_DSN` | web errors go to `ERROR_WEBHOOK_URL` if set, otherwise nowhere |
| `APPLE_TEAM_ID` | Apple token revocation is skipped — see below |
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
- [ ] The key is an **App Store Connect key with Sign in with Apple enabled**
      (Certificates → Keys), not an APNs key. They look identical on disk.
- [ ] Migration `00211_apple_refresh_tokens.sql` applied.

Verify end to end, in sandbox, before submission — this path cannot be exercised
from a checkout:

- [ ] Sign in with Apple on device, then check `apple_refresh_tokens` has a row
      for that user.
- [ ] Delete the account in-app; the row goes and the Apple ID no longer lists
      Eddy under Settings → Sign in with Apple.
- [ ] Deliberately break `APPLE_TEAM_ID` and delete another account: **the
      deletion must still succeed.** A revocation failure logs and proceeds by
      design — a person's ability to delete their account must not depend on
      Apple's uptime.

## 5 · Supabase

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

```bash
cd eddy-ios
eas build --profile preview --platform ios     # internal distribution
eas build --profile production --platform ios  # App Store, autoIncrement
```

- [ ] `make check` green at the repo root first — the bundle step there is what
      catches Metro/EAS breakage that is invisible in dev.
- [ ] Build succeeds.

**Expect the first one to fail.** No native archive has ever been produced from
this repo, so prebuild, autolinking, the Mapbox pod and the Sentry config plugin
all run for the first time. That is a normal cost, not a symptom.

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
- [ ] App Privacy nutrition labels, age rating.
- [ ] Screenshots (6.9" and 6.5").
- [ ] **Reviewer notes** covering the two things that otherwise read as broken:
      the app is anonymous-first so no demo account is needed to browse, but the
      paywall deliberately renders no purchase controls until Sign in with Apple
      completes; and location is only ever requested on an explicit tap.

### Privacy manifest

Do not add speculative declarations. Expo and the native dependencies ship
their own `PrivacyInfo.xcprivacy`, though Apple does not always merge manifests
from static pods correctly. Inspect the built archive, and treat an
**ITMS-91053** email as the signal — it is a delay, not a rejection.

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
